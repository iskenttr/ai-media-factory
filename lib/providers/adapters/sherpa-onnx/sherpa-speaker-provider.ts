import { spawn } from "node:child_process";
import path from "node:path";

import { z } from "zod";

import type { SpeakerAnalysisProvider } from "../../contracts/speaker-analysis-provider";
import { ProviderError } from "../../provider-errors";

const runnerOutputSchema = z.object({
  providerVersion: z.string().min(1),
  segments: z.array(z.object({
    speaker: z.union([z.string(), z.number()]).transform(String),
    start: z.number().nonnegative(),
    end: z.number().positive(),
  })),
});

export class SherpaOnnxSpeakerProvider implements SpeakerAnalysisProvider {
  readonly id = "sherpa-onnx-diarization";
  readonly version = "pyannote-segmentation-3.0-3dspeaker-v1";

  constructor(
    private readonly pythonPath: string,
    private readonly segmentationModelPath: string,
    private readonly embeddingModelPath: string,
    private readonly runnerPath = path.join(
      process.cwd(),
      "lib/providers/adapters/sherpa-onnx/run_diarization.py",
    ),
  ) {}

  async analyze(audioPath: string) {
    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn(this.pythonPath, [
        this.runnerPath,
        this.segmentationModelPath,
        this.embeddingModelPath,
        audioPath,
      ], {
        env: {
          ...process.env,
          PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => { stdout += chunk; });
      child.stderr.on("data", (chunk: string) => { stderr = `${stderr}${chunk}`.slice(-4_000); });
      child.once("error", (error) => reject(new ProviderError("provider_failure", error.message)));
      child.once("close", (code) => code === 0
        ? resolve(stdout)
        : reject(new ProviderError("provider_failure", stderr || `sherpa-onnx exited with ${code}`)));
    });
    const parsed = runnerOutputSchema.parse(JSON.parse(output));
    const orderedLabels = [...new Set(parsed.segments
      .slice()
      .sort((left, right) => left.start - right.start)
      .map((segment) => segment.speaker))];
    const anonymous = new Map(orderedLabels.map((label, index) => [label, `speaker_${index + 1}` as const]));
    const segments = parsed.segments
      .filter((segment) => segment.end - segment.start >= 0.15)
      .sort((left, right) => left.start - right.start)
      .map((segment) => ({
        speakerId: anonymous.get(segment.speaker)!,
        start: Number(segment.start.toFixed(3)),
        end: Number(segment.end.toFixed(3)),
      }));
    const speechSeconds = segments.reduce((total, segment) => total + segment.end - segment.start, 0);
    if (segments.length === 0 || speechSeconds < 0.5) {
      throw new ProviderError("insufficient_speech", "Speaker evidence is too short");
    }
    return {
      availability: "available" as const,
      speakerCount: new Set(segments.map((segment) => segment.speakerId)).size,
      segments,
      providerVersion: parsed.providerVersion,
      limitations: ["Very short turns, heavy music, and overlapping speech can reduce clustering accuracy."],
    };
  }
}
