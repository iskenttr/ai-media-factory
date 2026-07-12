import { z } from "zod";

import type { LocalizationRunData } from "@/lib/localization/contracts";

export const targetLanguageSchema = z.object({
  code: z.string().min(2).max(12),
  name: z.string().min(1).max(80),
});

export const transcriptPatchSchema = z.object({
  text: z.string().trim().min(1).max(20_000).optional(),
  speakerId: z.string().regex(/^speaker_[1-9]\d*$/).optional(),
  startMs: z.number().int().nonnegative().optional(),
  endMs: z.number().int().positive().optional(),
}).refine((patch) => Object.keys(patch).length > 0, "A correction must change a segment")
  .refine((patch) => patch.startMs === undefined || patch.endMs === undefined || patch.endMs > patch.startMs, "End time must be after start time");

export type TargetLanguage = z.infer<typeof targetLanguageSchema>;
export type TranscriptPatch = z.infer<typeof transcriptPatchSchema>;

export interface StudioSegment {
  id: string;
  sourceSegmentId: string;
  sequence: number;
  speakerId: string;
  speakerAssigned: boolean;
  startMs: number;
  endMs: number;
  originalText: string;
  correctionVersion: number;
}

export const suggestionStatusSchema = z.enum(["open", "accepted", "ignored", "superseded"]);
export const suggestionConfidenceSchema = z.enum(["high", "medium", "low"]);
export const suggestionTypeSchema = z.enum(["transcript_review", "speaker_review", "overlapping_speech", "sentence_review"]);

export interface StudioSuggestion {
  id: string;
  segmentId: string | null;
  type: z.infer<typeof suggestionTypeSchema>;
  confidence: z.infer<typeof suggestionConfidenceSchema>;
  title: string;
  explanation: string;
  status: z.infer<typeof suggestionStatusSchema>;
}

export interface StudioProjectData {
  jobId: string;
  video: { name: string; durationMs: number; width: number; height: number; sourceUrl: string };
  sourceLanguage: TargetLanguage | null;
  targetLanguage: TargetLanguage | null;
  setupPrepared: boolean;
  speakerCount: number | null;
  contentStructure: string | null;
  limitations: string[];
  sourceEventIds: string[];
  segments: StudioSegment[];
  suggestions: StudioSuggestion[];
  localization: LocalizationRunData | null;
}
