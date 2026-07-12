import { randomUUID } from "node:crypto";

import type {
  AnalysisEventType,
  AnyAnalysisEvent,
  EventPayload,
  UnavailableReason,
} from "@/lib/analysis/contracts";
import type { SpeechObservation } from "@/lib/analysis/observations";
import { buildAnalysisSnapshot } from "@/lib/decision-engine/build-analysis-snapshot";
import { createLocalizationPlan } from "@/lib/decision-engine/decision-engine";
import { LocalProviderRegistry, type ProviderRegistry } from "@/lib/providers/provider-registry";
import { ProviderError } from "@/lib/providers/provider-errors";

import { serverConfig, workDirectory } from "./config";
import {
  assessAudioSignal,
  extractAnalysisAudio,
  probeMedia,
  removeWorkDirectory,
  type MediaMetadata,
} from "./media";
import { AnalysisStore, type AnalysisJobRecord, getAnalysisStore } from "./store";

interface StageResults {
  language: EventPayload<"language_detected">;
  speakers: EventPayload<"speaker_analysis_completed">;
  pacing: EventPayload<"pacing_analysis_completed">;
  speechQuality: EventPayload<"speech_quality_assessed">;
  contentProfile: EventPayload<"content_profile_completed">;
}

function unavailable(reason: UnavailableReason) {
  return { availability: "unavailable" as const, reason };
}

function speakerUnavailable(reason: UnavailableReason, limitation: string) {
  return {
    availability: "unavailable" as const,
    reason,
    speakerCount: null,
    segments: [] as [],
    providerVersion: "unconfigured",
    limitations: [limitation],
  };
}

function contentUnavailable(reason: UnavailableReason, limitation: string) {
  return {
    availability: "unavailable" as const,
    reason,
    evidence: [],
    providerVersion: "deterministic-evidence-v1",
    limitations: [limitation],
  };
}

function eventKey(job: AnalysisJobRecord, type: AnalysisEventType) {
  return `${job.id}:${job.attempt}:${type}`;
}

export function computePacing(speech: SpeechObservation, durationMs: number) {
  const words = speech.segments.reduce(
    (total, segment) => total + segment.text.split(/\s+/).filter(Boolean).length,
    0,
  );
  const speakingSeconds = speech.segments.reduce(
    (total, segment) => total + Math.max(0, segment.endSeconds - segment.startSeconds),
    0,
  );
  if (words === 0 || speakingSeconds === 0) return unavailable("insufficient_speech");

  const speakingRatio = Math.min(1, speakingSeconds / (durationMs / 1000));
  const wordsPerMinute = (words / speakingSeconds) * 60;
  const rates = speech.segments.map((segment) => {
    const duration = segment.endSeconds - segment.startSeconds;
    return duration > 0
      ? (segment.text.split(/\s+/).filter(Boolean).length / duration) * 60
      : 0;
  }).filter((rate) => rate > 0);
  const mean = rates.reduce((total, rate) => total + rate, 0) / rates.length;
  const variance = rates.reduce((total, rate) => total + (rate - mean) ** 2, 0) / rates.length;
  const variability = mean > 0 ? Math.sqrt(variance) / mean : 0;
  const assessment = variability > 0.5
    ? "variable" as const
    : wordsPerMinute > 185 || speakingRatio > 0.82
      ? "dense" as const
      : "clear" as const;
  return {
    availability: "available" as const,
    assessment,
    wordsPerMinute: Number(wordsPerMinute.toFixed(1)),
    speakingRatio: Number(speakingRatio.toFixed(3)),
  };
}

function providerFailureReason(error: unknown): UnavailableReason {
  if (error instanceof ProviderError && error.code === "insufficient_speech") {
    return "insufficient_speech";
  }
  return "provider_unavailable";
}

