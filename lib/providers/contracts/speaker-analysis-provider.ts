import type { SpeakerObservation } from "@/lib/analysis/observations";

export interface SpeakerAnalysisProvider {
  readonly id: string;
  readonly version: string;
  analyze(audioPath: string): Promise<SpeakerObservation>;
}
