import { NextResponse } from "next/server";

import { transcriptPatchSchema } from "@/lib/studio/contracts";
import { ownerHashFromRequest } from "@/lib/server/studio-access";
import { getAnalysisStore } from "@/lib/server/store";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ jobId: string; segmentId: string }> }) {
  const ownerHash = ownerHashFromRequest(request);
  const { jobId, segmentId } = await params;
  const store = getAnalysisStore();
  const project = ownerHash ? store.getStudioProjectForOwner(jobId, ownerHash) : null;
  if (!project || !project.segments.some((segment) => segment.id === segmentId)) {
    return NextResponse.json({ error: "studio_segment_not_found" }, { status: 404 });
  }
  const patch = transcriptPatchSchema.safeParse(await request.json().catch(() => null));
  if (!patch.success) return NextResponse.json({ error: "invalid_transcript_correction" }, { status: 400 });
  const version = store.saveTranscriptCorrection(project.id, segmentId, patch.data);
  return NextResponse.json({ version });
}
