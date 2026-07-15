import { afterEach, describe, expect, it, vi } from "vitest";

import { serverConfig } from "./config";
import type { VideoRenderJobRecord } from "./store";
import { runVideoRenderWorkerOnce } from "./video-render-worker";

const job: VideoRenderJobRecord = {
  id: "render-1",
  runId: "run-1",
  sourcePath: "/tmp/source.mp4",
  outputPath: "/tmp/output.mp4",
  leaseOwner: "render-worker",
  segments: [{ startMs: 0, endMs: 2_000, text: "Merhaba" }],
};

function workerStore(claimedJob: VideoRenderJobRecord | null = job) {
  return {
    claimNextVideoRender: vi.fn(() => claimedJob),
    renewVideoRenderLease: vi.fn(() => true),
    finishVideoRender: vi.fn(() => true),
    failVideoRender: vi.fn(() => true),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("runVideoRenderWorkerOnce", () => {
  it("renews the lease during render, completes it, and cleans up the heartbeat", async () => {
    vi.useFakeTimers();
    const store = workerStore();
    let finishRender!: () => void;
    const renderer = vi.fn(() => new Promise<void>((resolve) => { finishRender = resolve; }));

    const result = runVideoRenderWorkerOnce(store, "render-worker", renderer);
    expect(store.claimNextVideoRender).toHaveBeenCalledTimes(1);
    expect(renderer).toHaveBeenCalledWith(job.sourcePath, job.outputPath, job.segments);

    await vi.advanceTimersByTimeAsync(Math.max(1_000, Math.floor(serverConfig.workerLeaseMs / 3)));
    expect(store.renewVideoRenderLease).toHaveBeenCalledWith(job.id, "render-worker", serverConfig.workerLeaseMs);
    finishRender();

    await expect(result).resolves.toBe(true);
    expect(store.finishVideoRender).toHaveBeenCalledWith(job.id, "render-worker");
    expect(store.failVideoRender).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("records render failure for the current owner and cleans up the heartbeat", async () => {
    vi.useFakeTimers();
    const store = workerStore();
    const renderer = vi.fn(async () => { throw new Error("ffmpeg_failed"); });

    await expect(runVideoRenderWorkerOnce(store, "render-worker", renderer)).resolves.toBe(true);

    expect(store.failVideoRender).toHaveBeenCalledWith(job.id, "render-worker", "ffmpeg_failed");
    expect(store.finishVideoRender).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not finish or fail after heartbeat detects stale ownership", async () => {
    vi.useFakeTimers();
    const store = workerStore();
    store.renewVideoRenderLease.mockReturnValue(false);
    let finishRender!: () => void;
    const renderer = vi.fn(() => new Promise<void>((resolve) => { finishRender = resolve; }));

    const result = runVideoRenderWorkerOnce(store, "render-worker", renderer);
    await vi.advanceTimersByTimeAsync(Math.max(1_000, Math.floor(serverConfig.workerLeaseMs / 3)));
    finishRender();
    await expect(result).resolves.toBe(true);

    expect(store.finishVideoRender).not.toHaveBeenCalled();
    expect(store.failVideoRender).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("returns without rendering or starting a heartbeat when no job is queued", async () => {
    vi.useFakeTimers();
    const store = workerStore(null);
    const renderer = vi.fn();

    await expect(runVideoRenderWorkerOnce(store, "render-worker", renderer)).resolves.toBe(false);

    expect(renderer).not.toHaveBeenCalled();
    expect(store.renewVideoRenderLease).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
