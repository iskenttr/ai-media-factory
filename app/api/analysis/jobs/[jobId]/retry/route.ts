import { NextResponse } from "next/server";

import { hashToken, SESSION_COOKIE } from "@/lib/server/security";
import { getAnalysisStore } from "@/lib/server/store";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const { jobId } = await context.params;
  const encoded = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  if (!encoded) {
    return NextResponse.json({ error: "analysis_job_not_found" }, { status: 404 });
  }

  const retried = getAnalysisStore().retryJob(jobId, hashToken(decodeURIComponent(encoded)));
  return retried
    ? NextResponse.json({ jobId, status: "queued" })
    : NextResponse.json({ error: "analysis_job_not_retryable" }, { status: 409 });
}
