import { z } from "zod";
import { NextResponse } from "next/server";

import { ownerHashFromRequest } from "@/lib/server/studio-access";
import { getAnalysisStore } from "@/lib/server/store";

export const runtime = "nodejs";

const localizedSegmentPatchSchema = z.object({
  translatedText: z.string().trim().min(1).max(20_000),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ runId: string; segmentId: string }> }) {
  const ownerHash = ownerHashFromRequest(request);
  const { runId, segmentId } = await params;
  if (!ownerHash) return NextResponse.json({ error: "localization_run_not_found" }, { status: 404 });
  const parsed = localizedSegmentPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_localized_segment_patch" }, { status: 400 });
  const saved = getAnalysisStore().saveLocalizedSegmentUserRevision(runId, segmentId, ownerHash, parsed.data.translatedText);
  if (!saved) return NextResponse.json({ error: "localized_segment_not_found" }, { status: 404 });
  return NextResponse.json(saved);
}
