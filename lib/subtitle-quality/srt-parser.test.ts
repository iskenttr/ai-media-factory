import { describe, expect, it } from "vitest";
import { parseSrtTimestamp, parseSrt } from "./srt-parser";

describe("SRT Timestamp Parser", () => {
  it("consistently parses standard comma timestamps", () => {
    expect(parseSrtTimestamp("00:00:00,000")).toBe(0);
    expect(parseSrtTimestamp("01:02:03,456")).toBe(3723456);
    expect(parseSrtTimestamp("99:59:59,999")).toBe(359999999);
  });

  it("consistently parses period variants", () => {
    expect(parseSrtTimestamp("00:00:00.000")).toBe(0);
    expect(parseSrtTimestamp("01:02:03.456")).toBe(3723456);
    expect(parseSrtTimestamp("99:59:59.999")).toBe(359999999);
  });

  it("handles whitespace padding", () => {
    expect(parseSrtTimestamp("  00:01:20,500  ")).toBe(80500);
  });

  it("rejects malformed timestamps", () => {
    // Missing milliseconds
    expect(() => parseSrtTimestamp("00:00:00")).toThrow();
    // Too few digits for minutes/seconds
    expect(() => parseSrtTimestamp("0:00:00,000")).toThrow();
    expect(() => parseSrtTimestamp("00:0:00,000")).toThrow();
    expect(() => parseSrtTimestamp("00:00:0,000")).toThrow();
    // Wrong millisecond length
    expect(() => parseSrtTimestamp("00:00:00,00")).toThrow();
    expect(() => parseSrtTimestamp("00:00:00,0000")).toThrow();
    // Invalid delimiters
    expect(() => parseSrtTimestamp("00;00;00,000")).toThrow();
    expect(() => parseSrtTimestamp("00:00:00-000")).toThrow();
    // Non-numeric characters
    expect(() => parseSrtTimestamp("00:aa:00,000")).toThrow();
  });

  it("rejects out-of-range values", () => {
    // Minutes >= 60
    expect(() => parseSrtTimestamp("00:60:00,000")).toThrow("Invalid minutes");
    expect(() => parseSrtTimestamp("00:99:00,000")).toThrow("Invalid minutes");
    // Seconds >= 60
    expect(() => parseSrtTimestamp("00:00:60,000")).toThrow("Invalid seconds");
    expect(() => parseSrtTimestamp("00:00:85,000")).toThrow("Invalid seconds");
  });
});

describe("SRT Parser", () => {
  it("parses empty files", () => {
    expect(parseSrt("")).toEqual([]);
    expect(parseSrt("   \n\n  ")).toEqual([]);
  });

  it("parses standard SRT content", () => {
    const srt = `1\n00:00:01,000 --> 00:00:04,000\nHello World\n\n2\n00:00:05,000 --> 00:00:08,000\nThis is a test.`;
    const result = parseSrt(srt);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ startMs: 1000, endMs: 4000, text: "Hello World" });
    expect(result[1]).toEqual({ startMs: 5000, endMs: 8000, text: "This is a test." });
  });

  it("rejects missing sequence numbers", () => {
    const srt = `00:00:01,000 --> 00:00:04,000\nHello World`;
    expect(() => parseSrt(srt)).toThrow("Missing or invalid sequence number");
  });

  it("rejects malformed timestamps in SRT content", () => {
    const srt = `1\n00:00:01 --> 00:00:04,000\nHello World`;
    expect(() => parseSrt(srt)).toThrow();
  });

  it("handles Unicode characters", () => {
    const srt = `1\n00:00:01,000 --> 00:00:04,000\nÇığ, öğle, şüphe, İstanbul.`;
    const result = parseSrt(srt);
    expect(result[0].text).toBe("Çığ, öğle, şüphe, İstanbul.");
  });

  it("preserves HTML tags in text", () => {
    const srt = `1\n00:00:01,000 --> 00:00:04,000\n<i>Hello</i> <b>World</b>`;
    const result = parseSrt(srt);
    expect(result[0].text).toBe("<i>Hello</i> <b>World</b>");
  });

  it("parses overlapping segments", () => {
    const srt = `1\n00:00:01,000 --> 00:00:04,000\nFirst segment\n\n2\n00:00:03,000 --> 00:00:06,000\nOverlapping segment`;
    const result = parseSrt(srt);
    expect(result).toHaveLength(2);
    expect(result[0].startMs).toBe(1000);
    expect(result[0].endMs).toBe(4000);
    expect(result[1].startMs).toBe(3000);
    expect(result[1].endMs).toBe(6000);
  });
});
