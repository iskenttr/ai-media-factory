import type { TaskState } from "../tasks/schema";

const transitions: Record<TaskState, TaskState[]> = {
  QUEUED: ["ANALYZING", "BLOCKED", "BLOCKED_REQUIRES_HUMAN_APPROVAL", "FAILED"],
  ANALYZING: ["PLANNED", "BLOCKED", "BLOCKED_REQUIRES_HUMAN_APPROVAL", "FAILED"],
  PLANNED: ["IMPLEMENTING", "BLOCKED", "BLOCKED_REQUIRES_HUMAN_APPROVAL", "FAILED"],
  IMPLEMENTING: ["TESTING", "BLOCKED", "BLOCKED_REQUIRES_HUMAN_APPROVAL", "FAILED"],
  TESTING: ["RENDERING", "REPAIRING", "REJECTED", "FAILED"],
  RENDERING: ["EVALUATING", "REPAIRING", "REJECTED", "FAILED"],
  EVALUATING: ["ACCEPTED", "REPAIRING", "REJECTED", "BLOCKED", "FAILED"],
  REPAIRING: ["IMPLEMENTING", "TESTING", "REJECTED", "BLOCKED", "FAILED"],
  ACCEPTED: [], REJECTED: [], BLOCKED: [], BLOCKED_REQUIRES_HUMAN_APPROVAL: [], FAILED: [],
};

export function assertTransition(from: TaskState, to: TaskState) {
  if (!transitions[from].includes(to)) throw new Error(`invalid_task_transition:${from}->${to}`);
}

export function isTerminal(state: TaskState) {
  return transitions[state].length === 0;
}
