import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";

import { z } from "zod";

import type { SpeechAnalysisProvider } from "../../contracts/speech-analysis-provider";
import { ProviderError } from "../../provider-errors";

const whisperOutputSchema = z.object({
  result: z.object({ language: z.string().min(2) }).optional(),
  transcription: z.array(z.object({
    text: z.string(),
    offsets: z.object({ from: z.number(), to: z.number() }),
  })),
});

const languageNames = new Intl.DisplayNames(["en"], { type: "language" });

export class WhisperCppSpeechProvider implements SpeechAnalysisProvider {
  readonly id = "whisper.cpp";
  readonly version = "cli-json-v1";

  constructor(
    private readonly binaryPath: string,
    private readonly modelPath: string,
    private readonly disableGpu = false,
  ) {}

  async analyze(audioPath: string) {
    const outputPrefix = `${audioPath}.whisper`;
    await new Promise<void>((resolve, reject) => {
      const args = [
        ...(this.disableGpu ? ["--no-gpu"] : []),
        "-m", this.modelPath, "-f", audioPath, "-l", "auto", "-oj", "-of", outputPrefix,
      ];
      const process = spawn(this.binaryPath, args, { stdio: ["ignore", "ignore", "pipe"] });
      let stderr = "";
      process.stderr.setEncoding("utf8");
      process.stderr.on("data", (chunk: string) => (stderr += chunk));
      process.on("error", (error) => reject(new ProviderError("provider_failure", error.message)));
      process.on("close", (code) => code === 0
        ? resolve()
        : reject(new ProviderError("provider_failure", `whisper.cpp exited with ${code}: ${stderr.slice(-500)}`)));
    });

    try {
      const parsed = whisperOutputSchema.parse(JSON.parse(await readFile(`${outputPrefix}.json`, "utf8")));
      const segments = parsed.transcription
        .map((segment) => ({
          startSeconds: segment.offsets.from / 1000,
          endSeconds: segment.offsets.to / 1000,
          text: segment.text.trim(),
        }))
        .filter((segment) => segment.text.length > 0 && segment.endSeconds > segment.startSeconds);
      if (segments.length === 0) throw new ProviderError("insufficient_speech", "No speech segments found");
      const code = parsed.result?.language.toLowerCase() ?? null;
      return {
        transcript: segments.map((segment) => segment.text).join(" "),
        segments,
        language: code ? { code, name: languageNames.of(code) ?? code } : null,
        providerId: this.id,
        providerVersion: this.version,
      };
    } finally {
      await rm(`${outputPrefix}.json`, { force: true });
    }
  }
}
