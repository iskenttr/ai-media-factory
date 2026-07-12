import { NextResponse } from "next/server";

import { ownerHashFromRequest } from "@/lib/server/studio-access";
import { getAnalysisStore } from "@/lib/server/store";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const ownerHash = ownerHashFromRequest(request);
  const { jobId } = await params;
  const store = getAnalysisStore();
  const project = ownerHash ? store.getStudioProjectForOwner(jobId, ownerHash) : null;
  if (!project) return NextResponse.json({ error: "studio_project_not_found" }, { status: 404 });
  if (!store.prepareLocalizationSetup(project.id)) return NextResponse.json({ error: "target_language_required" }, { status: 409 });
  try {
    const runId = store.createLocalizationRun(project.id);
    return NextResponse.json({ status: "prepared", runId });
  } catch {
    return NextResponse.json({ error: "localization_input_unavailable" }, { status: 409 });
  }
}
