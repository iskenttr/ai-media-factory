export interface AlignedWord {
  text: string;
  startMs: number;
  endMs: number;
  confidence?: number;
}

export interface SpeakerTurn {
  speakerId: string;
  startMs: number;
  endMs: number;
}

export type QualityFailureClass = "timing" | "segmentation" | "reading_speed" | "bounds" | "unicode"
  | "collision" | "media_duration" | "render" | "provider_advisory";

export interface QualityMetricSnapshot {
  score: number;
  cueCount: number;
  overlapCount: number;
  minimumGapMs: number | null;
  maximumCps: number;
  minimumFontSize: number;
  maximumLineCount: number;
  collisionScore: number;
  durationDeltaMs: number;
  failures: QualityFailureClass[];
}

export interface SubtitleDiff {
  added: number;
  removed: number;
  changedTiming: number;
  changedText: number;
  scoreDelta: number;
  regressions: string[];
}
