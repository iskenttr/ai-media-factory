import { createHash } from "node:crypto";
import { lstat, mkdir, open, rename, rm } from "node:fs/promises";
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

interface FileIdentity {
  dev: number;
  ino: number;
}

function contentLengthError(request: Request, declaredSize: number) {
  const header = request.headers.get("content-length");
  if (header === null) return null;
  if (!/^\d+$/.test(header)) return "upload_size_mismatch";
  const contentLength = Number(header);
  if (!Number.isSafeInteger(contentLength)) return "upload_size_exceeded";
  if (contentLength > serverConfig.maxUploadBytes || contentLength > declaredSize) return "upload_size_exceeded";
  return contentLength === declaredSize ? null : "upload_size_mismatch";
}

async function removeFileIfOwned(filePath: string, identity: FileIdentity | null) {
  if (!identity) return;
  try {
    const current = await lstat(filePath);
    if (current.dev === identity.dev && current.ino === identity.ino) {
      await rm(filePath, { force: true });
    }
  } catch {
    // Cleanup is best effort and must not replace the stable upload error.
  }
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
  const lengthError = contentLengthError(request, upload.declaredSize);
  if (lengthError) {
    store.failUpload(uploadId, lengthError);
    return NextResponse.json({ error: lengthError }, { status: 422 });
  }
  if (!request.body) {
    return NextResponse.json({ error: "upload_body_required" }, { status: 400 });
  }

  const directory = uploadDirectory(uploadId);
  const temporaryPath = path.join(directory, "source.part");
  await mkdir(directory, { recursive: true });
  let file;
  try {
    file = await open(temporaryPath, "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      return NextResponse.json({ error: "upload_in_progress" }, { status: 409 });
    }
    throw error;
  }
  const hash = createHash("sha256");
  let actualSize = 0;
  let fileIdentity: FileIdentity | null = null;
  let finalSourcePath: string | null = null;

  try {
    const openedFile = await file.stat();
    fileIdentity = { dev: openedFile.dev, ino: openedFile.ino };
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
    finalSourcePath = sourcePath;
    const jobId = store.verifyUploadAndCreateJob({
      uploadId,
      sourcePath,
      actualSize,
      sha256: hash.digest("hex"),
      verifiedMime: detectedType.mime,
    });
    finalSourcePath = null;

    return NextResponse.json({ jobId, uploadId }, { status: 201 });
  } catch (error) {
    await file.close().catch(() => undefined);
    await removeFileIfOwned(finalSourcePath ?? temporaryPath, fileIdentity);
    const errorCode = error instanceof Error ? error.message : "upload_verification_failed";
    store.failUpload(uploadId, errorCode);
    return NextResponse.json({ error: errorCode }, { status: 422 });
  }
}
