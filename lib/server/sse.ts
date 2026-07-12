import type { AnyAnalysisEvent } from "@/lib/analysis/contracts";

export function encodeServerSentEvent(event: AnyAnalysisEvent) {
  return `id: ${event.eventId}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}
