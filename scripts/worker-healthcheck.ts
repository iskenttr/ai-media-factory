import { access } from "node:fs/promises";

import { LocalProviderRegistry } from "@/lib/providers/provider-registry";
import { serverConfig } from "@/lib/server/config";
import { getAnalysisStore } from "@/lib/server/store";

async function main() {
  const store = getAnalysisStore();
  if (!store.healthcheck() || !store.serviceHeartbeatIsFresh("worker", 45_000)) throw new Error("worker_unhealthy");
  if (!serverConfig.whisperCppBinary || !serverConfig.whisperModelPath) throw new Error("speech_provider_unconfigured");
  await Promise.all([access(serverConfig.whisperCppBinary), access(serverConfig.whisperModelPath)]);
  const providers = new LocalProviderRegistry(
    serverConfig.whisperCppBinary,
    serverConfig.whisperModelPath,
    serverConfig.pyannotePython,
    serverConfig.pyannoteModelPath,
    process.env.WHISPER_CPP_NO_GPU === "1",
    serverConfig.argosTranslateCommand,
    serverConfig.googleCloudProject,
    serverConfig.ttsProvider,
  );
  const [speakers, translation, tts] = await Promise.all([
    providers.speakers(),
    providers.translation(),
    providers.tts(),
  ]);
  if (!speakers) throw new Error("speaker_provider_unconfigured");
  if (!translation) throw new Error("translation_provider_unconfigured");
  if (!tts || (await tts.getVoiceProfiles()).length === 0) throw new Error("tts_provider_unconfigured");
}

void main().catch(() => process.exit(1));
