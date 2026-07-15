import { afterEach, describe, expect, it, vi } from "vitest";

import type { TranslationProviderResult } from "@/lib/localization/contracts";
import type { ProviderRegistry } from "@/lib/providers/provider-registry";

import type { AnalysisStore } from "./store";

const input = {
  run: {
    id: "run-1",
    projectId: "project-1",
    contextSnapshotId: "snapshot-1",
    status: "running" as const,
    attempt: 1,
  },
  snapshot: {
    projectId: "project-1",
    sourceLanguage: { code: "en", name: "English" },
    targetLanguage: { code: "tr", name: "Turkish" },
    contentProfile: null,
    segments: [{ id: "segment-1", sequence: 1, speakerId: "speaker_1", text: "Hello", startMs: 0, endMs: 2_000 }],
    glossaryTerms: [],
  },
  translationMode: "natural" as const,
};

const providerResult: TranslationProviderResult = {
  availability: "available",
  translatedText: "Merhaba",
  providerVersion: "test-provider-v1",
  sourceSegmentId: "segment-1",
  targetLanguage: { code: "tr", name: "Turkish" },
  translationNotes: [],
  timingAssessment: null,
  failureReason: null,
  provenance: {
    contextSnapshotId: "snapshot-1",
    inputFingerprint: "input",
    resultFingerprint: "result",
  },
};

describe("localization worker lease fencing", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("discards a localization provider result after heartbeat ownership loss", async () => {
    vi.useFakeTimers();
    let resolveTranslation: (result: TranslationProviderResult) => void = () => undefined;
    const translation = new Promise<TranslationProviderResult>((resolve) => {
      resolveTranslation = resolve;
    });
    const translate = vi.fn(() => translation);
    const providers = {
      translation: vi.fn(async () => ({ translate })),
    } as unknown as ProviderRegistry;
    const renewLocalizationLease = vi.fn()
      .mockReturnValueOnce(true)
      .mockReturnValue(false);
    const saveTranslationProviderResult = vi.fn();
    const finishLocalizationRun = vi.fn();
    const appendLocalizationEvent = vi.fn();
    const store = {
      claimNextLocalizationRun: vi.fn(() => input.run),
      getLocalizationRunInput: vi.fn(() => input),
      renewLocalizationLease,
      saveTranslationProviderResult,
      finishLocalizationRun,
      appendLocalizationEvent,
    } as unknown as AnalysisStore;
    const { runLocalizationWorkerOnce } = await import("./localization-worker");
    const running = runLocalizationWorkerOnce(store, "stale-worker", providers);

    await vi.advanceTimersByTimeAsync(0);
    expect(translate).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(100_001);
    resolveTranslation(providerResult);
    await running;

    expect(renewLocalizationLease).toHaveBeenCalledWith("run-1", "stale-worker", 300_000);
    expect(saveTranslationProviderResult).not.toHaveBeenCalled();
    expect(finishLocalizationRun).not.toHaveBeenCalled();
    expect(appendLocalizationEvent).not.toHaveBeenCalled();
  });

  it("discards a regeneration provider result after heartbeat ownership loss", async () => {
    vi.useFakeTimers();
    let resolveTranslation: (result: TranslationProviderResult) => void = () => undefined;
    const translation = new Promise<TranslationProviderResult>((resolve) => {
      resolveTranslation = resolve;
    });
    const translate = vi.fn(() => translation);
    const providers = {
      translation: vi.fn(async () => ({ translate })),
    } as unknown as ProviderRegistry;
    const renewTranslationRegenerationLease = vi.fn()
      .mockReturnValueOnce(true)
      .mockReturnValue(false);
    const saveTranslationRegenerationResult = vi.fn();
    const failTranslationRegenerationJob = vi.fn();
    const store = {
      claimNextLocalizationRun: vi.fn(() => null),
      claimNextTranslationRegenerationJob: vi.fn(() => ({
        id: "regeneration-1",
        runId: "run-1",
        sourceSegmentId: "segment-1",
        leaseOwner: "stale-worker",
      })),
      getLocalizationRunInput: vi.fn(() => input),
      renewTranslationRegenerationLease,
      saveTranslationRegenerationResult,
      failTranslationRegenerationJob,
    } as unknown as AnalysisStore;
    const { runLocalizationWorkerOnce } = await import("./localization-worker");
    const running = runLocalizationWorkerOnce(store, "stale-worker", providers);

    await vi.advanceTimersByTimeAsync(0);
    expect(translate).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(100_001);
    resolveTranslation(providerResult);
    await running;

    expect(renewTranslationRegenerationLease).toHaveBeenCalledWith("regeneration-1", "stale-worker", 300_000);
    expect(saveTranslationRegenerationResult).not.toHaveBeenCalled();
    expect(failTranslationRegenerationJob).not.toHaveBeenCalled();
  });
});
