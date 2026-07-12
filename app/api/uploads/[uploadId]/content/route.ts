import { createHash } from "node:crypto";
import { mkdir, open, rename, rm } from "node:fs/promises";
import path from "node:path";

import { fileTypeFromFile } from "file-type";
import { NextResponse } from "next/server";

import { serverConfig, uploadDirectory } from "@/lib/server/config";
import { matchesToken } from "@/lib/server/security";
import { getAnalysisStore } from "@/lib/server/store";
import { verifyUploadFacts } from "@/lib/server/upload-verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ uploadId: string }>;
}

export async function PUT(request: Request, context: RouteContext) {
  const { uploadId } = await context.params;
  const store = getAnalysisStore();
  const upload = store.getUploadSession(uploadId);
  const uploadToken = request.headers.get("x-upload-token");

  if (!upload || !uploadToken || !matchesToken(uploadToken, upload.uploadTokenHash)) {
    return NextResponse.json({ error: "upload_not_found" }, { status: 404 });
  }
  if (upload.status === "verified" && upload.jobId) {
    return NextResponse.json({ jobId: upload.jobId, uploadId });
  }
  if (upload.status !== "pending" || Date.parse(upload.expiresAt) <= Date.now()) {
    return NextResponse.json({ error: "upload_session_expired" }, { status: 410 });
  }
  if (!request.body) {
    return NextResponse.json({ error: "upload_body_required" }, { status: 400 });
  }

  const directory = uploadDirectory(uploadId);
  const temporaryPath = path.join(directory, "source.part");
  await mkdir(directory, { recursive: true });
  const file = await open(temporaryPath, "wx");
  const hash = createHash("sha256");
  let actualSize = 0;

  try {
    const reader = request.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      actualSize += value.byteLength;
      if (actualSize > serverConfig.maxUploadBytes || actualSize > upload.declaredSize) {
        throw new Error("upload_size_exceeded");
      }
      hash.update(value);
      await file.write(value);
    }
    await file.sync();
    await file.close();

    const detectedType = await fileTypeFromFile(temporaryPath);
    if (!detectedType) throw new Error("unsupported_media");
    verifyUploadFacts({
      declaredSize: upload.declaredSize,
      actualSize,
      declaredMime: upload.declaredMime,
      detectedMime: detectedType?.mime,
      maxUploadBytes: serverConfig.maxUploadBytes,
    });

    const sourcePath = path.join(directory, `source.${detectedType.ext}`);
    await rename(temporaryPath, sourcePath);
    const jobId = store.verifyUploadAndCreateJob({
      uploadId,
      sourcePath,
      actualSize,
      sha256: hash.digest("hex"),
      verifiedMime: detectedType.mime,
    });

    return NextResponse.json({ jobId, uploadId }, { status: 201 });
  } catch (error) {
    await file.close().catch(() => undefined);
    await rm(temporaryPath, { force: true });
    const errorCode = error instanceof Error ? error.message : "upload_verification_failed";
    store.failUpload(uploadId, errorCode);
    return NextResponse.json({ error: errorCode }, { status: 422 });
  }
}
