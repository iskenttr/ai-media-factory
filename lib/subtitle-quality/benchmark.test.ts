import { describe, it } from "vitest";
import { parseSrtTimestamp } from "./srt-parser";
import { alignSegmentToSpeakers } from "./alignment";
import { prepareCues, createQualityProfile } from "./engine";
import * as fs from "fs";
import * as path from "path";

describe("subtitle pipeline benchmarks", () => {
  it("measures performance of key pipeline stages", () => {
    // 1. SRT Parsing Benchmark
    const srtTimestamps = Array.from({ length: 1000 }, (_, i) => {
      const h = String(Math.floor(i / 3600)).padStart(2, "0");
      const m = String(Math.floor((i % 3600) / 60)).padStart(2, "0");
      const s = String(i % 60).padStart(2, "0");
      const ms = String(i % 1000).padStart(3, "0");
      return `${h}:${m}:${s},${ms}`;
    });

    const startSrt = performance.now();
    for (const ts of srtTimestamps) {
      parseSrtTimestamp(ts);
    }
    const endSrt = performance.now();
    const srtTimeMs = endSrt - startSrt;

    // 2. Segment Alignment Benchmark
    const segment = {
      startSeconds: 0,
      endSeconds: 100,
      text: "hello ".repeat(100).trim(),
      words: Array.from({ length: 100 }, (_, i) => ({
        text: "hello",
        startSeconds: i,
        endSeconds: i + 0.8,
      })),
    };
    const turns = Array.from({ length: 50 }, (_, i) => ({
      speakerId: `speaker_${i % 2}`,
      startMs: i * 2000,
      endMs: (i + 1) * 2000,
    }));

    const startAlign = performance.now();
    for (let i = 0; i < 100; i++) {
      alignSegmentToSpeakers(segment, turns);
    }
    const endAlign = performance.now();
    const alignTimeMs = endAlign - startAlign;

    // 3. Timing Adjustment / Cue Preparation Benchmark
    const profile = createQualityProfile(1080, 1920);
    const inputCues = Array.from({ length: 50 }, (_, i) => ({
      startMs: i * 3000,
      endMs: i * 3000 + 2500,
      text: "Bu çok uzun Türkçe cümle, izleyicinin rahat okuyabilmesi için anlamlı parçalara ayrılmalıdır.",
    }));

    const startPrep = performance.now();
    for (let i = 0; i < 10; i++) {
      prepareCues(inputCues, profile);
    }
    const endPrep = performance.now();
    const prepTimeMs = endPrep - startPrep;

    const report = {
      srtParsingTimeMs: srtTimeMs,
      segmentAlignmentTimeMs: alignTimeMs,
      timingAdjustmentTimeMs: prepTimeMs,
      timestamp: new Date().toISOString(),
    };

    console.log("Benchmark Results:", report);

    try {
      fs.writeFileSync(
        path.join(process.cwd(), "benchmark-report.json"),
        JSON.stringify(report, null, 2)
      );
    } catch (e) {
      // Ignore if write is not allowed or fails
    }
  });
});
