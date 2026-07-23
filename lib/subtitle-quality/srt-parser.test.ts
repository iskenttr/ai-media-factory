import { describe, expect, it } from "vitest";
import { parseSrtTimestamp } from "./srt-parser";

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

  it("handles regression for GitHub issue with comma and period decimal separators", () => {
    const commaTimestamp = "00:00:00,000";
    const periodTimestamp = "00:00:00.000";
    expect(parseSrtTimestamp(commaTimestamp)).toBe(0);
    expect(parseSrtTimestamp(periodTimestamp)).toBe(0);
    expect(parseSrtTimestamp("00:01:20,005")).toBe(80005);
    expect(parseSrtTimestamp("00:01:20.005")).toBe(80005);
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
