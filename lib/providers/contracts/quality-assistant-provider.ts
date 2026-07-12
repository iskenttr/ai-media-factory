export interface QualityAssistantInput {
  fingerprint: string;
  metadata: { width: number; height: number; durationMs: number; orientation: "vertical" | "horizontal" };
  cues: Array<{ index: number; startMs: number; endMs: number; text: string; lines: string[]; fontSize: number }>;
  frames: Array<{ timestampMs: number; mimeType: "image/jpeg" | "image/png"; base64: string }>;
  deterministicScore: number;
}

export interface QualityAssistantResult {
  score: number;
  rerenderRecommended: boolean;
  findings: Array<{ category: "turkish" | "segmentation" | "placement" | "collision" | "typography"; cueIndex: number | null; recommendation: string }>;
  cached: boolean;
  estimatedInputTokens: number;
}

export interface QualityAssistantProvider {
  readonly id: string;
  review(input: QualityAssistantInput): Promise<QualityAssistantResult>;
}
