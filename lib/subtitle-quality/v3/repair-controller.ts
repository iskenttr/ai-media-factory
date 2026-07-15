export interface RepairObservation {
  iteration: number;
  score: number;
  criticalErrors: number;
  failureFingerprint: string;
  testsPassed: boolean;
}

export function mayAttemptRepair(history: RepairObservation[], maximumIterations: number) {
  const latest = history.at(-1);
  if (!latest) return { allowed: true, reason: "first_attempt" };
  if (!latest.testsPassed) return { allowed: false, reason: "tests_unstable" };
  if (latest.iteration >= maximumIterations) return { allowed: false, reason: "maximum_iterations" };
  const repeated = history.slice(-2).every((item) => item.failureFingerprint === latest.failureFingerprint);
  if (history.length >= 2 && repeated) return { allowed: false, reason: "repeated_failure" };
  const previous = history.at(-2);
  if (previous && (latest.score <= previous.score || latest.criticalErrors > previous.criticalErrors)) return { allowed: false, reason: "no_measurable_improvement" };
  return { allowed: true, reason: "measurable_strategy_available" };
}
