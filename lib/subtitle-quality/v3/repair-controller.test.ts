import { describe, expect, it } from "vitest";

import { mayAttemptRepair, type RepairObservation } from "./repair-controller";

const observation = (overrides: Partial<RepairObservation> = {}): RepairObservation => ({
  iteration: 1,
  score: 70,
  criticalErrors: 2,
  failureFingerprint: "reading-speed",
  testsPassed: true,
  ...overrides,
});

describe("subtitle quality V3 repair controller", () => {
  it("allows the first attempt", () => {
    expect(mayAttemptRepair([], 5)).toEqual({ allowed: true, reason: "first_attempt" });
  });

  it("stops when tests are unstable or the iteration limit is reached", () => {
    expect(mayAttemptRepair([observation({ testsPassed: false })], 5))
      .toEqual({ allowed: false, reason: "tests_unstable" });
    expect(mayAttemptRepair([observation({ iteration: 5 })], 5))
      .toEqual({ allowed: false, reason: "maximum_iterations" });
  });

  it("stops when the same failure repeats", () => {
    expect(mayAttemptRepair([
      observation({ iteration: 1, score: 70 }),
      observation({ iteration: 2, score: 75 }),
    ], 5)).toEqual({ allowed: false, reason: "repeated_failure" });
  });

  it("requires score improvement without additional critical errors", () => {
    expect(mayAttemptRepair([
      observation({ iteration: 1, failureFingerprint: "timing", score: 75 }),
      observation({ iteration: 2, failureFingerprint: "bounds", score: 75 }),
    ], 5)).toEqual({ allowed: false, reason: "no_measurable_improvement" });

    expect(mayAttemptRepair([
      observation({ iteration: 1, failureFingerprint: "timing", score: 75, criticalErrors: 1 }),
      observation({ iteration: 2, failureFingerprint: "bounds", score: 80, criticalErrors: 2 }),
    ], 5)).toEqual({ allowed: false, reason: "no_measurable_improvement" });
  });

  it("allows a distinct strategy that measurably improves quality", () => {
    expect(mayAttemptRepair([
      observation({ iteration: 1, failureFingerprint: "timing", score: 75, criticalErrors: 2 }),
      observation({ iteration: 2, failureFingerprint: "bounds", score: 80, criticalErrors: 1 }),
    ], 5)).toEqual({ allowed: true, reason: "measurable_strategy_available" });
  });
});
