import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runOrchestrator } from "./orchestrator";

describe("runOrchestrator daily model budget", () => {
  it("waits without claiming or consuming a queued task when the request limit is exhausted", async () => {
    const originalRequestLimit = process.env.AMF_AGENT_DAILY_REQUEST_LIMIT;
    const originalCostLimit = process.env.AMF_AGENT_DAILY_COST_LIMIT_USD;
    const root = await mkdtemp(path.join(os.tmpdir(), "amf-orchestrator-budget-"));
    const stateDir = path.join(root, "agent/state");
    const queueDir = path.join(root, "agent/tasks/queue");
    const processingDir = path.join(root, "agent/tasks/processing");

    try {
      process.env.AMF_AGENT_DAILY_REQUEST_LIMIT = "1";
      process.env.AMF_AGENT_DAILY_COST_LIMIT_USD = "4";
      await mkdir(stateDir, { recursive: true });
      await mkdir(queueDir, { recursive: true });
      await mkdir(processingDir, { recursive: true });
      await writeFile(
        path.join(stateDir, "model-usage.jsonl"),
        `${JSON.stringify({
          taskId: "ALREADY-SPENT",
          timestamp: new Date().toISOString(),
          estimatedCostUsd: 0.1,
        })}\n`,
      );
      await writeFile(path.join(queueDir, "sentinel.json"), "{}\n");

      await runOrchestrator(root, { once: true });

      expect(await readdir(queueDir)).toEqual(["sentinel.json"]);
      expect(await readdir(processingDir)).toEqual([]);
      const heartbeat = JSON.parse(await readFile(path.join(stateDir, "heartbeat.json"), "utf8"));
      expect(heartbeat.modelBudget).toMatchObject({
        calls: 1,
        requestLimit: 1,
        exhausted: true,
        reason: "daily_model_request_limit_exhausted",
      });
      const audit = (await readFile(path.join(stateDir, "audit.jsonl"), "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        taskId: "MODEL-BUDGET",
        event: "model_budget_exhausted_waiting",
      });
    } finally {
      if (originalRequestLimit === undefined) {
        delete process.env.AMF_AGENT_DAILY_REQUEST_LIMIT;
      } else {
        process.env.AMF_AGENT_DAILY_REQUEST_LIMIT = originalRequestLimit;
      }
      if (originalCostLimit === undefined) {
        delete process.env.AMF_AGENT_DAILY_COST_LIMIT_USD;
      } else {
        process.env.AMF_AGENT_DAILY_COST_LIMIT_USD = originalCostLimit;
      }
      await rm(root, { recursive: true, force: true });
    }
  });
});
