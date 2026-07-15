// @vitest-environment node

import { rmSync, writeFileSync } from "node:fs";
import { access, lstat, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const mp4 = Uint8Array.from([
  0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109,
  0, 0, 0, 0, 105, 115, 111, 109, 109, 112, 52, 49,
]);

describe("upload content cleanup", () => {
  let directory: string | undefined;

  afterEach(async () => {
    const { closeAnalysisStore } = await import("@/lib/server/store");
    closeAnalysisStore();
    vi.restoreAllMocks();
    if (directory) await rm(directory, { recursive: true, force: true });
    delete process.env.AMF_STORAGE_DIR;
    delete process.env.AMF_DATABASE_PATH;
    vi.resetModules();
  });

  async function setupUpload() {
    directory = await mkdtemp(path.join(os.tmpdir(), "amf-upload-orphan-"));
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
    return {
      session,
      uploadContent,
      store: getAnalysisStore(),
      context: { params: Promise.resolve({ uploadId: session.uploadId }) },
      sourcePath: path.join(directory, "uploads", session.uploadId, "source.mp4"),
      temporaryPath: path.join(directory, "uploads", session.uploadId, "source.part"),
    };
  }

  it.each([
    { contentLength: mp4.length + 1, error: "upload_size_exceeded" },
    { contentLength: mp4.length - 1, error: "upload_size_mismatch" },
  ])("rejects $error from Content-Length without consuming the body", async ({ contentLength, error }) => {
    const { session, uploadContent, store, context } = await setupUpload();
    let readerCalls = 0;
    const request = {
      headers: new Headers({
        "content-length": String(contentLength),
        "x-upload-token": session.uploadToken,
      }),
      body: {
        getReader() {
          readerCalls += 1;
          throw new Error("body_must_not_be_consumed");
        },
      },
    } as unknown as Request;

    const response = await uploadContent(request, context);
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ error });
    expect(readerCalls).toBe(0);
    expect(store.getUploadSession(session.uploadId)).toMatchObject({ status: "failed", errorCode: error });
  });

  it("removes its renamed source when database finalization fails", async () => {
    const { session, uploadContent, store, context, sourcePath, temporaryPath } = await setupUpload();
    vi.spyOn(store, "verifyUploadAndCreateJob").mockImplementationOnce(() => {
      throw new Error("db_finalization_failed");
    });

    const response = await uploadContent(new Request("http://local/content", {
      method: "PUT",
      headers: { "x-upload-token": session.uploadToken },
      body: new Blob([mp4]),
    }), context);

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ error: "db_finalization_failed" });
    await expect(access(sourcePath)).rejects.toThrow();
    await expect(access(temporaryPath)).rejects.toThrow();
    expect(store.getUploadSession(session.uploadId)).toMatchObject({
      status: "failed",
      jobId: null,
      errorCode: "db_finalization_failed",
    });
  });

  it("does not remove a final path replaced by another writer", async () => {
    const { session, uploadContent, store, context, sourcePath } = await setupUpload();
    const replacement = Uint8Array.from([...mp4, 1]);
    vi.spyOn(store, "verifyUploadAndCreateJob").mockImplementationOnce(() => {
      rmSync(sourcePath);
      writeFileSync(sourcePath, replacement);
      throw new Error("db_finalization_failed");
    });

    const response = await uploadContent(new Request("http://local/content", {
      method: "PUT",
      headers: { "x-upload-token": session.uploadToken },
      body: new Blob([mp4]),
    }), context);

    expect(response.status).toBe(422);
    expect(await readFile(sourcePath)).toEqual(Buffer.from(replacement));
  });

  it("preserves the successful source and returns the same job on replay", async () => {
    const { session, uploadContent, store, context, sourcePath } = await setupUpload();
    const request = () => new Request("http://local/content", {
      method: "PUT",
      headers: { "x-upload-token": session.uploadToken },
      body: new Blob([mp4]),
    });

    const completedResponse = await uploadContent(request(), context);
    expect(completedResponse.status).toBe(201);
    const completed = await completedResponse.json() as { jobId: string; uploadId: string };
    const identity = await lstat(sourcePath);
    expect(await readFile(sourcePath)).toEqual(Buffer.from(mp4));

    const replayResponse = await uploadContent(request(), context);
    expect(replayResponse.status).toBe(200);
    await expect(replayResponse.json()).resolves.toEqual(completed);
    expect(await readFile(sourcePath)).toEqual(Buffer.from(mp4));
    expect(await lstat(sourcePath)).toMatchObject({ dev: identity.dev, ino: identity.ino });
    expect(store.getUploadSession(session.uploadId)).toMatchObject({
      status: "verified",
      jobId: completed.jobId,
      sourcePath,
    });
  });
});
