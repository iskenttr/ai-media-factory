// @vitest-environment node
import { describe, expect, it } from "vitest";
import { assertTransition, isTerminal } from "./state-machine";

describe("task state machine", () => {
  it("allows the required forward lifecycle", () => {
    const states = ["QUEUED", "ANALYZING", "PLANNED", "IMPLEMENTING", "TESTING", "RENDERING", "EVALUATING", "ACCEPTED"] as const;
    states.slice(1).forEach((state, index) => expect(() => assertTransition(states[index], state)).not.toThrow());
  });
  it("prevents skipped stages", () => expect(() => assertTransition("QUEUED", "IMPLEMENTING")).toThrow("invalid_task_transition"));
  it("makes acceptance terminal", () => expect(isTerminal("ACCEPTED")).toBe(true));
});
