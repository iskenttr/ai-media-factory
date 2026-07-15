// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sendCompletionNotification } from "./email";

let root = "";
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); root = ""; });

describe("email notifications", () => {
  it("writes a credential-free dry-run preview", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "amf-email-"));
    const result = await sendCompletionNotification(root, {
      taskId: "SAFE-001", taskTitle: "Safe task", status: "ACCEPTED", branch: "agent/safe-001-safe-task", commitHash: "abc123", durationMs: 42,
      filesChanged: ["benchmarks/fixtures/x.txt"], testResult: "passed", renderResult: "passed", baselineQualityScore: null,
      candidateQualityScore: 100, qualityDelta: null, criticalErrors: 0, artifactLocation: "/artifacts/SAFE-001", recommendedNextTask: "SQV3-001",
    });
    expect(result.dryRun).toBe(true);
    expect(await readFile(result.preview!, "utf8")).toContain("SAFE-001: ACCEPTED");
  });
});
