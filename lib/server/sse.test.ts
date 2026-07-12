import { describe, expect, it } from "vitest";

import type { AnyAnalysisEvent } from "@/lib/analysis/contracts";

import { encodeServerSentEvent } from "./sse";

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
});
