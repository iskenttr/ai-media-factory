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

  it("returns segment with null speakerId when no turns provided", () => {
    const result = alignSegmentToSpeakers(
      { startSeconds: 0, endSeconds: 5, text: "Hello world" },
      [],
    );
    expect(result).toHaveLength(1);
    expect(result[0].speakerId).toBeNull();
    expect(result[0].text).toBe("Hello world");
  });

  it("uses segment midpoint for speaker assignment when segment has no words", () => {
    const result = alignSegmentToSpeakers(
      { startSeconds: 0, endSeconds: 5, text: "Hello world", words: [] },
      [{ speakerId: "speaker_1", startMs: 0, endMs: 5000 }],
    );
    expect(result).toHaveLength(1);
    // Midpoint of segment (0-5s) is 2.5s = 2500ms, which falls within the turn
    expect(result[0].speakerId).toBe("speaker_1");
  });

  it("assigns speaker based on midpoint when segment has no words", () => {
    const result = alignSegmentToSpeakers(
      { startSeconds: 0, endSeconds: 4, text: "Hello world", words: [] },
      [{ speakerId: "speaker_1", startMs: 0, endMs: 4000 }],
    );
    expect(result).toHaveLength(1);
    expect(result[0].speakerId).toBe("speaker_1");
  });

  it("returns segment unchanged when midpoint is outside all turns", () => {
    const result = alignSegmentToSpeakers(
      { startSeconds: 0, endSeconds: 5, text: "Hello world", words: [] },
      [{ speakerId: "speaker_1", startMs: 1000, endMs: 2000 }],
    );
    expect(result).toHaveLength(1);
    expect(result[0].speakerId).toBeNull();
  });

  it("groups consecutive words by same speaker", () => {
    const result = alignSegmentToSpeakers(
      {
        startSeconds: 0,
        endSeconds: 3,
        text: "Hello there friend",
        words: [
          { text: "Hello", startSeconds: 0, endSeconds: 1 },
          { text: "there", startSeconds: 1, endSeconds: 2 },
          { text: "friend", startSeconds: 2, endSeconds: 3 },
        ],
      },
      [{ speakerId: "speaker_1", startMs: 0, endMs: 3000 }],
    );
    expect(result).toHaveLength(1);
    expect(result[0].speakerId).toBe("speaker_1");
    expect(result[0].text).toBe("Hello there friend");
  });

  it("handles speaker turns that don't cover all words", () => {
    const result = alignSegmentToSpeakers(
      {
        startSeconds: 0,
        endSeconds: 5,
        text: "Hello you",
        words: [
          { text: "Hello", startSeconds: 0, endSeconds: 1 },
          { text: "you", startSeconds: 4, endSeconds: 5 },
        ],
      },
      [{ speakerId: "speaker_1", startMs: 0, endMs: 1000 }],
    );
    expect(result).toHaveLength(2);
    expect(result[0].speakerId).toBe("speaker_1");
    expect(result[1].speakerId).toBeNull();
  });

  it("handles overlapping speaker turns", () => {
    const result = alignSegmentToSpeakers(
      {
        startSeconds: 1,
        endSeconds: 2,
        text: "Test",
        words: [{ text: "Test", startSeconds: 1, endSeconds: 2 }],
      },
      [
        { speakerId: "speaker_1", startMs: 0, endMs: 2000 },
        { speakerId: "speaker_2", startMs: 500, endMs: 2500 },
      ],
    );
    expect(result).toHaveLength(1);
    // First matching turn wins
    expect(result[0].speakerId).toBe("speaker_1");
  });

  it("preserves word objects in result", () => {
    const words = [{ text: "Hello", startSeconds: 0, endSeconds: 1 }];
    const result = alignSegmentToSpeakers(
      { startSeconds: 0, endSeconds: 1, text: "Hello", words },
      [{ speakerId: "speaker_1", startMs: 0, endMs: 1000 }],
    );
    expect(result[0].words).toHaveLength(1);
    expect(result[0].words![0].text).toBe("Hello");
  });

  it("handles empty turns array", () => {
    const words = [{ text: "Hello", startSeconds: 0, endSeconds: 1 }];
    const result = alignSegmentToSpeakers(
      { startSeconds: 0, endSeconds: 1, text: "Hello", words },
      [],
    );
    expect(result).toHaveLength(1);
    expect(result[0].speakerId).toBeNull();
  });

  it("handles single word matching single turn", () => {
    const result = alignSegmentToSpeakers(
      {
        startSeconds: 2,
        endSeconds: 3,
        text: "Hello",
        words: [{ text: "Hello", startSeconds: 2, endSeconds: 3 }],
      },
      [{ speakerId: "speaker_1", startMs: 2000, endMs: 3000 }],
    );
    expect(result).toHaveLength(1);
    expect(result[0].speakerId).toBe("speaker_1");
  });

  it("handles multiple speaker changes", () => {
    const result = alignSegmentToSpeakers(
      {
        startSeconds: 0,
        endSeconds: 6,
        text: "One Two Three Four Five Six",
        words: [
          { text: "One", startSeconds: 0, endSeconds: 1 },
          { text: "Two", startSeconds: 1, endSeconds: 2 },
          { text: "Three", startSeconds: 2, endSeconds: 3 },
          { text: "Four", startSeconds: 3, endSeconds: 4 },
          { text: "Five", startSeconds: 4, endSeconds: 5 },
          { text: "Six", startSeconds: 5, endSeconds: 6 },
        ],
      },
      [
        { speakerId: "speaker_1", startMs: 0, endMs: 2000 },
        { speakerId: "speaker_2", startMs: 2000, endMs: 4000 },
        { speakerId: "speaker_3", startMs: 4000, endMs: 6000 },
      ],
    );
    expect(result).toHaveLength(3);
    expect(result[0].speakerId).toBe("speaker_1");
    expect(result[0].text).toBe("One Two");
    expect(result[1].speakerId).toBe("speaker_2");
    expect(result[1].text).toBe("Three Four");
    expect(result[2].speakerId).toBe("speaker_3");
    expect(result[2].text).toBe("Five Six");
  });

  it("does not mutate original segment", () => {
    const segment = {
      startSeconds: 0,
      endSeconds: 1,
      text: "Hello",
      words: [{ text: "Hello", startSeconds: 0, endSeconds: 1 }],
    };
    const result = alignSegmentToSpeakers(segment, [
      { speakerId: "speaker_1", startMs: 0, endMs: 1000 },
    ]);
    expect(result[0]).not.toBe(segment);
    expect((segment as { speakerId?: unknown }).speakerId).toBeUndefined();
  });
});
