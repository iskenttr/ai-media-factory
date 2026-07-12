// @vitest-environment node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { DECISION_ENGINE_VERSION } from "@/lib/decision-engine/decision-engine";

const realVideoPath = process.env.AMF_REAL_E2E_VIDEO_PATH;
const runRealE2E = Boolean(realVideoPath);

describe("AI analysis core real-video end to end", () => {
  let directory: string | undefined;

  afterEach(async () => {
    const { closeAnalysisStore } = await import("@/lib/server/store");
    closeAnalysisStore();
    if (directory) await rm(directory, { recursive: true, force: true });
    for (const key of [
      "AMF_STORAGE_DIR", "AMF_DATABASE_PATH", "FFMPEG_PATH", "FFPROBE_PATH",
      "WHISPER_CPP_BIN", "WHISPER_MODEL_PATH", "WHISPER_CPP_NO_GPU",
      "PYANNOTE_PYTHON", "PYANNOTE_MODEL_PATH",
    ]) delete process.env[key];
    vi.resetModules();
  });

  it.runIf(runRealE2E)("persists and replays observations from real local models", async () => {
    // Docker-based local providers can only bind-mount paths shared with Colima.
    directory = await mkdtemp(path.join(process.cwd(), "work", "sprint-4.1", "amf-real-e2e-"));
    process.env.AMF_STORAGE_DIR = directory;
    process.env.AMF_DATABASE_PATH = path.join(directory, "analysis.sqlite");
    process.env.FFMPEG_PATH = "/usr/local/bin/ffmpeg";
    process.env.FFPROBE_PATH = "/usr/local/bin/ffprobe";
    process.env.WHISPER_CPP_BIN = path.resolve("work/whisper.cpp/build/bin/whisper-cli");
    process.env.WHISPER_MODEL_PATH = path.resolve("storage/models/whisper.cpp/ggml-small.bin");
    process.env.WHISPER_CPP_NO_GPU = "1";
    process.env.PYANNOTE_PYTHON = path.resolve("scripts/pyannote-docker");
    process.env.PYANNOTE_MODEL_PATH = path.resolve("storage/models/pyannote-speaker-diarization-community-1");
    vi.resetModules();

    const sample = await readFile(realVideoPath!);
    const [{ POST: createUpload }, { PUT: uploadContent }, { GET: streamEvents }, { runWorkerOnce }, { getAnalysisStore }] =
      await Promise.all([
        import("./uploads/route"),
        import("./uploads/[uploadId]/content/route"),
        import("./analysis/jobs/[jobId]/events/route"),
        import("@/lib/server/analysis-worker"),
        import("@/lib/server/store"),
      ]);

    const sessionResponse = await createUpload(new Request("http://local/api/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileName: "wikimania-interview.webm", sizeBytes: sample.length, mimeType: "video/webm" }),
    }));
    expect(sessionResponse.status).toBe(201);
    const session = await sessionResponse.json() as { uploadId: string; uploadToken: string };
    const cookie = sessionResponse.headers.get("set-cookie")?.split(";")[0];
    expect(cookie).toBeTruthy();

    const contentResponse = await uploadContent(new Request("http://local/content", {
      method: "PUT",
      headers: { "x-upload-token": session.uploadToken },
      body: new Blob([new Uint8Array(sample)]),
    }), { params: Promise.resolve({ uploadId: session.uploadId }) });
    expect(contentResponse.status, JSON.stringify(await contentResponse.clone().json())).toBe(201);
    const { jobId } = await contentResponse.json() as { jobId: string };

    expect(await runWorkerOnce()).toBe(true);

    const events = getAnalysisStore().getCurrentAttemptEvents(jobId);
    expect(events.map((event) => event.type)).toEqual([
      "upload_received", "media_metadata_ready", "audio_extracted", "language_detected",
      "speaker_analysis_completed", "pacing_analysis_completed", "speech_quality_assessed",
      "content_profile_completed", "analysis_completed",
    ]);
    expect(events.find((event) => event.type === "language_detected")?.payload).toMatchObject({
      availability: "available", language: { code: "en" },
    });
    expect(events.find((event) => event.type === "speaker_analysis_completed")?.payload).toMatchObject({
      availability: "available", speakerCount: expect.any(Number),
    });
    expect(events.find((event) => event.type === "content_profile_completed")?.payload).toMatchObject({
      availability: "available", profile: { primaryType: "interview" },
    });
    const plan = getAnalysisStore().getLocalizationPlan(jobId, 1, DECISION_ENGINE_VERSION);
    expect(plan).toMatchObject({ status: "ready", safeToContinue: true });
    await writeFile(path.resolve("work/sprint-4.1/real-e2e-results.json"), JSON.stringify({
      input: { fileName: "wikimania-interview.webm", sizeBytes: sample.length },
      events,
      localizationPlan: plan,
    }, null, 2));

    const abort = new AbortController();
    const response = await streamEvents(new Request(`http://local/events/${jobId}`, {
      headers: { cookie: cookie! }, signal: abort.signal,
    }), { params: Promise.resolve({ jobId }) });
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let body = "";
    while (!body.includes("event: analysis_completed")) {
      const chunk = await reader.read();
      if (chunk.done) break;
      body += decoder.decode(chunk.value, { stream: true });
    }
    abort.abort();
    await reader.cancel();
    expect(body).toContain("event: speaker_analysis_completed");
    expect(body).toContain("event: content_profile_completed");
    expect(body).toContain('"readiness":"ready"');
  }, 600_000);
});