async function analyzeStages(
  job: AnalysisJobRecord,
  metadata: MediaMetadata,
  audioPath: string | null,
  providers: ProviderRegistry,
): Promise<{ results: StageResults; speech: SpeechObservation | null }> {
  if (!metadata.audioPresent || !audioPath) {
    const noAudio = unavailable("audio_missing");
    return {
      results: {
        language: noAudio,
        speakers: speakerUnavailable("audio_missing", "No audio is available for speaker analysis."),
        pacing: noAudio,
        speechQuality: noAudio,
        contentProfile: contentUnavailable("audio_missing", "No speech evidence is available for content classification."),
      },
      speech: null,
    };
  }

  let speechQuality: StageResults["speechQuality"];
  try {
    speechQuality = { availability: "available", ...await assessAudioSignal(job.sourcePath, metadata.durationMs) };
  } catch {
    speechQuality = unavailable("insufficient_signal");
  }

  const speechProvider = await providers.speech();
  const speakerProvider = await providers.speakers();
  let speech: SpeechObservation | null = null;
  let language: StageResults["language"] = unavailable("model_not_configured");
  let pacing: StageResults["pacing"] = unavailable("model_not_configured");
  let speakers: StageResults["speakers"] = speakerUnavailable(
    "model_not_configured",
    "A local speaker model is not configured.",
  );

  if (speechProvider) {
    try {
      speech = await speechProvider.analyze(audioPath);
      language = speech.language
        ? { availability: "available", language: speech.language }
        : unavailable("insufficient_speech");
      pacing = computePacing(speech, metadata.durationMs);
    } catch (error) {
      const failure = unavailable(providerFailureReason(error));
      language = failure;
      pacing = failure;
    }
  }

  if (speakerProvider) {
    try {
      speakers = await speakerProvider.analyze(audioPath);
    } catch (error) {
      const reason = providerFailureReason(error);
      speakers = speakerUnavailable(
        reason,
        reason === "insufficient_speech"
          ? "There is not enough speech to identify speakers reliably."
          : "The local speaker provider could not complete diarization.",
      );
    }
  }

  let contentProfile: StageResults["contentProfile"];
  if (!speech) {
    contentProfile = contentUnavailable(
      language.availability === "unavailable" ? language.reason : "insufficient_speech",
      "A timestamped transcript is required for evidence-based content classification.",
    );
  } else {
    try {
      contentProfile = await providers.contentProfile().analyze({
        durationMs: metadata.durationMs,
        speech,
        speakers,
        pacing,
        speechQuality,
      });
    } catch {
      contentProfile = contentUnavailable(
        "provider_unavailable",
        "The content evidence provider could not complete classification.",
      );
    }
  }

  return { results: { language, speakers, pacing, speechQuality, contentProfile }, speech };
}

