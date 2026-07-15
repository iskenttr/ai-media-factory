interface ServerSentEvent {
  eventId: string;
  type: string;
}

export const serverSentEventHeaders = {
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "Content-Type": "text/event-stream; charset=utf-8",
  "X-Accel-Buffering": "no",
} as const;

export function encodeServerSentEvent<T extends ServerSentEvent>(event: T) {
  return `id: ${event.eventId}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export function ssePollBackoff(
  currentIdleMs: number,
  deliveredCount: number,
  batchSize: number,
  basePollMs: number,
  maximumIdleMs: number,
) {
  if (deliveredCount >= batchSize) return { waitMs: 0, nextIdleMs: basePollMs };
  if (deliveredCount > 0) return { waitMs: basePollMs, nextIdleMs: basePollMs };
  return {
    waitMs: currentIdleMs,
    nextIdleMs: Math.min(maximumIdleMs, Math.max(basePollMs, currentIdleMs * 2)),
  };
}
