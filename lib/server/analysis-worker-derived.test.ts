import { describe, expect, it } from "vitest";

import { computePacing } from "./analysis-worker";

describe("derived pacing observation", () => {
  it("derives pacing only from timestamped provider segments", () => {
    expect(computePacing({
      transcript: "one two three four",
      segments: [
        { startSeconds: 0, endSeconds: 2, text: "one two" },
        { startSeconds: 3, endSeconds: 5, text: "three four" },
      ],
      language: { code: "en", name: "English" },
      providerId: "contract-test",
      providerVersion: "1",
    }, 10_000)).toEqual({
      availability: "available",
      assessment: "clear",
      wordsPerMinute: 60,
      speakingRatio: 0.4,
    });
  });

  it("returns unavailable when segments contain no speech evidence", () => {
    expect(computePacing({
      transcript: "",
      segments: [],
      language: null,
      providerId: "contract-test",
      providerVersion: "1",
    }, 10_000)).toEqual({ availability: "unavailable", reason: "insufficient_speech" });
  });
});
