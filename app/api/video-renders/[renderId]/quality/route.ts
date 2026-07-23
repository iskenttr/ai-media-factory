import { readFile } from "node:fs/promises";

import { ownerHashFromRequest } from "@/lib/server/studio-access";
import { getAnalysisStore } from "@/lib/server/store";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ renderId: string }> }) {
  const ownerHash = ownerHashFromRequest(request);
  const { renderId } = await params;
  const render = ownerHash ? getAnalysisStore().getVideoRenderForOwner(renderId, ownerHash) : null;
  if (!render || render.status !== "completed") return new Response(null, { status: 404 });
  try {
    const [audio, subtitle] = await Promise.all([
      readFile(`${render.outputPath}.audio-quality.json`, "utf8"),
      readFile(`${render.outputPath}.quality.json`, "utf8"),
    ]);
    return Response.json({
      audio: JSON.parse(audio),
      subtitle: JSON.parse(subtitle),
    }, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
