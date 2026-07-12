import { access } from "node:fs/promises";

import { serverConfig } from "@/lib/server/config";
import { getAnalysisStore } from "@/lib/server/store";

async function main() {
  const store = getAnalysisStore();
  if (!store.healthcheck() || !store.serviceHeartbeatIsFresh("worker", 45_000)) throw new Error("worker_unhealthy");
  await Promise.all([
    access(serverConfig.whisperCppBinary ?? ""),
    access(serverConfig.whisperModelPath ?? ""),
    access(serverConfig.pyannotePython ?? ""),
    access(serverConfig.pyannoteModelPath ?? ""),
    access(serverConfig.argosTranslateCommand),
  ]);
}

void main().catch(() => process.exit(1));
