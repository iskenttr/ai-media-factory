import { NextResponse } from "next/server";

import { ownerHashFromRequest } from "@/lib/server/studio-access";
import { getAnalysisStore } from "@/lib/server/store";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const ownerHash = ownerHashFromRequest(request);
  const { runId } = await params;
  if (!ownerHash) return NextResponse.json({ error: "localization_run_not_found" }, { status: 404 });
  const store = getAnalysisStore();
  const renderId = store.queueVideoRender(runId, ownerHash);
  if (!renderId) return NextResponse.json({ error: "completed_localization_required" }, { status: 409 });
  return NextResponse.json({ renderId, status: "queued" }, { status: 202 });
}
