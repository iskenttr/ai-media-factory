import { z } from "zod";

export const localizationPlanSchema = z.object({
  status: z.enum(["ready", "limited", "blocked"]),
  safeToContinue: z.boolean(),
  sourceLanguage: z.object({ code: z.string(), name: z.string() }).nullable(),
  speakerStrategy: z.enum(["preserve_detected_speakers", "requires_speaker_analysis"]),
  timingStrategy: z.enum(["preserve_clear_pacing", "adapt_dense_pacing", "review_variable_pacing", "requires_pacing_analysis"]),
  speechQualityStrategy: z.enum(["use_source_audio", "enhance_source_audio", "requires_audio_review"]),
  contentAdaptationStrategy: z.enum(["preserve_detected_structure", "requires_content_profile"]),
  constraints: z.array(z.string()),
  limitations: z.array(z.string()),
  unavailableCapabilities: z.array(z.string()),
  requiredCapabilities: z.array(z.string()),
  decisionReasons: z.array(z.string()),
  engineVersion: z.string(),
  sourceEventIds: z.array(z.string()),
});

export type LocalizationPlan = z.infer<typeof localizationPlanSchema>;
