import type { SpeechObservation } from "@/lib/analysis/observations";

export interface SpeechAnalysisProvider {
  readonly id: string;
  readonly version: string;
  analyze(audioPath: string): Promise<SpeechObservation>;
}