async function processJob(
  store: AnalysisStore,
  job: AnalysisJobRecord,
  workerId: string,
  providers: ProviderRegistry,
) {
  const sourceEvents: AnyAnalysisEvent[] = [];
  const append = <T extends AnalysisEventType>(type: T, payload: EventPayload<T>) => {
    const event = store.appendEvent(job.id, job.attempt, type, payload, eventKey(job, type));
    sourceEvents.push(event as AnyAnalysisEvent);
    return event;
  };
  const leaseHeartbeat = setInterval(
    () => store.renewLease(job.id, workerId, serverConfig.workerLeaseMs),
    Math.max(1_000, Math.floor(serverConfig.workerLeaseMs / 3)),
  );

  try {
    append("upload_received", {
      fileName: job.fileName,
      sizeBytes: job.sizeBytes,
      mimeType: job.mimeType,
      sha256: job.sha256,
    });

    let metadata: MediaMetadata;
    try {
      metadata = await probeMedia(job.sourcePath);
    } catch {
      const failure = append("analysis_failed", {
        stage: "media_metadata",
        retryable: false,
        reason: "unsupported_media",
        safeMessage: "I couldn’t read this video safely. Please choose another video.",
      });
      store.failJob(job.id, String(failure.payload.reason));
      return;
    }
    append("media_metadata_ready", { availability: "available", ...metadata });

    let audioPath: string | null = null;
    if (metadata.audioPresent) {
      try {
        audioPath = await extractAnalysisAudio(job.sourcePath, workDirectory(job.id, job.attempt));
        append("audio_extracted", {
          availability: "available",
          sampleRateHz: 16000,
          channels: 1,
          format: "wav",
        });
      } catch {
        const failure = append("analysis_failed", {
          stage: "audio_extraction",
          retryable: true,
          reason: "audio_extraction_failed",
          safeMessage: "I couldn’t prepare the audio for analysis. Your upload is safe.",
        });
        store.failJob(job.id, String(failure.payload.reason));
        return;
      }
    }

    const { results, speech } = await analyzeStages(job, metadata, audioPath, providers);
    const observationEvents = [
      append("language_detected", results.language),
      append("speaker_analysis_completed", results.speakers),
      append("pacing_analysis_completed", results.pacing),
      append("speech_quality_assessed", results.speechQuality),
      append("content_profile_completed", results.contentProfile),
    ];
    const languageEvent = observationEvents.find((event) => event.type === "language_detected");
    const transcriptId = speech && languageEvent
      ? store.saveSourceTranscript({
          jobId: job.id,
          attempt: job.attempt,
          speech,
          sourceEventId: languageEvent.eventId,
          speakerSegments: results.speakers.availability === "available" ? results.speakers.segments : undefined,
        })
      : null;
    for (const event of observationEvents) {
      const speechProvenance = speech && ["language_detected", "pacing_analysis_completed"].includes(event.type);
      const eventProvenance = event.type === "speaker_analysis_completed" || event.type === "content_profile_completed"
        ? event.payload.providerVersion
        : undefined;
      const providerId = event.type === "speaker_analysis_completed"
        ? event.payload.providerVersion === "unconfigured" ? undefined : "pyannote-community-1"
        : event.type === "content_profile_completed"
          ? "deterministic-evidence"
          : speechProvenance ? speech?.providerId : undefined;
      store.saveObservation({
        jobId: job.id,
        attempt: job.attempt,
        capability: event.type,
        result: event.payload,
        sourceEventId: event.eventId,
        providerId,
        providerVersion: speechProvenance ? speech.providerVersion : eventProvenance,
      });
    }

    const snapshot = buildAnalysisSnapshot(sourceEvents);
    const plan = store.saveLocalizationPlan(job.id, job.attempt, createLocalizationPlan(snapshot));
    if (transcriptId) store.ensureLocalizationProject(job.id, transcriptId);
    append("analysis_completed", { readiness: plan.status, sourceEventIds: plan.sourceEventIds });
    store.completeJob(job.id, plan.status);
  } finally {
    clearInterval(leaseHeartbeat);
    await removeWorkDirectory(workDirectory(job.id, job.attempt));
  }
}

export async function runWorkerOnce(
  store = getAnalysisStore(),
  workerId = `worker-${randomUUID()}`,
  providers: ProviderRegistry = new LocalProviderRegistry(
    serverConfig.whisperCppBinary,
    serverConfig.whisperModelPath,
    serverConfig.pyannotePython,
    serverConfig.pyannoteModelPath,
  ),
) {
  const job = store.claimNextJob(workerId, serverConfig.workerLeaseMs);
  if (!job) return false;

  try {
    await processJob(store, job, workerId, providers);
  } catch {
    const failure = store.appendEvent(job.id, job.attempt, "analysis_failed", {
      stage: "analysis",
      retryable: true,
      reason: "analysis_interrupted",
      safeMessage: "I couldn’t finish understanding this video. Your upload is safe.",
    }, eventKey(job, "analysis_failed"));
    store.failJob(job.id, String(failure.payload.reason));
  }
  return true;
}
