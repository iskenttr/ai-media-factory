import { randomUUID } from "node:crypto";

import { serverConfig } from "./config";
import { getAnalysisStore } from "./store";
import { renderLocalizedVideo } from "./video-renderer";

export async function runVideoRenderWorkerOnce(
  store = getAnalysisStore(),
  workerId = `video-render-worker-${randomUUID()}`,
) {
  const job = store.claimNextVideoRender(workerId, serverConfig.workerLeaseMs);
  if (!job) return false;
  try {
    await renderLocalizedVideo(job.sourcePath, job.outputPath, job.segments);
    store.finishVideoRender(job.id, workerId);
  } catch (error) {
    store.failVideoRender(job.id, workerId, error instanceof Error ? error.message.slice(0, 1000) : "video_render_failed");
  }
  return true;
}
