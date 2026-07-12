import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

import { ownerHashFromRequest } from "@/lib/server/studio-access";
import { getAnalysisStore } from "@/lib/server/store";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const ownerHash = ownerHashFromRequest(request);
  const { jobId } = await params;
  const project = ownerHash ? getAnalysisStore().getStudioProjectForOwner(jobId, ownerHash) : null;
  if (!project) return new Response(null, { status: 404 });
  try {
    const file = await stat(project.sourcePath);
    const range = request.headers.get("range");
    const baseHeaders = { "Content-Type": project.mimeType, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600" };
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      if (!match) return new Response(null, { status: 416 });
      const start = Number(match[1]);
      const end = match[2] ? Math.min(Number(match[2]), file.size - 1) : file.size - 1;
      if (start > end || start >= file.size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${file.size}` } });
      return new Response(Readable.toWeb(createReadStream(project.sourcePath, { start, end })) as ReadableStream, {
        status: 206,
        headers: { ...baseHeaders, "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${file.size}` },
      });
    }
    return new Response(Readable.toWeb(createReadStream(project.sourcePath)) as ReadableStream, {
      headers: { ...baseHeaders, "Content-Length": String(file.size) },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
