import { describe, expect, it } from "vitest";

import type { StudioSegment } from "./contracts";
import { deriveStudioSuggestions } from "./suggestions";

function segment(overrides: Partial<StudioSegment> = {}): StudioSegment {
  return {
    id: "segment-1", sourceSegmentId: "segment-1", sequence: 1, speakerId: "speaker_1", speakerAssigned: true,
    startMs: 0, endMs: 2_000, originalText: "A complete sentence.", correctionVersion: 0, ...overrides,
  };
}

describe("deriveStudioSuggestions", () => {
  it("creates only evidence-backed transcript and speaker review suggestions", () => {
    const suggestions = deriveStudioSuggestions([
      segment({ originalText: "[MUSIC PLAYING] hello hello hello and", speakerAssigned: false }),
      segment({ id: "segment-2", sequence: 2, startMs: 1_500, endMs: 3_000, speakerId: "speaker_2", originalText: "continues here" }),
    ]);
    expect(suggestions.map((item) => item.type)).toEqual(expect.arrayContaining([
      "transcript_review", "speaker_review", "overlapping_speech", "sentence_review",
    ]));
    expect(suggestions.find((item) => item.title === "Review non-speech text")).toMatchObject({ confidence: "high" });
    expect(suggestions.every((item) => item.explanation.length > 0 && item.fingerprint.length > 0)).toBe(true);
  });

  it("does not invent issues for a complete, assigned, non-overlapping segment", () => {
    expect(deriveStudioSuggestions([segment()])).toEqual([]);
  });
});
