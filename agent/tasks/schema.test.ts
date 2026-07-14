// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { validateTaskSafety } from "./schema";

const valid = {
  task_id: "SAFE-001", title: "Controlled safe task", priority: "high", objective: "Create a harmless benchmark fixture marker.", enabled: true,
  allowed_paths: ["benchmarks/fixtures/**"], forbidden_paths: ["agent/policies/**"],
  success_criteria: { unit_tests_pass: true, integration_tests_pass: true, render_tests_pass: true, maximum_critical_errors: 0, minimum_quality_delta: 0, maximum_regressions: 0 },
  limits: { maximum_iterations: 2, maximum_changed_files: 2, maximum_diff_lines: 30, maximum_render_attempts: 1, maximum_model_calls: 0, maximum_model_tokens: 1000, maximum_execution_ms: 120000 },
  required_artifacts: ["technical-summary.md", "test-report.json", "benchmark-report.json", "quality-report.json", "git-diff.patch"],
  test_commands: [["npm", "test", "--", "--run", "agent"]],
  execution: { kind: "controlled_sample", target: "benchmarks/fixtures/agent-smoke/sample-output.txt", content: "safe\n" },
};

describe("task contract", () => {
  it("accepts a bounded safe task", () => expect(validateTaskSafety(valid).task_id).toBe("SAFE-001"));
  it("rejects unknown fields", () => expect(() => validateTaskSafety({ ...valid, surprise: true })).toThrow());
  it("rejects attempts to allow policy changes", () => expect(() => validateTaskSafety({ ...valid, allowed_paths: ["agent/policies/**"] })).toThrow("task_allows_globally_forbidden_path"));
  it("rejects excessive budgets", () => expect(() => validateTaskSafety({ ...valid, limits: { ...valid.limits, maximum_iterations: 99 } })).toThrow());
  it("rejects path traversal", () => expect(() => validateTaskSafety({ ...valid, allowed_paths: ["../production/**"] })).toThrow());
  it("validates every prepared task manifest", async () => {
    const directory = path.join(process.cwd(), "agent/tasks/prepared");
    const files = (await readdir(directory)).filter((file) => file.endsWith(".json"));
    expect(files.length).toBeGreaterThanOrEqual(14);
    const taskIds = [];
    for (const file of files) {
      taskIds.push(
        validateTaskSafety(
          JSON.parse(await readFile(path.join(directory, file), "utf8")),
        ).task_id,
      );
    }
    expect(new Set(taskIds).size).toBe(taskIds.length);
  });
});
