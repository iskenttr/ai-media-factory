// @vitest-environment node
import { describe, expect, it } from "vitest";

import { evaluateDubbingQuality } from "./audio-quality";

function clippedPcm16Wav(durationMs = 1_000, sampleRate = 16_000) {
  const sampleCount = Math.round(durationMs / 1_000 * sampleRate);
  const bytes = Buffer.alloc(44 + sampleCount * 2);
  bytes.write("RIFF", 0, "ascii");
  bytes.writeUInt32LE(36 + sampleCount * 2, 4);
  bytes.write("WAVE", 8, "ascii");
  bytes.write("fmt ", 12, "ascii");
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36, "ascii");
  bytes.writeUInt32LE(sampleCount * 2, 40);
  for (let index = 0; index < sampleCount; index += 1) {
    bytes.writeInt16LE(index % 2 === 0 ? 32_767 : -32_768, 44 + index * 2);
  }
  return bytes;
}

describe("dubbing clipping gate", () => {
  it("rejects clipped output even when transcript, timing, and loudness gates pass", () => {
    const audio = clippedPcm16Wav();
    const report = evaluateDubbingQuality({
      segments: [{
        segmentId: "clipped-segment",
        speakerId: "speaker_1",
        voiceProfileId: "tr-TR-Wavenet-A",
        expectedText: "Merhaba",
        recognizedText: "Merhaba",
        targetDurationMs: 1_000,
        synthesizedDurationMs: 1_000,
        fittedDurationMs: 1_000,
        audioBuffer: audio,
      }],
      finalAudio: audio,
      integratedLufs: -16,
      truePeakDbfs: -1.5,
    });

    expect(report.aggregateScore).toBeNull();
    expect(report.intelligibility.passed).toBe(true);
    expect(report.synchronization.passed).toBe(true);
    expect(report.loudness.passed).toBe(true);
    expect(report.clipping).toMatchObject({ passed: false });
    expect(report.clipping.clippedSampleRatio).toBeGreaterThan(0.99);
    expect(report.passed).toBe(false);
  });
});
