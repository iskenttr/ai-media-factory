// @vitest-environment node

import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it, vi } from "vitest";

describe("AI analysis core end to end", () => {
  let directory: string | undefined;

  afterEach(async () => {
    const { closeAnalysisStore } = await import("@/lib/server/store");
    closeAnalysisStore();
    if (directory) await rm(directory, { recursive: true, force: true });
    delete process.env.AMF_STORAGE_DIR;
    delete process.env.AMF_DATABASE_PATH;
    delete process.env.FFMPEG_PATH;
    delete process.env.FFPROBE_PATH;
    delete process.env.WHISPER_CPP_BIN;
    delete process.env.WHISPER_MODEL_PATH;
    vi.resetModules();
  });

  it("streams a real video through upload, worker, persistence, and SSE", async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "amf-e2e-"));
    process.env.AMF_STORAGE_DIR = directory;
    process.env.AMF_DATABASE_PATH = path.join(directory, "analysis.sqlite");
    process.env.FFMPEG_PATH = "ffmpeg";
    process.env.FFPROBE_PATH = "ffprobe";
    delete process.env.WHISPER_CPP_BIN;
    delete process.env.WHISPER_MODEL_PATH;
    vi.resetModules();

    const samplePath = path.join(directory, "sample.mp4");
    const generated = spawnSync(process.env.FFMPEG_PATH, [
      "-y", "-f", "lavfi", "-i", "color=c=white:s=320x180:d=1",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
      "-shortest", "-c:v", "mpeg4", "-c:a", "aac", samplePath,
    ], { encoding: "utf8" });
    expect(generated.status, generated.stderr).toBe(0);
    const sample = await readFile(samplePath);

    const [{ POST: createUpload }, { PUT: uploadContent }, { GET: streamEvents }, { runWorkerOnce }] =
      await Promise.all([
        import("./uploads/route"),
        import("./uploads/[uploadId]/content/route"),
        import("./analysis/jobs/[jobId]/events/route"),
        import("@/lib/server/analysis-worker"),
      ]);

    const sessionResponse = await createUpload(new Request("http://local/api/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileName: "sample.mp4", sizeBytes: sample.length, mimeType: "video/mp4" }),
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

    const abort = new AbortController();
    const sseResponse = await streamEvents(new Request(`http://local/events/${jobId}`, {
      headers: { cookie: cookie! },
      signal: abort.signal,
    }), { params: Promise.resolve({ jobId }) });
    expect(sseResponse.status).toBe(200);
    const reader = sseResponse.body!.getReader();
    const decoder = new TextDecoder();
    let body = "";
    while (!body.includes("event: analysis_completed")) {
      const chunk = await reader.read();
      if (chunk.done) break;
      body += decoder.decode(chunk.value, { stream: true });
    }
    abort.abort();
    await reader.cancel();

    expect(body).toContain("event: upload_received");
    expect(body).toContain("event: media_metadata_ready");
    expect(body).toContain("event: audio_extracted");
    expect(body).toContain('"reason":"model_not_configured"');
    expect(body).toContain('"readiness":"blocked"');
  }, 20_000);
});
