import { describe, expect, it } from "vitest";

import type { ContentProfileInput } from "../../contracts/content-profile-provider";
import { DeterministicContentProfileProvider } from "./deterministic-content-profile-provider";

function input(transcript: string, speakerCount = 1): ContentProfileInput {
  return {
    durationMs: 60_000,
    speech: {
      transcript,
      segments: [{ startSeconds: 0, endSeconds: 55, text: transcript }],
      language: { code: "en", name: "English" },
      providerId: "test-speech",
      providerVersion: "1",
    },
    speakers: {
      availability: "available",
      speakerCount,
      segments: Array.from({ length: speakerCount }, (_, index) => ({
        speakerId: `speaker_${index + 1}`,
        start: index * 10,
        end: index * 10 + 8,
      })),
      providerVersion: "test-speaker",
      limitations: [],
    },
    pacing: { availability: "available", assessment: "clear", wordsPerMinute: 130, speakingRatio: 0.7 },
    speechQuality: { availability: "available", assessment: "strong", meanVolumeDb: -20, peakVolumeDb: -3, silenceRatio: 0.1 },
  };
}

const filler = " This section provides enough spoken context for a reliable structural observation based on the actual timestamped transcript evidence.";

describe("DeterministicContentProfileProvider", () => {
  const provider = new DeterministicContentProfileProvider();

  it("classifies an explicitly framed interview with supporting evidence", async () => {
    const result = await provider.analyze(input(
      `Welcome to this interview. Our guest is joining us today to answer detailed questions.${filler.repeat(4)}`,
      2,
    ));
    expect(result).toMatchObject({
      availability: "available",
      profile: {
        primaryType: "interview",
        dialogueStructure: "multi_speaker",
        deliveryStyle: "conversational",
        visualDependency: "unknown",
      },
      providerVersion: "deterministic-evidence-v1",
    });
    if (result.availability === "available") expect(result.evidence.length).toBeGreaterThanOrEqual(3);
  });

  it("classifies a tutorial only from multiple instructional markers", async () => {
    const result = await provider.analyze(input(
      `This is how to configure the project. Step one is preparation. Next, we verify the output.${filler.repeat(4)}`,
    ));
    expect(result).toMatchObject({
      availability: "available",
      profile: { primaryType: "tutorial", deliveryStyle: "instructional" },
    });
  });

  it("classifies an interview from question and multi-speaker evidence", async () => {
    const result = await provider.analyze(input(
      `How has this community changed your life? It changed my career and helped me meet many people. I learned to research, write, share knowledge, and collaborate with others.${filler.repeat(3)}`,
      2,
    ));
    expect(result).toMatchObject({
      availability: "available",
      profile: { primaryType: "interview", dialogueStructure: "multi_speaker" },
    });
    if (result.availability === "available") {
      expect(result.evidence).toContain("Timestamped speech contains a question and speaker analysis found multiple anonymous speakers.");
    }
  });

  it("returns unavailable when evidence is insufficient", async () => {
    const result = await provider.analyze(input(filler.repeat(5)));
    expect(result).toMatchObject({
      availability: "unavailable",
      reason: "insufficient_evidence",
    });
  });

  it("returns unavailable for short speech rather than guessing", async () => {
    const result = await provider.analyze(input("Welcome to this podcast."));
    expect(result).toMatchObject({ availability: "unavailable", reason: "insufficient_speech" });
  });
});
