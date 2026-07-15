import { describe, expect, it } from "vitest";

import { nextRepair } from "./repair";
import type { RepairState } from "./repair";
import type { QualityMetricSnapshot } from "./contracts";

function makeState(overrides: Partial<RepairState> = {}): RepairState {
  return {
    attempt: 0,
    profile: {
      width: 1920,
      height: 1080,
      orientation: "horizontal",
      safeLeft: 134,
      safeRight: 134,
      safeTop: 86,
      safeBottom: 86,
      preferredBottom: 129,
      minFontSize: 32,
      maxFontSize: 56,
      maxCps: 17,
      minCueMs: 480,
      maxCueMs: 6000,
      cueGapMs: 30,
    },
    bottomCandidateIndex: 0,
    ...overrides,
  };
}

function makeMetrics(overrides: Partial<QualityMetricSnapshot> = {}): QualityMetricSnapshot {
  return {
    score: 85,
    cueCount: 2,
    overlapCount: 0,
    minimumGapMs: 30,
    maximumCps: 12.5,
    minimumFontSize: 32,
    maximumLineCount: 2,
    collisionScore: 0.05,
    durationDeltaMs: 0,
    failures: [],
    ...overrides,
  };
}

describe("nextRepair", () => {
  it("returns null when attempt count reaches 5", () => {
    const state = makeState({ attempt: 5 });
    const metrics = makeMetrics();
    expect(nextRepair(state, metrics)).toBeNull();
  });

  it("increments attempt counter on successful repair", () => {
    const state = makeState({ attempt: 0 });
    const metrics = makeMetrics();
    const result = nextRepair(state, metrics);
    expect(result).not.toBeNull();
    expect(result!.attempt).toBe(1);
  });

  it("reduces maxFontSize when bounds failure is present", () => {
    const state = makeState({ profile: { ...makeState().profile, maxFontSize: 56 } });
    const metrics = makeMetrics({ failures: ["bounds"] });
    const result = nextRepair(state, metrics);
    expect(result).not.toBeNull();
    expect(result!.profile.maxFontSize).toBe(54); // reduced by 2
  });

  it("does not reduce maxFontSize below minFontSize", () => {
    const state = makeState({ profile: { ...makeState().profile, maxFontSize: 34, minFontSize: 32 } });
    const metrics = makeMetrics({ failures: ["bounds"] });
    const result = nextRepair(state, metrics);
    expect(result).not.toBeNull();
    expect(result!.profile.maxFontSize).toBe(32); // clamped to minFontSize
  });

  it("reduces maxCueMs when reading_speed failure is present", () => {
    const state = makeState({ profile: { ...makeState().profile, maxCueMs: 6000 } });
    const metrics = makeMetrics({ failures: ["reading_speed"] });
    const result = nextRepair(state, metrics);
    expect(result).not.toBeNull();
    expect(result!.profile.maxCueMs).toBe(5500); // reduced by 500
  });

  it("reduces maxCueMs when timing failure is present", () => {
    const state = makeState({ profile: { ...makeState().profile, maxCueMs: 5000 } });
    const metrics = makeMetrics({ failures: ["timing"] });
    const result = nextRepair(state, metrics);
    expect(result).not.toBeNull();
    expect(result!.profile.maxCueMs).toBe(4500); // reduced by 500
  });

  it("does not reduce maxCueMs below 3500", () => {
    const state = makeState({ profile: { ...makeState().profile, maxCueMs: 3500 } });
    const metrics = makeMetrics({ failures: ["reading_speed"] });
    const result = nextRepair(state, metrics);
    expect(result).not.toBeNull();
    expect(result!.profile.maxCueMs).toBe(3500); // at minimum
  });

  it("increases bottomCandidateIndex when collision failure is present", () => {
    const state = makeState({ bottomCandidateIndex: 1 });
    const metrics = makeMetrics({ failures: ["collision"] });
    const result = nextRepair(state, metrics);
    expect(result).not.toBeNull();
    expect(result!.bottomCandidateIndex).toBe(2);
  });

  it("handles multiple failures at once", () => {
    const state = makeState({
      profile: { ...makeState().profile, maxFontSize: 56, maxCueMs: 6000 },
      bottomCandidateIndex: 0,
    });
    const metrics = makeMetrics({ failures: ["bounds", "reading_speed", "collision"] });
    const result = nextRepair(state, metrics);
    expect(result).not.toBeNull();
    expect(result!.profile.maxFontSize).toBe(54);
    expect(result!.profile.maxCueMs).toBe(5500);
    expect(result!.bottomCandidateIndex).toBe(1);
  });

  it("preserves profile fields not affected by failures", () => {
    const state = makeState({
      profile: {
        ...makeState().profile,
        minFontSize: 32,
        maxFontSize: 56,
        cueGapMs: 30,
      },
    });
    const metrics = makeMetrics({ failures: ["reading_speed"] });
    const result = nextRepair(state, metrics);
    expect(result).not.toBeNull();
    expect(result!.profile.minFontSize).toBe(32);
    expect(result!.profile.cueGapMs).toBe(30);
  });

  it("returns new profile object instead of mutating", () => {
    const state = makeState();
    const metrics = makeMetrics({ failures: ["bounds"] });
    const result = nextRepair(state, metrics);
    expect(result).not.toBeNull();
    expect(result!.profile).not.toBe(state.profile);
  });

  it("handles empty failures array", () => {
    const state = makeState({ attempt: 0 });
    const metrics = makeMetrics({ failures: [] });
    const result = nextRepair(state, metrics);
    expect(result).not.toBeNull();
    expect(result!.attempt).toBe(1);
    expect(result!.bottomCandidateIndex).toBe(0);
  });

  it("cumulative bounds reductions do not exceed minimum", () => {
    let state = makeState({ profile: { ...makeState().profile, maxFontSize: 40, minFontSize: 32 } });
    const metrics = makeMetrics({ failures: ["bounds"] });
    for (let i = 0; i < 10; i++) {
      const result = nextRepair(state, metrics);
      if (!result) break;
      state = result;
    }
    expect(state.profile.maxFontSize).toBe(32);
  });
});
