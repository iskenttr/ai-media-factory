// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

describe("localization SSE route", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/server/store");
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("uses lightweight ownership, resolves Last-Event-ID once, and streams by sequence", async () => {
    const event = {
      eventId: "event-8",
      runId: "run-1",
      sequence: 8,
      type: "translation_segment_completed",
      payload: { sourceSegmentId: "segment-1" },
      occurredAt: "2026-07-15T00:00:00.000Z",
    };
    const store = {
      localizationRunBelongsToOwner: vi.fn(() => true),
      localizationEventSequence: vi.fn(() => 7),
      listLocalizationEventsAfterSequence: vi.fn()
        .mockReturnValueOnce([event])
        .mockReturnValue([]),
    };
    vi.doMock("@/lib/server/store", () => ({ getAnalysisStore: () => store }));
    const { GET } = await import("./localization/runs/[runId]/events/route");
    const abort = new AbortController();
    const response = await GET(new Request("http://local/events", {
      headers: { cookie: "amf_session=session-token", "last-event-id": "event-7" },
      signal: abort.signal,
    }), { params: Promise.resolve({ runId: "run-1" }) });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(response.headers.get("connection")).toBe("keep-alive");
    expect(response.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    const reader = response.body!.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain("id: event-8\nevent: translation_segment_completed\n");
    abort.abort();
    await reader.cancel();

    expect(store.localizationRunBelongsToOwner).toHaveBeenCalledOnce();
    expect(store.localizationEventSequence).toHaveBeenCalledOnce();
    expect(store.localizationEventSequence).toHaveBeenCalledWith("run-1", "event-7");
    expect(store.listLocalizationEventsAfterSequence).toHaveBeenCalledWith("run-1", 7, 100);
  });

  it("preserves owner-scoped 404 behavior", async () => {
    const store = {
      localizationRunBelongsToOwner: vi.fn(() => false),
    };
    vi.doMock("@/lib/server/store", () => ({ getAnalysisStore: () => store }));
    const { GET } = await import("./localization/runs/[runId]/events/route");
    const response = await GET(new Request("http://local/events", {
      headers: { cookie: "amf_session=wrong-owner" },
    }), { params: Promise.resolve({ runId: "run-1" }) });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "localization_run_not_found" });
    expect(store.localizationRunBelongsToOwner).toHaveBeenCalledOnce();
  });
});
