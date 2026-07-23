import { z } from "zod";

import { targetLanguageSchema } from "@/lib/studio/contracts";

export const translationModeSchema = z.enum(["faithful", "natural", "adaptive"]);
export const translationAvailabilitySchema = z.enum(["available", "unavailable"]);
export const translationRunStatusSchema = z.enum(["queued", "running", "completed", "partial", "failed"]);
export const timingStatusSchema = z.enum(["fits", "tight", "overflow", "unavailable"]);

export const timingAssessmentSchema = z.object({
  originalDurationMs: z.number().int().positive(),
  translatedCharacterCount: z.number().int().nonnegative(),
  translatedWordCount: z.number().int().nonnegative(),
  estimatedSpeakingDurationMs: z.number().int().positive().nullable(),
  status: timingStatusSchema,
  methodVersion: z.string().min(1),
  reason: z.string().min(1),
});

export const translationProviderResultSchema = z.object({
  availability: translationAvailabilitySchema,
  translatedText: z.string().min(1).nullable(),
  providerVersion: z.string().min(1),
  sourceSegmentId: z.string().min(1),
  targetLanguage: targetLanguageSchema,
  translationNotes: z.array(z.string()),
  timingAssessment: timingAssessmentSchema.nullable(),
  failureReason: z.string().nullable(),
  provenance: z.object({
    contextSnapshotId: z.string().min(1),
    inputFingerprint: z.string().min(1),
    resultFingerprint: z.string().min(1),
  }),
});

export type TranslationMode = z.infer<typeof translationModeSchema>;
export type TimingAssessment = z.infer<typeof timingAssessmentSchema>;
export type TranslationProviderResult = z.infer<typeof translationProviderResultSchema>;

export interface TranslationContextSegment {
  id: string;
  sequence: number;
  speakerId: string;
  text: string;
  startMs: number;
  endMs: number;
}

export interface TranslationProviderInput {
  projectId: string;
  contextSnapshotId: string;
  sourceLanguage: z.infer<typeof targetLanguageSchema>;
  targetLanguage: z.infer<typeof targetLanguageSchema>;
  segmentId: string;
  sourceText: string;
  previousSegments: TranslationContextSegment[];
  nextSegments: TranslationContextSegment[];
  speakerId: string;
  contentProfile: string | null;
  timingBudget: { startMs: number; endMs: number; durationMs: number };
  glossaryTerms: Array<{ source: string; target: string }>;
  translationMode: TranslationMode;
}

export interface LocalizationEvent {
  eventId: string;
  runId: string;
  sequence: number;
  type: "localization_run_created" | "translation_segment_completed" | "translation_segment_failed" | "translation_segment_edited" | "translation_segment_regeneration_queued" | "translation_segment_regenerated" | "translation_segment_regeneration_failed" | "localization_run_completed" | "localization_run_partial" | "localization_run_failed";
  payload: Record<string, unknown>;
  occurredAt: string;
}

export interface TranslationRevisionData {
  id: string;
  version: number;
  translatedText: string;
  origin: "provider" | "user" | "restore";
  isActive: boolean;
  createdAt: string;
}

export interface LocalizedSegmentData {
  sourceSegmentId: string;
  translatedText: string | null;
  status: "pending" | "translated" | "failed" | "stale";
  revision: number | null;
  revisionOrigin: TranslationRevisionData["origin"] | null;
  revisionCount: number;
  timing: TimingAssessment | null;
  failureReason: string | null;
  voiceId?: string | null;
}

export interface LocalizationRunData {
  id: string;
  status: z.infer<typeof translationRunStatusSchema>;
  targetLanguage: z.infer<typeof targetLanguageSchema>;
  translatedCount: number;
  totalCount: number;
  segments: LocalizedSegmentData[];
  render: VideoRenderData | null;
}

export interface VideoRenderData {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  failureReason: string | null;
  previewUrl: string | null;
  downloadUrl: string | null;
}
