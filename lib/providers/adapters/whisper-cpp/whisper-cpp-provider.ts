import { readFile, rm } from "node:fs/promises";

import { z } from "zod";

import type { SpeechAnalysisProvider } from "../../contracts/speech-analysis-provider";
import { ProviderError } from "../../provider-errors";
import { serverConfig } from "../../../server/config";
import {
  ProviderProcessError,
  runBoundedProviderProcess,
  type ProviderProcessOptions,
} from "../provider-process";

const whisperOutputSchema = z.object({
  result: z.object({ language: z.string().min(2) }).optional(),
  transcription: z.array(z.object({
    text: z.string(),
    offsets: z.object({ from: z.number(), to: z.number() }),
    tokens: z.array(z.object({
      text: z.string(),
      offsets: z.object({ from: z.number(), to: z.number() }),
      p: z.number().optional(),
    })).optional(),
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
    private readonly processOptions: ProviderProcessOptions = {
      timeoutMs: serverConfig.whisperProcessTimeoutMs,
      killGraceMs: serverConfig.whisperProcessKillGraceMs,
      maxOutputBytes: serverConfig.whisperProcessMaxOutputBytes,
      errorPrefix: "speech_provider",
      inputMode: "ignore",
    },
  ) {}

  async analyze(audioPath: string) {
    const outputPrefix = `${audioPath}.whisper`;
    try {
      const args = [
        ...(this.disableGpu ? ["--no-gpu"] : []),
        "-m", this.modelPath, "-f", audioPath, "-l", "auto", "-ojf", "-of", outputPrefix,
      ];
      await runBoundedProviderProcess(this.binaryPath, args, undefined, {
        ...this.processOptions,
        errorPrefix: "speech_provider",
        inputMode: "ignore",
      });
      const parsed = whisperOutputSchema.parse(JSON.parse(await readFile(`${outputPrefix}.json`, "utf8")));
      const segments = parsed.transcription
        .map((segment) => {
          const words = segment.tokens?.filter((token) => token.offsets.to > token.offsets.from && !/^\[_.+_\]$/u.test(token.text.trim()))
            .map((token) => ({ text: token.text.trim(), startSeconds: token.offsets.from / 1000, endSeconds: token.offsets.to / 1000, probability: token.p }));
          return {
            startSeconds: segment.offsets.from / 1000,
            endSeconds: segment.offsets.to / 1000,
            text: segment.text.trim(),
            ...(words?.length ? { words } : {}),
          };
        })
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
    } catch (error) {
      if (error instanceof ProviderError && error.code === "insufficient_speech") throw error;
      throw new ProviderError(
        "provider_failure",
        error instanceof ProviderProcessError ? error.code : "speech_provider_invalid_response",
      );
    } finally {
      await rm(`${outputPrefix}.json`, { force: true }).catch(() => undefined);
    }
  }
}
