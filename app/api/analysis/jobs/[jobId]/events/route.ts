import { setTimeout as wait } from "node:timers/promises";

import { NextResponse } from "next/server";

import { serverConfig } from "@/lib/server/config";
import { hashToken, SESSION_COOKIE } from "@/lib/server/security";
import { getAnalysisStore } from "@/lib/server/store";
import { encodeServerSentEvent, serverSentEventHeaders, ssePollBackoff } from "@/lib/server/sse";

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
  const initialSequence = initialLastEventId ? store.analysisEventSequence(jobId, initialLastEventId) : 0;
  let canceled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void (async () => {
        let sequence = initialSequence;
        let lastHeartbeat = Date.now();
        let idleDelayMs: number = serverConfig.ssePollMs;

        try {
          while (!request.signal.aborted && !canceled) {
            const events = store.listEventsAfterSequence(jobId, sequence, job.attempt, serverConfig.sseBatchSize);
            for (const event of events) {
              controller.enqueue(
                encoder.encode(encodeServerSentEvent(event)),
              );
              sequence = event.sequence;
            }

            if (Date.now() - lastHeartbeat >= serverConfig.sseHeartbeatMs) {
              controller.enqueue(encoder.encode(": keep-alive\n\n"));
              lastHeartbeat = Date.now();
            }
            const backoff = ssePollBackoff(
              idleDelayMs,
              events.length,
              serverConfig.sseBatchSize,
              serverConfig.ssePollMs,
              serverConfig.sseIdleMaxPollMs,
            );
            idleDelayMs = backoff.nextIdleMs;
            if (backoff.waitMs > 0) await wait(backoff.waitMs, undefined, { signal: request.signal });
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
    headers: serverSentEventHeaders,
  });
}
