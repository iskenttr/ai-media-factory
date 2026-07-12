import { z } from "zod";

export const analysisEventTypes = [
  "upload_received",
  "media_metadata_ready",
  "audio_extracted",
  "language_detected",
  "speaker_analysis_completed",
  "pacing_analysis_completed",
  "speech_quality_assessed",
  "content_profile_completed",
  "analysis_completed",
  "analysis_failed",
] as const;

export const analysisEventTypeSchema = z.enum(analysisEventTypes);
export type AnalysisEventType = z.infer<typeof analysisEventTypeSchema>;

export const unavailableReasonSchema = z.enum([
  "audio_missing",
  "insufficient_signal",
  "insufficient_speech",
  "insufficient_evidence",
  "model_not_configured",
  "provider_unavailable",
  "unsupported_media",
]);

export type UnavailableReason = z.infer<typeof unavailableReasonSchema>;

const unavailableResultSchema = z.object({
  availability: z.literal("unavailable"),
  reason: unavailableReasonSchema,
});

const availableLanguageSchema = z.object({
  availability: z.literal("available"),
  language: z.object({
    code: z.string().min(2).max(12),
    name: z.string().min(1),
  }),
});

const speakerSegmentSchema = z.object({
  speakerId: z.string().regex(/^speaker_[1-9]\d*$/),
  start: z.number().nonnegative(),
  end: z.number().positive(),
}).refine((segment) => segment.end > segment.start, "Speaker segment must have positive duration");

const speakerResultSchema = z.discriminatedUnion("availability", [
  z.object({
    availability: z.literal("available"),
    speakerCount: z.number().int().positive(),
    segments: z.array(speakerSegmentSchema).min(1),
    providerVersion: z.string().min(1),
    limitations: z.array(z.string()),
  }),
  z.object({
    availability: z.literal("unavailable"),
    reason: unavailableReasonSchema,
    speakerCount: z.null(),
    segments: z.array(z.never()).max(0),
    providerVersion: z.string().min(1),
    limitations: z.array(z.string()).min(1),
  }),
]);

const availablePacingSchema = z.object({
  availability: z.literal("available"),
  assessment: z.enum(["clear", "dense", "variable"]),
  wordsPerMinute: z.number().nonnegative(),
  speakingRatio: z.number().min(0).max(1),
});

const availableSpeechQualitySchema = z.object({
  availability: z.literal("available"),
  assessment: z.enum(["strong", "usable", "limited"]),
  meanVolumeDb: z.number(),
  peakVolumeDb: z.number(),
  silenceRatio: z.number().min(0).max(1),
});

export const contentProfileSchema = z.object({
  primaryType: z.enum([
    "interview",
    "podcast",
    "tutorial",
    "presentation",
    "reaction",
    "talking_head",
    "product_demo",
    "other",
  ]),
  dialogueStructure: z.enum(["single_speaker", "multi_speaker", "mixed", "unknown"]),
  deliveryStyle: z.enum(["conversational", "instructional", "promotional", "narrative", "unknown"]),
  visualDependency: z.enum(["low", "medium", "high", "unknown"]),
});

const contentProfileResultSchema = z.discriminatedUnion("availability", [
  z.object({
    availability: z.literal("available"),
    profile: contentProfileSchema,
    evidence: z.array(z.string()).min(1),
    providerVersion: z.string().min(1),
    limitations: z.array(z.string()),
  }),
  z.object({
    availability: z.literal("unavailable"),
    reason: unavailableReasonSchema,
    evidence: z.array(z.string()),
    providerVersion: z.string().min(1),
    limitations: z.array(z.string()).min(1),
  }),
]);

export const eventPayloadSchemas = {
  upload_received: z.object({
    fileName: z.string().min(1),
    sizeBytes: z.number().int().positive(),
    mimeType: z.string().min(1),
    sha256: z.string().length(64),
  }),
  media_metadata_ready: z.object({
    availability: z.literal("available"),
    durationMs: z.number().int().positive(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    audioPresent: z.boolean(),
    container: z.string().min(1),
  }),
  audio_extracted: z.object({
    availability: z.literal("available"),
    sampleRateHz: z.literal(16000),
    channels: z.literal(1),
    format: z.literal("wav"),
  }),
  language_detected: z.union([availableLanguageSchema, unavailableResultSchema]),
  speaker_analysis_completed: speakerResultSchema,
  pacing_analysis_completed: z.union([availablePacingSchema, unavailableResultSchema]),
  speech_quality_assessed: z.union([availableSpeechQualitySchema, unavailableResultSchema]),
  content_profile_completed: contentProfileResultSchema,
  analysis_completed: z.object({
    readiness: z.enum(["ready", "limited", "blocked"]),
    sourceEventIds: z.array(z.string().min(1)),
  }),
  analysis_failed: z.object({
    stage: z.enum([
      "upload_verification",
      "media_metadata",
      "audio_extraction",
      "language",
      "speakers",
      "pacing",
      "speech_quality",
      "content_profile",
      "analysis",
    ]),
    retryable: z.boolean(),
    reason: z.string().min(1),
    safeMessage: z.string().min(1),
  }),
} satisfies Record<AnalysisEventType, z.ZodType>;

export type EventPayload<T extends AnalysisEventType> = z.infer<(typeof eventPayloadSchemas)[T]>;

export interface AnalysisEvent<T extends AnalysisEventType = AnalysisEventType> {
  schemaVersion: 1;
  eventId: string;
  jobId: string;
  uploadId: string;
  attempt: number;
  sequence: number;
  type: T;
  occurredAt: string;
  payload: EventPayload<T>;
}

export type AnyAnalysisEvent = {
  [T in AnalysisEventType]: AnalysisEvent<T>;
}[AnalysisEventType];

export function parseAnalysisEvent(value: unknown): AnyAnalysisEvent {
  const envelope = z
    .object({
      schemaVersion: z.literal(1),
      eventId: z.string().min(1),
      jobId: z.string().min(1),
      uploadId: z.string().min(1),
      attempt: z.number().int().positive(),
      sequence: z.number().int().positive(),
      type: analysisEventTypeSchema,
      occurredAt: z.iso.datetime(),
      payload: z.unknown(),
    })
    .parse(value);

  return {
    ...envelope,
    payload: eventPayloadSchemas[envelope.type].parse(envelope.payload),
  } as AnyAnalysisEvent;
}

export function isAvailable(payload: unknown): payload is { availability: "available" } {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "availability" in payload &&
    payload.availability === "available"
  );
}
