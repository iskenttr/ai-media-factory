import { NextResponse } from "next/server";

import { targetLanguageSchema } from "@/lib/studio/contracts";
import { ownerHashFromRequest } from "@/lib/server/studio-access";
import { getAnalysisStore } from "@/lib/server/store";

export const runtime = "nodejs";

export async function PUT(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const ownerHash = ownerHashFromRequest(request);
  const { jobId } = await params;
  const store = getAnalysisStore();
  const project = ownerHash ? store.getStudioProjectForOwner(jobId, ownerHash) : null;
  if (!project) return NextResponse.json({ error: "studio_project_not_found" }, { status: 404 });
  const language = targetLanguageSchema.safeParse(await request.json().catch(() => null));
  if (!language.success) return NextResponse.json({ error: "invalid_target_language" }, { status: 400 });
  store.selectTargetLanguage(project.id, language.data);
  return NextResponse.json({ targetLanguage: language.data });
}
