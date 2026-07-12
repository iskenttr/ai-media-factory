import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { serverConfig } from "@/lib/server/config";
import { createOpaqueToken, hashToken, SESSION_COOKIE } from "@/lib/server/security";
import { getAnalysisStore } from "@/lib/server/store";

export const runtime = "nodejs";

const createUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().positive().max(serverConfig.maxUploadBytes),
  mimeType: z.string().trim().min(1).max(120),
});

export async function POST(request: Request) {
  const parsed = createUploadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_upload_request" }, { status: 400 });
  }

  const currentSession = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  const sessionToken = currentSession ? decodeURIComponent(currentSession) : createOpaqueToken();
  const uploadToken = createOpaqueToken();
  const uploadId = randomUUID();
  const createdAt = new Date();

  getAnalysisStore().createUploadSession({
    id: uploadId,
    ownerHash: hashToken(sessionToken),
    uploadTokenHash: hashToken(uploadToken),
    fileName: parsed.data.fileName,
    declaredSize: parsed.data.sizeBytes,
    declaredMime: parsed.data.mimeType,
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + serverConfig.uploadSessionTtlMs).toISOString(),
  });

  const response = NextResponse.json(
    {
      uploadId,
      uploadToken,
      uploadUrl: `/api/uploads/${uploadId}/content`,
      expiresAt: new Date(createdAt.getTime() + serverConfig.uploadSessionTtlMs).toISOString(),
    },
    { status: 201 },
  );

  if (!currentSession) {
    response.cookies.set(SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return response;
}
