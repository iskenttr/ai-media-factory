// @vitest-environment node

import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const mp4 = Uint8Array.from([
  0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109,
  0, 0, 0, 0, 105, 115, 111, 109, 109, 112, 52, 49,
]);

async function waitForFile(filePath: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      await access(filePath);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
  throw new Error(`Timed out waiting for ${filePath}`);
}

describe("upload content contention", () => {
  let directory: string | undefined;

  afterEach(async () => {
    const { closeAnalysisStore } = await import("@/lib/server/store");
    closeAnalysisStore();
    if (directory) await rm(directory, { recursive: true, force: true });
    delete process.env.AMF_STORAGE_DIR;
    delete process.env.AMF_DATABASE_PATH;
    vi.resetModules();
  });

  it("rejects the duplicate writer without failing the legitimate upload", async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "amf-upload-contention-"));
    process.env.AMF_STORAGE_DIR = directory;
    process.env.AMF_DATABASE_PATH = path.join(directory, "analysis.sqlite");
    vi.resetModules();

    const [{ POST: createUpload }, { PUT: uploadContent }, { getAnalysisStore }] = await Promise.all([
      import("./uploads/route"),
      import("./uploads/[uploadId]/content/route"),
      import("@/lib/server/store"),
    ]);
    const sessionResponse = await createUpload(new Request("http://local/api/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileName: "sample.mp4", sizeBytes: mp4.length, mimeType: "video/mp4" }),
    }));
    const session = await sessionResponse.json() as { uploadId: string; uploadToken: string };

    let releaseWriter!: () => void;
    const writerGate = new Promise<void>((resolve) => { releaseWriter = resolve; });
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(mp4.slice(0, 12));
        void writerGate.then(() => {
          controller.enqueue(mp4.slice(12));
          controller.close();
        });
      },
    });
    const firstRequest = new Request("http://local/content", {
      method: "PUT",
      headers: { "x-upload-token": session.uploadToken },
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    const context = { params: Promise.resolve({ uploadId: session.uploadId }) };
    const legitimateWriter = uploadContent(firstRequest, context);
    await waitForFile(path.join(directory, "uploads", session.uploadId, "source.part"));

    const duplicateResponse = await uploadContent(new Request("http://local/content", {
      method: "PUT",
      headers: { "x-upload-token": session.uploadToken },
      body: new Blob([mp4]),
    }), context);
    expect(duplicateResponse.status).toBe(409);
    await expect(duplicateResponse.json()).resolves.toEqual({ error: "upload_in_progress" });
    expect(getAnalysisStore().getUploadSession(session.uploadId)).toMatchObject({
      status: "pending",
      jobId: null,
      errorCode: null,
    });

    releaseWriter();
    const completedResponse = await legitimateWriter;
    expect(completedResponse.status).toBe(201);
    const completed = await completedResponse.json() as { jobId: string; uploadId: string };
    expect(getAnalysisStore().getUploadSession(session.uploadId)).toMatchObject({
      status: "verified",
      jobId: completed.jobId,
      errorCode: null,
    });

    const replayResponse = await uploadContent(new Request("http://local/content", {
      method: "PUT",
      headers: { "x-upload-token": session.uploadToken },
      body: new Blob([mp4]),
    }), context);
    expect(replayResponse.status).toBe(200);
    await expect(replayResponse.json()).resolves.toEqual(completed);
    expect(getAnalysisStore().claimNextJob("worker-1", 30_000)?.id).toBe(completed.jobId);
    expect(getAnalysisStore().claimNextJob("worker-2", 30_000)).toBeNull();
  });
});
