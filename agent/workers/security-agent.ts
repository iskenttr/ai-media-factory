import type { EngineeringTask } from "../tasks/schema";
import { inspectDiff } from "../policies/diff-policy";

export function reviewCandidate(task: EngineeringTask, files: string[], patch: string) {
  const review = inspectDiff(task, files, patch);
  return { approved: true, reviewer: "security-agent", ...review };
}
