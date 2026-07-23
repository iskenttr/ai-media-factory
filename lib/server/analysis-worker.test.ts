import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it, vi } from "vitest";

describe("analysis worker without an external model", () => {
  let directory: string | undefined;

  afterEach(async () => {
    if (directory) {
      await rm(directory, { recursive: true, force: true });
    }
    delete process.env.AMF_STORAGE_DIR;
    delete process.env.AMF_DATABASE_PATH;
    delete process.env.FFMPEG_PATH;
    delete process.env.FFPROBE_PATH;
    delete process.env.WHISPER_CPP_BIN;
    delete process.env.WHISPER_MODEL_PATH;
    vi.resetModules();
  });

  it("emits real local media events and explicit unavailable model events", async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "amf-worker-"));
    process.env.AMF_STORAGE_DIR = directory;
    process.env.AMF_DATABASE_PATH = path.join(directory, "events.sqlite");
    process.env.FFMPEG_PATH = "ffmpeg";
    process.env.FFPROBE_PATH = "ffprobe";
    delete process.env.WHISPER_CPP_BIN;
    delete process.env.WHISPER_MODEL_PATH;
    vi.resetModules();

    const sourcePath = path.join(directory, "source.mp4");
    const generated = spawnSync(
      process.env.FFMPEG_PATH,
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=white:s=640x360:d=1.2",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=1.2",
        "-shortest",
        "-c:v",
        "mpeg4",
        "-c:a",
        "aac",
        sourcePath,
      ],
      { encoding: "utf8" },
    );
    expect(generated.status, generated.stderr).toBe(0);

    const bytes = await readFile(sourcePath);
    const [{ AnalysisStore }, { runWorkerOnce }] = await Promise.all([
      import("./store"),
      import("./analysis-worker"),
    ]);
    const store = new AnalysisStore(process.env.AMF_DATABASE_PATH);
    const createdAt = new Date().toISOString();
    store.createUploadSession({
      id: "real-upload",
      ownerHash: "owner",
      uploadTokenHash: "token",
      fileName: "source.mp4",
      declaredSize: bytes.length,
      declaredMime: "video/mp4",
      createdAt,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const jobId = store.verifyUploadAndCreateJob({
      uploadId: "real-upload",
      sourcePath,
      actualSize: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      verifiedMime: "video/mp4",
    });

    expect(await runWorkerOnce(store, "test-worker")).toBe(true);
    const events = store.getCurrentAttemptEvents(jobId);
    expect(events.map((event) => event.type)).toEqual([
      "upload_received",
      "media_metadata_ready",
      "audio_extracted",
      "language_detected",
      "speaker_analysis_completed",
      "pacing_analysis_completed",
      "speech_quality_assessed",
      "content_profile_completed",
      "analysis_completed",
    ]);

    const metadata = events.find((event) => event.type === "media_metadata_ready");
    expect(metadata?.payload).toMatchObject({
      availability: "available",
      width: 640,
      height: 360,
      audioPresent: true,
    });
    for (const type of [
      "language_detected",
      "speaker_analysis_completed",
      "pacing_analysis_completed",
      "content_profile_completed",
    ] as const) {
      const event = events.find((candidate) => candidate.type === type);
      expect(event?.payload).toMatchObject({
        availability: "unavailable",
        reason: "model_not_configured",
      });
    }
    const completed = events.find((event) => event.type === "analysis_completed");
    expect(completed?.payload).toMatchObject({ readiness: "blocked" });
    expect(store.getLocalizationPlan(jobId, 1, "localization-plan-v2")).toMatchObject({
      status: "blocked",
      requiredCapabilities: expect.arrayContaining(["source_language", "timestamped_transcript"]),
      unavailableCapabilities: expect.arrayContaining(["speaker_analysis", "content_profile"]),
    });
    store.close();
  }, 20_000);
});
