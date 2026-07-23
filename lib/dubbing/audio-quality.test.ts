// @vitest-environment node
import { describe, expect, it } from "vitest";

import { evaluateDubbingQuality, measurePcm16Wav, parseEbur128Summary, wordErrorRate } from "./audio-quality";

function wavFromSamples(samples: number[], sampleRate = 16_000) {
  const dataBytes = samples.length * 2;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write("WAVE", 8, "ascii");
  wav.write("fmt ", 12, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(dataBytes, 40);
  samples.forEach((sample, index) => wav.writeInt16LE(sample, 44 + index * 2));
  return wav;
}

function tone(durationMs: number, amplitude = 5_000, frequency = 180) {
  const sampleRate = 16_000;
  const count = Math.round(durationMs / 1_000 * sampleRate);
  return wavFromSamples(Array.from({ length: count }, (_, index) =>
    Math.round(Math.sin(2 * Math.PI * frequency * index / sampleRate) * amplitude)));
}

describe("dubbing audio quality evidence", () => {
  it("measures physical PCM signal and clipping instead of inventing a score", () => {
    const measured = measurePcm16Wav(tone(1_000));
    expect(measured.durationMs).toBe(1_000);
    expect(measured.peakDbfs).toBeLessThan(-10);
    expect(measured.clippedSamples).toBe(0);
    expect(measured.signature.estimatedPitchHz).toBeGreaterThan(150);
  });

  it("calculates Turkish-normalized word error rate", () => {
    expect(wordErrorRate("İyi akşamlar, nasılsınız?", "iyi akşamlar nasılsınız")).toBe(0);
    expect(wordErrorRate("bir iki üç dört", "bir iki dört")).toBe(0.25);
  });

  it("returns explicit metric gates and no aggregate quality score", () => {
    const audio = tone(1_000);
    const report = evaluateDubbingQuality({
      segments: [
        {
          segmentId: "one",
          speakerId: "speaker_1",
          voiceProfileId: "tr-TR-Wavenet-A",
          expectedText: "Merhaba dünya",
          recognizedText: "Merhaba dünya",
          targetDurationMs: 1_000,
          synthesizedDurationMs: 980,
          fittedDurationMs: 1_000,
          audioBuffer: audio,
        },
        {
          segmentId: "two",
          speakerId: "speaker_1",
          voiceProfileId: "tr-TR-Wavenet-A",
          expectedText: "Merhaba dünya",
          recognizedText: "Merhaba dünya",
          targetDurationMs: 1_000,
          synthesizedDurationMs: 990,
          fittedDurationMs: 1_000,
          audioBuffer: audio,
        },
      ],
      finalAudio: audio,
      integratedLufs: -16,
      truePeakDbfs: -2,
    });
    expect(report.aggregateScore).toBeNull();
    expect(report.passed).toBe(true);
    expect(report.intelligibility.maximumWordErrorRate).toBe(0);
    expect(report.speakerConsistency).toMatchObject({
      assignmentConflicts: [],
      acousticSimilarityAvailable: true,
      minimumAcousticSimilarity: 1,
    });
  });

  it("parses the final EBU R128 summary", () => {
    const parsed = parseEbur128Summary(`
      Integrated loudness:
        I:         -16.2 LUFS
      True peak:
        Peak:       -1.4 dBFS
    `);
    expect(parsed).toEqual({ integratedLufs: -16.2, truePeakDbfs: -1.4 });
  });
});
