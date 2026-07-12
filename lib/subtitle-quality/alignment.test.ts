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
});
