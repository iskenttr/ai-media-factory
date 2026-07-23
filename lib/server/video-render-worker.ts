import { randomUUID } from "node:crypto";

import { LocalProviderRegistry, type ProviderRegistry } from "@/lib/providers/provider-registry";

import { serverConfig } from "./config";
import { renderDubbedVideo } from "./dubbing-renderer";
import { getAnalysisStore } from "./store";

export async function runVideoRenderWorkerOnce(
  store = getAnalysisStore(),
  workerId = `video-render-worker-${randomUUID()}`,
  providers: ProviderRegistry = new LocalProviderRegistry(
    serverConfig.whisperCppBinary,
    serverConfig.whisperModelPath,
    serverConfig.pyannotePython,
    serverConfig.pyannoteModelPath,
    process.env.WHISPER_CPP_NO_GPU === "1",
    serverConfig.argosTranslateCommand,
    serverConfig.googleCloudProject,
    serverConfig.ttsProvider,
  ),
) {
  const job = store.claimNextVideoRender(workerId, serverConfig.workerLeaseMs);
  if (!job) return false;
  try {
    const ttsProvider = await providers.tts();
    if (!ttsProvider) throw new Error("tts_provider_not_configured");
    const speechProvider = await providers.speech();
    if (!speechProvider) throw new Error("speech_provider_required_for_dubbing_quality");
    await renderDubbedVideo({
      sourcePath: job.sourcePath,
      outputPath: job.outputPath,
      segments: job.segments,
      targetLocale: job.targetLanguage.code,
      projectId: job.projectId,
      ttsProvider,
      speechProvider,
    });
    store.finishVideoRender(job.id, workerId);
  } catch (error) {
    store.failVideoRender(job.id, workerId, error instanceof Error ? error.message.slice(0, 1000) : "video_render_failed");
  }
  return true;
}
