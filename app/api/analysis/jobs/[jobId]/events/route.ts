import { setTimeout as wait } from "node:timers/promises";

import { NextResponse } from "next/server";

import { serverConfig } from "@/lib/server/config";
import { hashToken, SESSION_COOKIE } from "@/lib/server/security";
import { getAnalysisStore } from "@/lib/server/store";
import { encodeServerSentEvent } from "@/lib/server/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

function sessionTokenFromRequest(request: Request) {
  const encoded = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  return encoded ? decodeURIComponent(encoded) : null;
}

export async function GET(request: Request, context: RouteContext) {
  const { jobId } = await context.params;
  const sessionToken = sessionTokenFromRequest(request);
  if (!sessionToken) {
    return NextResponse.json({ error: "analysis_job_not_found" }, { status: 404 });
  }

  const store = getAnalysisStore();
  const job = store.getJobForOwner(jobId, hashToken(sessionToken));
  if (!job) {
    return NextResponse.json({ error: "analysis_job_not_found" }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const initialLastEventId = request.headers.get("last-event-id");
  let canceled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void (async () => {
        let lastEventId = initialLastEventId;
        let lastHeartbeat = Date.now();

        try {
          while (!request.signal.aborted && !canceled) {
            const events = store.listEvents(jobId, lastEventId, job.attempt);
            for (const event of events) {
              controller.enqueue(
                encoder.encode(encodeServerSentEvent(event)),
              );
              lastEventId = event.eventId;
            }

            if (Date.now() - lastHeartbeat >= serverConfig.sseHeartbeatMs) {
              controller.enqueue(encoder.encode(": keep-alive\n\n"));
              lastHeartbeat = Date.now();
            }
            await wait(serverConfig.ssePollMs, undefined, { signal: request.signal });
          }
        } catch (error) {
          if (!request.signal.aborted && !canceled && !(error instanceof DOMException && error.name === "AbortError")) {
            controller.error(error);
            return;
          }
        }
        if (!canceled) controller.close();
      })();
    },
    cancel() {
      canceled = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
