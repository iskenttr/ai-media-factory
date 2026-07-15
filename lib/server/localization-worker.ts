import { randomUUID } from "node:crypto";

import type { TimingAssessment, TranslationContextSegment, TranslationProviderResult } from "@/lib/localization/contracts";
import { LocalProviderRegistry, type ProviderRegistry } from "@/lib/providers/provider-registry";

import { getSpeakingRate, serverConfig } from "./config";
import { AnalysisStore, getAnalysisStore } from "./store";

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function assessTiming(text: string, startMs: number, endMs: number, languageCode: string = "tr"): TimingAssessment {
  const originalDurationMs = endMs - startMs;
  const translatedWordCount = wordCount(text);
  // Use language-specific speaking rate (default 150 WPM for unknown languages)
  const speakingRate = getSpeakingRate(languageCode);
  const estimatedSpeakingDurationMs = Math.ceil((translatedWordCount / speakingRate) * 60_000);
  const ratio = estimatedSpeakingDurationMs / originalDurationMs;
  const status = ratio <= 0.86 ? "fits" as const : ratio <= 1 ? "tight" as const : "overflow" as const;
  return {
    originalDurationMs,
    translatedCharacterCount: text.length,
    translatedWordCount,
    estimatedSpeakingDurationMs,
    status,
    methodVersion: "target-rate-v1",
    reason: status === "fits" ? "This should fit the original timing." : status === "tight"
      ? "This may fit the original timing, but it is close." : "This is likely longer than the original timing window.",
  };
}

function context(segments: TranslationContextSegment[], index: number) {
  const current = segments[index];
  const previous = segments.slice(Math.max(0, index - 3), index);
  const following = segments.slice(index + 1, index + 3);
  const sameSpeaker = segments.slice(0, index).filter((segment) => segment.speakerId === current.speakerId).slice(-2);
  return { previous: [...previous, ...sameSpeaker.filter((segment) => !previous.some((item) => item.id === segment.id))], following };
}

async function translateSegment(
  store: AnalysisStore,
  runId: string,
  sourceSegmentId: string,
  providers: ProviderRegistry,
): Promise<TranslationProviderResult> {
  const input = store.getLocalizationRunInput(runId);
  if (!input) throw new Error("localization_run_input_unavailable");
  const index = input.snapshot.segments.findIndex((segment) => segment.id === sourceSegmentId);
  if (index < 0) throw new Error("localization_segment_input_unavailable");
  const segment = input.snapshot.segments[index];
  const nearby = context(input.snapshot.segments, index);
  const provider = await providers.translation();
  const base: TranslationProviderResult = provider
    ? await provider.translate({
        projectId: input.snapshot.projectId,
        contextSnapshotId: input.run.contextSnapshotId,
        sourceLanguage: input.snapshot.sourceLanguage,
        targetLanguage: input.snapshot.targetLanguage,
        segmentId: segment.id,
        sourceText: segment.text,
        previousSegments: nearby.previous,
        nextSegments: nearby.following,
        speakerId: segment.speakerId,
        contentProfile: input.snapshot.contentProfile,
        timingBudget: { startMs: segment.startMs, endMs: segment.endMs, durationMs: segment.endMs - segment.startMs },
        glossaryTerms: input.snapshot.glossaryTerms,
        translationMode: input.translationMode,
      })
    : {
        availability: "unavailable", translatedText: null, providerVersion: "unconfigured", sourceSegmentId: segment.id,
        targetLanguage: input.snapshot.targetLanguage, translationNotes: [], timingAssessment: null,
        failureReason: "provider_not_configured", provenance: { contextSnapshotId: input.run.contextSnapshotId, inputFingerprint: "unavailable", resultFingerprint: "unavailable" },
      };
  return base.availability === "available" && base.translatedText
    ? { ...base, timingAssessment: assessTiming(base.translatedText, segment.startMs, segment.endMs, input.snapshot.targetLanguage.code) }
    : base;
}

