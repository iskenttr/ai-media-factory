import { NextResponse } from "next/server";
import { z } from "zod";

import { ownerHashFromRequest } from "@/lib/server/studio-access";
import { getAnalysisStore } from "@/lib/server/store";

export const runtime = "nodejs";

const decisionSchema = z.object({ status: z.enum(["accepted", "ignored"]) });

export async function PATCH(request: Request, { params }: { params: Promise<{ jobId: string; suggestionId: string }> }) {
  const ownerHash = ownerHashFromRequest(request);
  const { jobId, suggestionId } = await params;
  const store = getAnalysisStore();
  const project = ownerHash ? store.getStudioProjectForOwner(jobId, ownerHash) : null;
  if (!project) return NextResponse.json({ error: "studio_project_not_found" }, { status: 404 });
  const decision = decisionSchema.safeParse(await request.json().catch(() => null));
  if (!decision.success) return NextResponse.json({ error: "invalid_suggestion_decision" }, { status: 400 });
  if (!store.setStudioSuggestionStatus(project.id, suggestionId, decision.data.status)) {
    return NextResponse.json({ error: "studio_suggestion_not_found" }, { status: 404 });
  }
  return NextResponse.json({ status: decision.data.status });
}
