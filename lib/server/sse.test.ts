import { describe, expect, it } from "vitest";

import type { AnyAnalysisEvent } from "@/lib/analysis/contracts";

import { encodeServerSentEvent, serverSentEventHeaders, ssePollBackoff } from "./sse";

describe("SSE event encoding", () => {
  it("includes the durable event id for Last-Event-ID replay", () => {
    const event = {
      schemaVersion: 1,
      eventId: "event-2",
      jobId: "job-1",
      uploadId: "upload-1",
      attempt: 1,
      sequence: 2,
      type: "audio_extracted",
      occurredAt: "2026-07-11T10:00:00.000Z",
      payload: { availability: "available", sampleRateHz: 16000, channels: 1, format: "wav" },
    } as AnyAnalysisEvent;
    const encoded = encodeServerSentEvent(event);
    expect(encoded).toContain("id: event-2\n");
    expect(encoded).toContain("event: audio_extracted\n");
    expect(encoded.endsWith("\n\n")).toBe(true);
  });

  it("uses proxy-safe headers for both SSE routes", () => {
    expect(serverSentEventHeaders).toEqual({
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    });
  });

  it("reduces idle polling by at least 70 percent with a 2.8 second detection bound", () => {
    const basePollMs = 350;
    const maximumIdleMs = 2_800;
    const saturatedIdle = ssePollBackoff(maximumIdleMs, 0, 100, basePollMs, maximumIdleMs);
    expect(saturatedIdle).toEqual({ waitMs: 2_800, nextIdleMs: 2_800 });
    const detectedEvent = ssePollBackoff(maximumIdleMs, 1, 100, basePollMs, maximumIdleMs);
    expect(detectedEvent.waitMs).toBe(basePollMs);
    expect(detectedEvent.nextIdleMs).toBe(basePollMs);
    expect(ssePollBackoff(maximumIdleMs, 100, 100, basePollMs, maximumIdleMs).waitMs).toBe(0);

    const durationMs = 60_000;
    const fixedQueryCount = Math.ceil(durationMs / basePollMs);
    let elapsedMs = 0;
    let idleDelayMs = basePollMs;
    let backoffQueryCount = 0;
    while (elapsedMs < durationMs) {
      backoffQueryCount += 1;
      const next = ssePollBackoff(idleDelayMs, 0, 100, basePollMs, maximumIdleMs);
      elapsedMs += next.waitMs;
      idleDelayMs = next.nextIdleMs;
    }
    const reduction = 1 - backoffQueryCount / fixedQueryCount;
    expect(reduction).toBeGreaterThanOrEqual(0.7);
  });
});
