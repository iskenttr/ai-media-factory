import { randomUUID } from "node:crypto";

import { serverConfig } from "./config";
import { getAnalysisStore, type AnalysisStore } from "./store";
import { renderLocalizedVideo, type RenderSubtitle } from "./video-renderer";

type VideoRenderWorkerStore = Pick<
  AnalysisStore,
  "claimNextVideoRender" | "renewVideoRenderLease" | "finishVideoRender" | "failVideoRender"
>;

type VideoRenderer = (
  sourcePath: string,
  outputPath: string,
  segments: RenderSubtitle[],
) => Promise<unknown>;

export async function runVideoRenderWorkerOnce(
  store: VideoRenderWorkerStore = getAnalysisStore(),
  workerId = `video-render-worker-${randomUUID()}`,
  renderer: VideoRenderer = renderLocalizedVideo,
) {
  const job = store.claimNextVideoRender(workerId, serverConfig.workerLeaseMs);
  if (!job) return false;

  let ownsLease = true;
  const leaseHeartbeat = setInterval(() => {
    try {
      ownsLease = store.renewVideoRenderLease(job.id, workerId, serverConfig.workerLeaseMs);
    } catch {
      ownsLease = false;
    }
  }, Math.max(1_000, Math.floor(serverConfig.workerLeaseMs / 3)));

  try {
    await renderer(job.sourcePath, job.outputPath, job.segments);
    if (ownsLease) store.finishVideoRender(job.id, workerId);
  } catch (error) {
    if (ownsLease) {
      store.failVideoRender(job.id, workerId, error instanceof Error ? error.message.slice(0, 1000) : "video_render_failed");
    }
  } finally {
    clearInterval(leaseHeartbeat);
  }
  return true;
}
