import { describe, expect, it } from "vitest";

import { alignSegmentToSpeakers } from "./alignment";

describe("speaker-aware forced alignment", () => {
  it("creates a hard cue boundary when the aligned speaker changes", () => {
    const result = alignSegmentToSpeakers({
      startSeconds: 0,
      endSeconds: 2,
      text: "hello there yes",
      words: [
        { text: "hello", startSeconds: 0, endSeconds: 0.5 },
        { text: "there", startSeconds: 0.6, endSeconds: 0.9 },
        { text: "yes", startSeconds: 1.2, endSeconds: 1.7 },
      ],
    }, [
      { speakerId: "speaker_1", startMs: 0, endMs: 1_000 },
      { speakerId: "speaker_2", startMs: 1_000, endMs: 2_000 },
    ]);
    expect(result).toHaveLength(2);
    expect(result.map((segment) => [segment.speakerId, segment.text])).toEqual([
      ["speaker_1", "hello there"],
      ["speaker_2", "yes"],
    ]);
  });

  it("handles exact matches where words align perfectly within speaker turns", () => {
    const result = alignSegmentToSpeakers({
      startSeconds: 0,
      endSeconds: 1,
      text: "exact match",
      words: [
        { text: "exact", startSeconds: 0.1, endSeconds: 0.4 },
        { text: "match", startSeconds: 0.5, endSeconds: 0.9 },
      ],
    }, [
      { speakerId: "speaker_1", startMs: 0, endMs: 1000 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].speakerId).toBe("speaker_1");
    expect(result[0].text).toBe("exact match");
  });

  it("handles fuzzy matches where word midpoints fall within speaker turns despite boundary overlaps", () => {
    // Word 1: midpoint at 450ms (inside speaker_1 0-500ms)
    // Word 2: midpoint at 750ms (inside speaker_2 500-1000ms)
    const result = alignSegmentToSpeakers({
      startSeconds: 0,
      endSeconds: 1,
      text: "fuzzy overlap",
      words: [
        { text: "fuzzy", startSeconds: 0.1, endSeconds: 0.8 },
        { text: "overlap", startSeconds: 0.7, endSeconds: 0.8 },
      ],
    }, [
      { speakerId: "speaker_1", startMs: 0, endMs: 500 },
      { speakerId: "speaker_2", startMs: 500, endMs: 1000 },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].speakerId).toBe("speaker_1");
    expect(result[1].speakerId).toBe("speaker_2");
  });

  it("handles no-match scenarios when no speaker turns are provided or cover the segment", () => {
    const result = alignSegmentToSpeakers({
      startSeconds: 0,
      endSeconds: 1,
      text: "no match",
      words: [
        { text: "no", startSeconds: 0.1, endSeconds: 0.4 },
        { text: "match", startSeconds: 0.5, endSeconds: 0.9 },
      ],
    }, []);
    expect(result).toHaveLength(1);
    expect(result[0].speakerId).toBeNull();
  });

  it("handles multi-speaker segments by splitting them correctly", () => {
    const result = alignSegmentToSpeakers({
      startSeconds: 0,
      endSeconds: 3,
      text: "one two three",
      words: [
        { text: "one", startSeconds: 0.1, endSeconds: 0.9 },
        { text: "two", startSeconds: 1.1, endSeconds: 1.9 },
        { text: "three", startSeconds: 2.1, endSeconds: 2.9 },
      ],
    }, [
      { speakerId: "speaker_1", startMs: 0, endMs: 1000 },
      { speakerId: "speaker_2", startMs: 1000, endMs: 2000 },
      { speakerId: "speaker_3", startMs: 2000, endMs: 3000 },
    ]);
    expect(result).toHaveLength(3);
    expect(result.map((s) => s.speakerId)).toEqual(["speaker_1", "speaker_2", "speaker_3"]);
  });
});
