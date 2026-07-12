import { describe, expect, it } from "vitest";

import type { AnalysisSnapshot } from "@/lib/analysis/observations";

import { createLocalizationPlan, DECISION_ENGINE_VERSION } from "./decision-engine";

function snapshot(overrides: Partial<AnalysisSnapshot> = {}): AnalysisSnapshot {
  return {
    jobId: "job-1",
    attempt: 1,
    language: { availability: "available", language: { code: "en", name: "English" } },
    speakers: {
      availability: "available",
      speakerCount: 2,
      segments: [
        { speakerId: "speaker_1", start: 0, end: 4 },
        { speakerId: "speaker_2", start: 4, end: 8 },
      ],
      providerVersion: "test-speaker-v1",
      limitations: [],
    },
    pacing: { availability: "available", assessment: "clear", wordsPerMinute: 130, speakingRatio: 0.7 },
    speechQuality: { availability: "available", assessment: "strong", meanVolumeDb: -20, peakVolumeDb: -3, silenceRatio: 0.1 },
    contentProfile: {
      availability: "available",
      profile: { primaryType: "interview", dialogueStructure: "multi_speaker", deliveryStyle: "conversational", visualDependency: "medium" },
      evidence: ["Explicit interview framing."],
      providerVersion: "test-model",
      limitations: [],
    },
    sourceEvents: [],
    ...overrides,
  };
}

describe("Decision Engine v2", () => {
  it("returns ready only when every required observation is available", () => {
    expect(createLocalizationPlan(snapshot())).toMatchObject({
      status: "ready",
      safeToContinue: true,
      engineVersion: DECISION_ENGINE_VERSION,
      sourceLanguage: { code: "en", name: "English" },
    });
  });

  it("blocks when source language evidence is missing", () => {
    const plan = createLocalizationPlan(snapshot({
      language: { availability: "unavailable", reason: "model_not_configured" },
    }));
    expect(plan.status).toBe("blocked");
    expect(plan.safeToContinue).toBe(false);
    expect(plan.requiredCapabilities).toContain("source_language");
    expect(plan.sourceLanguage).toBeNull();
  });

  it("limits the plan instead of guessing missing optional evidence", () => {
    const plan = createLocalizationPlan(snapshot({
      speakers: {
        availability: "unavailable",
        reason: "model_not_configured",
        speakerCount: null,
        segments: [],
        providerVersion: "unconfigured",
        limitations: ["Speaker provider is not configured."],
      },
    }));
    expect(plan.status).toBe("limited");
    expect(plan.safeToContinue).toBe(true);
    expect(plan.speakerStrategy).toBe("requires_speaker_analysis");
  });

  it("limits rather than blocks when content profiling fails", () => {
    const plan = createLocalizationPlan(snapshot({
      contentProfile: {
        availability: "unavailable",
        reason: "provider_unavailable",
        evidence: [],
        providerVersion: "deterministic-evidence-v1",
        limitations: ["Content provider failed."],
      },
    }));
    expect(plan).toMatchObject({ status: "limited", safeToContinue: true });
  });

  it("does not block solely because visual dependency is unknown", () => {
    const plan = createLocalizationPlan(snapshot({
      contentProfile: {
        availability: "available",
        profile: { primaryType: "interview", dialogueStructure: "multi_speaker", deliveryStyle: "conversational", visualDependency: "unknown" },
        evidence: ["Speaker and timestamped transcript evidence support this structure."],
        providerVersion: "test-model",
        limitations: ["No visual model is configured."],
      },
    }));
    expect(plan).toMatchObject({ status: "ready", safeToContinue: true });
  });

  it("allows a limited start when content evidence is insufficient but providers are healthy", () => {
    const plan = createLocalizationPlan(snapshot({
      contentProfile: {
        availability: "unavailable",
        reason: "insufficient_evidence",
        evidence: [],
        providerVersion: "deterministic-evidence-v1",
        limitations: ["No content type had enough explicit evidence."],
      },
    }));
    expect(plan).toMatchObject({
      status: "limited",
      safeToContinue: true,
      unavailableCapabilities: ["content_profile"],
    });
  });
});
