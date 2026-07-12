import { NextResponse } from "next/server";

import { ownerHashFromRequest } from "@/lib/server/studio-access";
import { getAnalysisStore } from "@/lib/server/store";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ runId: string; segmentId: string }> }) {
  const ownerHash = ownerHashFromRequest(request);
  const { runId, segmentId } = await params;
  const jobId = ownerHash ? getAnalysisStore().queueTranslationRegeneration(runId, segmentId, ownerHash) : null;
  if (!jobId) return NextResponse.json({ error: "localized_segment_not_found" }, { status: 404 });
  return NextResponse.json({ status: "queued", jobId });
}
