import { stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

import { ownerHashFromRequest } from "@/lib/server/studio-access";
import { getAnalysisStore } from "@/lib/server/store";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ renderId: string }> }) {
  const ownerHash = ownerHashFromRequest(request);
  const { renderId } = await params;
  const render = ownerHash ? getAnalysisStore().getVideoRenderForOwner(renderId, ownerHash) : null;
  if (!render || render.status !== "completed") return new Response(null, { status: 404 });
  try {
    const file = await stat(render.outputPath);
    const range = request.headers.get("range");
    const disposition = new URL(request.url).searchParams.has("download") ? `attachment; filename="localized-video.mp4"` : "inline";
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      if (!match) return new Response(null, { status: 416 });
      const start = Number(match[1]);
      const end = match[2] ? Math.min(Number(match[2]), file.size - 1) : file.size - 1;
      if (start > end || start >= file.size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${file.size}` } });
      return new Response(Readable.toWeb(createReadStream(render.outputPath, { start, end })) as ReadableStream, { status: 206, headers: {
        "Content-Type": "video/mp4", "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${file.size}`,
        "Accept-Ranges": "bytes", "Content-Disposition": disposition, "Cache-Control": "private, max-age=3600",
      } });
    }
    return new Response(Readable.toWeb(createReadStream(render.outputPath)) as ReadableStream, { headers: {
      "Content-Type": "video/mp4", "Content-Length": String(file.size), "Accept-Ranges": "bytes", "Content-Disposition": disposition,
      "Cache-Control": "private, max-age=3600",
    } });
  } catch { return new Response(null, { status: 404 }); }
}
