export type QualitySeverity = "info" | "warning" | "critical";
export type CheckStatus = "passed" | "failed" | "not_run";

export interface RawSubtitleCue {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  speakerId?: string;
  bounds?: { x: number; y: number; width: number; height: number };
}

export interface SafeAreaMetadata {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DeterministicIssue {
  code: string;
  severity: QualitySeverity;
  cueId?: string;
  message: string;
  value?: number;
  limit?: number;
}

export interface CueQualityResult {
  id: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  characters: number;
  charactersPerSecond: number | null;
  lineCount: number;
  maximumLineLength: number;
  gapBeforeMs: number | null;
  overlapBeforeMs: number;
  speakerChanged: boolean;
  issues: DeterministicIssue[];
}

export interface QualityCheckResult {
  status: CheckStatus;
  issueCount: number;
  detail?: string;
}

export interface QualityReportV3 {
  schemaVersion: "subtitle-quality-v3";
  runId: string;
  videoId: string;
  createdAt: string;
  source: { durationMs: number; width?: number; height?: number };
  overallScore: number;
  criticalErrorCount: number;
  segments: CueQualityResult[];
  metrics: {
    cueCount: number;
    invalidTimestampCount: number;
    emptyCueCount: number;
    overlapCount: number;
    totalOverlapMs: number;
    minimumGapMs: number | null;
    maximumCps: number;
    maximumLineCount: number;
    maximumLineLength: number;
    speakerChangeCount: number;
    videoOverflowCount: number;
    safeAreaViolationCount: number | null;
  };
  checks: Record<string, QualityCheckResult>;
  recommendations: string[];
  issues: DeterministicIssue[];
}

export interface QualityEvaluationInput {
  runId: string;
  videoId: string;
  videoDurationMs: number;
  videoWidth?: number;
  videoHeight?: number;
  cues: RawSubtitleCue[];
  safeArea?: SafeAreaMetadata;
  assText?: string;
  limits?: Partial<QualityLimits>;
}

export interface QualityLimits {
  maximumCps: number;
  maximumLines: number;
  maximumLineLength: number;
  minimumCueDurationMs: number;
  maximumCueDurationMs: number;
  maximumCriticalErrors: number;
}

export interface AssValidationResult {
  status: CheckStatus;
  dialogueCount: number;
  issues: DeterministicIssue[];
}
