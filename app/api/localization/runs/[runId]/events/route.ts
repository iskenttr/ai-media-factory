import { setTimeout as wait } from "node:timers/promises";

import { NextResponse } from "next/server";

import { serverConfig } from "@/lib/server/config";
import { hashToken, SESSION_COOKIE } from "@/lib/server/security";
import { getAnalysisStore } from "@/lib/server/store";
import { encodeServerSentEvent, serverSentEventHeaders, ssePollBackoff } from "@/lib/server/sse";

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
  const store = getAnalysisStore();
  if (!token || !store.localizationRunBelongsToOwner(runId, hashToken(token))) {
    return NextResponse.json({ error: "localization_run_not_found" }, { status: 404 });
  }
  const encoder = new TextEncoder();
  let canceled = false;
  const initialLastEventId = request.headers.get("last-event-id");
  const initialSequence = initialLastEventId ? store.localizationEventSequence(runId, initialLastEventId) : 0;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void (async () => {
        let sequence = initialSequence;
        let lastHeartbeat = Date.now();
        let idleDelayMs: number = serverConfig.ssePollMs;
        try {
          while (!request.signal.aborted && !canceled) {
            const events = store.listLocalizationEventsAfterSequence(runId, sequence, serverConfig.sseBatchSize);
            for (const event of events) {
              controller.enqueue(encoder.encode(encodeServerSentEvent(event)));
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
          if (!request.signal.aborted && !canceled && !(error instanceof DOMException && error.name === "AbortError")) controller.error(error);
        }
        if (!canceled) controller.close();
      })();
    },
    cancel() { canceled = true; },
  });
  return new Response(stream, { headers: serverSentEventHeaders });
}
