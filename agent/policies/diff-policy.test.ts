// @vitest-environment node
import { describe, expect, it } from "vitest";
import { inspectDiff } from "./diff-policy";
import { validateTaskSafety } from "../tasks/schema";

const task = validateTaskSafety({
  task_id: "SAFE-001", title: "Safe diff check", priority: "high", objective: "Validate a small safe fixture-only candidate.", enabled: true,
  allowed_paths: ["benchmarks/**"], forbidden_paths: ["benchmarks/golden/**"],
  success_criteria: { unit_tests_pass: true, integration_tests_pass: true, render_tests_pass: true, maximum_critical_errors: 0, minimum_quality_delta: 0, maximum_regressions: 0 },
  limits: { maximum_iterations: 1, maximum_changed_files: 2, maximum_diff_lines: 20, maximum_render_attempts: 1, maximum_model_calls: 0, maximum_model_tokens: 1000, maximum_execution_ms: 120000 },
  required_artifacts: ["git-diff.patch"], test_commands: [],
  execution: { kind: "controlled_sample", target: "benchmarks/fixtures/x.txt", content: "safe" },
});

describe("candidate diff policy", () => {
  it("approves a small allowed diff", () => expect(inspectDiff(task, ["benchmarks/fixtures/x.txt"], "+safe\n").secretScan).toBe("passed"));
  it("rejects forbidden paths", () => expect(() => inspectDiff(task, ["benchmarks/golden/x.txt"], "+x")).toThrow("task_forbidden_path"));
  it("rejects likely credentials", () => expect(() => inspectDiff(task, ["benchmarks/fixtures/x.txt"], "+api_key=abcdefghijklmnop123456")).toThrow("possible_secret"));
  it("rejects symlinks and executable-mode changes", () => expect(() => inspectDiff(task, ["benchmarks/fixtures/x.txt"], "new file mode 120000\n+../../escape")).toThrow("unsafe_git_mode_change"));
});
