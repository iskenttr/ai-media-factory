import { describe, expect, it, vi } from "vitest";

import { GeminiQualityAssistant } from "./gemini-quality-assistant";

const input = {
  fingerprint: "fixture-v1",
  metadata: { width: 1080, height: 1920, durationMs: 10_000, orientation: "vertical" as const },
  cues: [{ index: 0, startMs: 0, endMs: 2_000, text: "Merhaba", lines: ["Merhaba"], fontSize: 52 }],
  frames: [{ timestampMs: 1_000, mimeType: "image/jpeg" as const, base64: "AA==" }],
  deterministicScore: 94,
};

describe("Gemini quality assistant", () => {
  it("uses schema-validated JSON and caches identical reviews", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ score: 91, rerenderRecommended: false, findings: [] }) }] } }] }), { status: 200 }));
    const assistant = new GeminiQualityAssistant("https://example.invalid", async () => "runtime-token", 10_000, request as typeof fetch);
    expect((await assistant.review(input)).cached).toBe(false);
    expect((await assistant.review(input)).cached).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("rejects unbounded frame usage before making a request", async () => {
    const request = vi.fn();
    const assistant = new GeminiQualityAssistant("https://example.invalid", async () => "runtime-token", 10_000, request as typeof fetch);
    await expect(assistant.review({ ...input, frames: Array.from({ length: 9 }, () => input.frames[0]) })).rejects.toThrow("gemini_frame_limit_exceeded");
    expect(request).not.toHaveBeenCalled();
  });
});
