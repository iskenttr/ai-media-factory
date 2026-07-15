import { z } from "zod";

const issueSchema = z.object({
  code: z.string().min(1),
  severity: z.enum(["info", "warning", "critical"]),
  cueId: z.string().optional(),
  message: z.string().min(1),
  value: z.number().optional(),
  limit: z.number().optional(),
});

export const qualityReportV3Schema = z.object({
  schemaVersion: z.literal("subtitle-quality-v3"),
  runId: z.string().min(1),
  videoId: z.string().min(1),
  createdAt: z.iso.datetime(),
  source: z.object({ durationMs: z.number().nonnegative(), width: z.number().positive().optional(), height: z.number().positive().optional() }),
  overallScore: z.number().min(0).max(100),
  criticalErrorCount: z.number().int().nonnegative(),
  segments: z.array(z.object({
    id: z.string(), startMs: z.number(), endMs: z.number(), durationMs: z.number(), characters: z.number().int().nonnegative(),
    charactersPerSecond: z.number().nullable(), lineCount: z.number().int().nonnegative(), maximumLineLength: z.number().int().nonnegative(),
    gapBeforeMs: z.number().nullable(), overlapBeforeMs: z.number().nonnegative(), speakerChanged: z.boolean(), issues: z.array(issueSchema),
  })),
  metrics: z.object({
    cueCount: z.number().int().nonnegative(), invalidTimestampCount: z.number().int().nonnegative(), emptyCueCount: z.number().int().nonnegative(),
    overlapCount: z.number().int().nonnegative(), totalOverlapMs: z.number().nonnegative(), minimumGapMs: z.number().nullable(), maximumCps: z.number().nonnegative(),
    maximumLineCount: z.number().int().nonnegative(), maximumLineLength: z.number().int().nonnegative(), speakerChangeCount: z.number().int().nonnegative(),
    videoOverflowCount: z.number().int().nonnegative(), safeAreaViolationCount: z.number().int().nonnegative().nullable(),
  }),
  checks: z.record(z.string(), z.object({ status: z.enum(["passed", "failed", "not_run"]), issueCount: z.number().int().nonnegative(), detail: z.string().optional() })),
  recommendations: z.array(z.string()),
  issues: z.array(issueSchema),
});
