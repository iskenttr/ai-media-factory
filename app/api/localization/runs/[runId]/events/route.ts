import { setTimeout as wait } from "node:timers/promises";

import { NextResponse } from "next/server";

import { serverConfig } from "@/lib/server/config";
import { hashToken, SESSION_COOKIE } from "@/lib/server/security";
import { getAnalysisStore } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sessionToken(request: Request) {
  const encoded = request.headers.get("cookie")?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  return encoded ? decodeURIComponent(encoded) : null;
}

export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const token = sessionToken(request);
  if (!token || !getAnalysisStore().getLocalizationRunForOwner(runId, hashToken(token))) {
    return NextResponse.json({ error: "localization_run_not_found" }, { status: 404 });
  }
  const store = getAnalysisStore();
  const encoder = new TextEncoder();
  let canceled = false;
  const initialLastEventId = request.headers.get("last-event-id");
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void (async () => {
        let lastEventId = initialLastEventId;
        try {
          while (!request.signal.aborted && !canceled) {
            for (const event of store.listLocalizationEvents(runId, lastEventId)) {
              controller.enqueue(encoder.encode(`id: ${event.eventId}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
              lastEventId = event.eventId;
            }
            await wait(serverConfig.ssePollMs, undefined, { signal: request.signal });
          }
        } catch (error) {
          if (!request.signal.aborted && !canceled && !(error instanceof DOMException && error.name === "AbortError")) controller.error(error);
        }
        if (!canceled) controller.close();
      })();
    },
    cancel() { canceled = true; },
  });
  return new Response(stream, { headers: { "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "Content-Type": "text/event-stream; charset=utf-8" } });
}
