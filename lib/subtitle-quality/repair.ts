import type { QualityMetricSnapshot } from "./contracts";
import type { QualityProfile } from "./engine";

export interface RepairState { attempt: number; profile: QualityProfile; bottomCandidateIndex: number }

export function nextRepair(state: RepairState, metrics: QualityMetricSnapshot): RepairState | null {
  if (state.attempt >= 5) return null;
  const profile = { ...state.profile };
  let bottomCandidateIndex = state.bottomCandidateIndex;
  if (metrics.failures.includes("bounds")) {
    profile.maxFontSize = Math.max(profile.minFontSize, profile.maxFontSize - 2);
  }
  if (metrics.failures.includes("reading_speed") || metrics.failures.includes("timing")) {
    profile.maxCueMs = Math.max(3_500, profile.maxCueMs - 500);
    profile.cueGapMs = Math.max(30, profile.cueGapMs);
  }
  if (metrics.failures.includes("collision")) bottomCandidateIndex += 1;
  return { attempt: state.attempt + 1, profile, bottomCandidateIndex };
}
