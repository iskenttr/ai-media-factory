import { describe, expect, it, vi } from "vitest";

import { createRoundRobinScheduler, type WorkerStage } from "./round-robin-scheduler";

describe("createRoundRobinScheduler", () => {
  it("rotates deterministically across stages that all have work", async () => {
    const calls: string[] = [];
    const stage = (name: string): WorkerStage => vi.fn(async () => {
      calls.push(name);
      return true;
    });
    const scheduler = createRoundRobinScheduler([
      stage("analysis"),
      stage("localization"),
      stage("render"),
    ]);

    expect(await scheduler.runNext()).toBe(true);
    expect(await scheduler.runNext()).toBe(true);
    expect(await scheduler.runNext()).toBe(true);
    expect(await scheduler.runNext()).toBe(true);

    expect(calls).toEqual(["analysis", "localization", "render", "analysis"]);
  });

  it("checks every stage before reporting an idle worker", async () => {
    const stages = [vi.fn(async () => false), vi.fn(async () => false), vi.fn(async () => false)];
    const scheduler = createRoundRobinScheduler(stages);

    expect(await scheduler.runNext()).toBe(false);
    expect(stages.map((stage) => stage.mock.calls.length)).toEqual([1, 1, 1]);
  });

  it("continues processing without an idle result when only one stage has work", async () => {
    const analysis = vi.fn(async () => true);
    const localization = vi.fn(async () => false);
    const render = vi.fn(async () => false);
    const scheduler = createRoundRobinScheduler([analysis, localization, render]);

    expect(await scheduler.runNext()).toBe(true);
    expect(await scheduler.runNext()).toBe(true);
    expect(await scheduler.runNext()).toBe(true);

    expect(analysis).toHaveBeenCalledTimes(3);
  });

  it("never overlaps stage execution", async () => {
    let activeStages = 0;
    let maximumActiveStages = 0;
    const stage = (): WorkerStage => async () => {
      activeStages += 1;
      maximumActiveStages = Math.max(maximumActiveStages, activeStages);
      await Promise.resolve();
      activeStages -= 1;
      return false;
    };
    const scheduler = createRoundRobinScheduler([stage(), stage(), async () => true]);

    expect(await scheduler.runNext()).toBe(true);
    expect(maximumActiveStages).toBe(1);
  });

  it("rejects an empty stage list", () => {
    expect(() => createRoundRobinScheduler([])).toThrow("worker_stages_required");
  });
});
