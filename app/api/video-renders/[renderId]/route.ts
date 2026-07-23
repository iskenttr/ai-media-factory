import { NextResponse } from "next/server";

import { ownerHashFromRequest } from "@/lib/server/studio-access";
import { getAnalysisStore } from "@/lib/server/store";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ renderId: string }> }) {
  const ownerHash = ownerHashFromRequest(request);
  const { renderId } = await params;
  const render = ownerHash ? getAnalysisStore().getVideoRenderForOwner(renderId, ownerHash) : null;
  if (!render) return NextResponse.json({ error: "video_render_not_found" }, { status: 404 });
  return NextResponse.json({
    id: render.id,
    status: render.status,
    failureReason: render.failureReason,
    previewUrl: render.status === "completed" ? `/api/video-renders/${render.id}/content` : null,
    downloadUrl: render.status === "completed" ? `/api/video-renders/${render.id}/content?download=1` : null,
    qualityUrl: render.status === "completed" ? `/api/video-renders/${render.id}/quality` : null,
  });
}
