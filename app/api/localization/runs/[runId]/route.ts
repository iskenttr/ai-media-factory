import { NextResponse } from "next/server";

import { ownerHashFromRequest } from "@/lib/server/studio-access";
import { getAnalysisStore } from "@/lib/server/store";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const ownerHash = ownerHashFromRequest(request);
  const run = ownerHash ? getAnalysisStore().getLocalizationRunForOwner(runId, ownerHash) : null;
  if (!run) return NextResponse.json({ error: "localization_run_not_found" }, { status: 404 });
  return NextResponse.json(run);
}
