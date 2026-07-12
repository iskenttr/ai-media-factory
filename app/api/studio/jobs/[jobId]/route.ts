import { NextResponse } from "next/server";

import { ownerHashFromRequest } from "@/lib/server/studio-access";
import { getAnalysisStore } from "@/lib/server/store";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const ownerHash = ownerHashFromRequest(request);
  const { jobId } = await params;
  const project = ownerHash ? getAnalysisStore().getStudioProjectForOwner(jobId, ownerHash) : null;
  if (!project) return NextResponse.json({ error: "studio_project_not_found" }, { status: 404 });
  return NextResponse.json({
    jobId: project.jobId,
    video: { name: project.fileName, durationMs: project.durationMs, width: project.width, height: project.height, sourceUrl: `/api/studio/jobs/${project.jobId}/video` },
    sourceLanguage: project.sourceLanguage,
    targetLanguage: project.targetLanguage,
    setupPrepared: project.setupPrepared,
    speakerCount: project.speakerCount,
    contentStructure: project.contentStructure,
    limitations: project.limitations,
    sourceEventIds: project.sourceEventIds,
    segments: project.segments,
    suggestions: project.suggestions,
    localization: project.localization,
  });
}
