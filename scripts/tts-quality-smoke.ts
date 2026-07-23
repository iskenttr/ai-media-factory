import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import ffmpegStatic from "ffmpeg-static";

import { LocalProviderRegistry } from "@/lib/providers/provider-registry";
import { renderDubbedVideo } from "@/lib/server/dubbing-renderer";
import { serverConfig } from "@/lib/server/config";

const ffmpegPath = process.env.FFMPEG_PATH ?? ffmpegStatic ?? "ffmpeg";

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => { stderr = `${stderr}${chunk}`.slice(-4_000); });
    child.once("error", reject);
    child.once("close", (code) => code === 0
      ? resolve()
      : reject(new Error(`${path.basename(command)}_failed:${code}:${stderr.slice(-1_000)}`)));
  });
}

async function main() {
  const outputIndex = process.argv.indexOf("--output");
  const outputDirectory = outputIndex >= 0 && process.argv[outputIndex + 1]
    ? path.resolve(process.argv[outputIndex + 1])
    : path.resolve("artifacts", "tts-real-smoke");
  await mkdir(outputDirectory, { recursive: true });
  const sourcePath = path.join(outputDirectory, "source.mp4");
  const outputPath = path.join(outputDirectory, "dubbed.mp4");
  await run(ffmpegPath, [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "color=c=0x172033:s=1280x720:r=25:d=15",
    "-f", "lavfi", "-i", "sine=frequency=220:sample_rate=48000:duration=15",
    "-filter_complex", "[1:a]volume=0.025[audio]",
    "-map", "0:v:0", "-map", "[audio]",
    "-c:v", "libx264", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k", "-shortest", sourcePath,
  ]);

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
  const ttsProvider = await providers.tts();
  const speechProvider = await providers.speech();
  if (!ttsProvider) throw new Error("tts_smoke_provider_not_configured");
  if (!speechProvider) throw new Error("tts_smoke_speech_provider_not_configured");

  const result = await renderDubbedVideo({
    sourcePath,
    outputPath,
    targetLocale: "tr-TR",
    projectId: "quality-smoke",
    ttsProvider,
    speechProvider,
    segments: [
      {
        startMs: 400,
        endMs: 3_500,
        speakerId: "speaker_1",
        text: "Merhaba, bugün ses kalitesini test ediyoruz.",
      },
      {
        startMs: 3_900,
        endMs: 7_000,
        speakerId: "speaker_2",
        text: "Senkron ve ses düzeyi ayrı ayrı ölçülüyor.",
      },
      {
        startMs: 7_400,
        endMs: 10_500,
        speakerId: "speaker_1",
        text: "Merhaba, bugün ses kalitesini test ediyoruz.",
      },
      {
        startMs: 10_900,
        endMs: 14_000,
        speakerId: "speaker_2",
        text: "Senkron ve ses düzeyi ayrı ayrı ölçülüyor.",
      },
    ],
  });
  process.stdout.write(`${JSON.stringify({
    passed: result.quality.passed,
    outputPath,
    qualityPath: result.qualityPath,
    metrics: {
      intelligibility: result.quality.intelligibility,
      synchronization: result.quality.synchronization,
      loudness: result.quality.loudness,
      clipping: result.quality.clipping,
      speakerConsistency: result.quality.speakerConsistency,
    },
  }, null, 2)}\n`);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
