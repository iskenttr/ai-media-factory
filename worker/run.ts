import { setTimeout as wait } from "node:timers/promises";

import { runWorkerOnce } from "@/lib/server/analysis-worker";
import { runLocalizationWorkerOnce } from "@/lib/server/localization-worker";
import { runVideoRenderWorkerOnce } from "@/lib/server/video-render-worker";
import { serverConfig } from "@/lib/server/config";
import { getAnalysisStore } from "@/lib/server/store";

import { createRoundRobinScheduler } from "./round-robin-scheduler";

let shuttingDown = false;

process.on("SIGINT", () => {
  shuttingDown = true;
});

process.on("SIGTERM", () => {
  shuttingDown = true;
});

async function main() {
  const store = getAnalysisStore();
  const scheduler = createRoundRobinScheduler([
    () => runWorkerOnce(store),
    () => runLocalizationWorkerOnce(store),
    () => runVideoRenderWorkerOnce(store),
  ]);
  const heartbeat = setInterval(() => store.recordServiceHeartbeat("worker"), 15_000);
  store.recordServiceHeartbeat("worker");
  while (!shuttingDown) {
    // The single-node beta executes at most one CPU-heavy stage at a time.
    const worked = await scheduler.runNext();
    if (!worked) {
      await wait(serverConfig.workerPollMs);
    }
  }
  clearInterval(heartbeat);
}

void main();