async function processRun(store: AnalysisStore, runId: string, workerId: string, providers: ProviderRegistry) {
  const input = store.getLocalizationRunInput(runId);
  if (!input) throw new Error("localization_run_input_unavailable");
  const heartbeat = setInterval(
    () => store.renewLocalizationLease(runId, workerId, serverConfig.workerLeaseMs),
    Math.max(1_000, Math.floor(serverConfig.workerLeaseMs / 3)),
  );
  try {
    const provider = await providers.translation();
    let translated = 0;
    let failed = 0;
    for (const [index, segment] of input.snapshot.segments.entries()) {
      const nearby = context(input.snapshot.segments, index);
      const base: TranslationProviderResult = provider
        ? await provider.translate({
            projectId: input.snapshot.projectId,
            contextSnapshotId: input.run.contextSnapshotId,
            sourceLanguage: input.snapshot.sourceLanguage,
            targetLanguage: input.snapshot.targetLanguage,
            segmentId: segment.id,
            sourceText: segment.text,
            previousSegments: nearby.previous,
            nextSegments: nearby.following,
            speakerId: segment.speakerId,
            contentProfile: input.snapshot.contentProfile,
            timingBudget: { startMs: segment.startMs, endMs: segment.endMs, durationMs: segment.endMs - segment.startMs },
            glossaryTerms: input.snapshot.glossaryTerms,
            translationMode: input.translationMode,
          })
        : {
            availability: "unavailable", translatedText: null, providerVersion: "unconfigured", sourceSegmentId: segment.id,
            targetLanguage: input.snapshot.targetLanguage, translationNotes: [], timingAssessment: null,
            failureReason: "provider_not_configured", provenance: { contextSnapshotId: input.run.contextSnapshotId, inputFingerprint: "unavailable", resultFingerprint: "unavailable" },
          };
      const result = base.availability === "available" && base.translatedText
        ? { ...base, timingAssessment: assessTiming(base.translatedText, segment.startMs, segment.endMs, input.snapshot.targetLanguage.code) }
        : base;
      const saved = store.saveTranslationProviderResult(runId, result);
      if (saved.status === "translated") {
        translated += 1;
        store.appendLocalizationEvent(runId, "translation_segment_completed", {
          sourceSegmentId: segment.id, translatedCount: translated, totalCount: input.snapshot.segments.length,
        }, `${runId}:${segment.id}:completed`);
      } else {
        failed += 1;
        store.appendLocalizationEvent(runId, "translation_segment_failed", {
          sourceSegmentId: segment.id, reason: result.failureReason ?? "translation_unavailable",
        }, `${runId}:${segment.id}:failed`);
      }
    }
    const status = translated === input.snapshot.segments.length ? "completed" as const : translated > 0 ? "partial" as const : "failed" as const;
    store.finishLocalizationRun(runId, status, status === "failed" ? "translation_unavailable" : undefined);
    store.appendLocalizationEvent(runId, status === "completed" ? "localization_run_completed" : status === "partial" ? "localization_run_partial" : "localization_run_failed", {
      translatedCount: translated, failedCount: failed, totalCount: input.snapshot.segments.length,
    }, `${runId}:${status}`);
  } finally {
    clearInterval(heartbeat);
  }
}

async function processRegeneration(store: AnalysisStore, jobId: string, runId: string, sourceSegmentId: string, workerId: string, providers: ProviderRegistry) {
  const heartbeat = setInterval(
    () => store.renewTranslationRegenerationLease(jobId, workerId, serverConfig.workerLeaseMs),
    Math.max(1_000, Math.floor(serverConfig.workerLeaseMs / 3)),
  );
  try {
    const result = await translateSegment(store, runId, sourceSegmentId, providers);
    store.saveTranslationRegenerationResult(jobId, result);
  } finally {
    clearInterval(heartbeat);
  }
}

export async function runLocalizationWorkerOnce(
  store = getAnalysisStore(),
  workerId = `localization-worker-${randomUUID()}`,
  providers: ProviderRegistry = new LocalProviderRegistry(
    undefined,
    undefined,
    undefined,
    undefined,
    false,
    serverConfig.argosTranslateCommand,
  ),
) {
  const run = store.claimNextLocalizationRun(workerId, serverConfig.workerLeaseMs);
  if (run) {
    try {
      await processRun(store, run.id, workerId, providers);
    } catch (error) {
      store.finishLocalizationRun(run.id, "failed", "translation_interrupted");
      store.appendLocalizationEvent(run.id, "localization_run_failed", {
        reason: error instanceof Error ? error.message : "translation_interrupted",
      }, `${run.id}:interrupted`);
    }
    return true;
  }
  const regeneration = store.claimNextTranslationRegenerationJob(workerId, serverConfig.workerLeaseMs);
  if (!regeneration) return false;
  try {
    await processRegeneration(store, regeneration.id, regeneration.runId, regeneration.sourceSegmentId, workerId, providers);
  } catch (error) {
    store.failTranslationRegenerationJob(regeneration.id, error instanceof Error ? error.message : "translation_interrupted");
  }
  return true;
}
