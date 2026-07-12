import { spawn } from "node:child_process";
import path from "node:path";

import { z } from "zod";

import type { SpeakerAnalysisProvider } from "../../contracts/speaker-analysis-provider";
import { ProviderError } from "../../provider-errors";

const runnerOutputSchema = z.object({
  providerVersion: z.string().min(1),
  segments: z.array(z.object({
    speaker: z.string().min(1),
    start: z.number().nonnegative(),
    end: z.number().positive(),
  })),
});

export class PyannoteCommunitySpeakerProvider implements SpeakerAnalysisProvider {
  readonly id = "pyannote-community-1";
  readonly version = "community-1";

  constructor(
    private readonly pythonPath: string,
    private readonly modelPath: string,
    private readonly runnerPath = path.join(
      process.cwd(),
      "lib/providers/adapters/pyannote-community-1/run_diarization.py",
    ),
  ) {}

  async analyze(audioPath: string) {
    const output = await new Promise<string>((resolve, reject) => {
      const process = spawn(this.pythonPath, [this.runnerPath, this.modelPath, audioPath], {
        env: { ...globalThis.process.env, PYANNOTE_METRICS_ENABLED: "0" },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      process.stdout.setEncoding("utf8");
      process.stderr.setEncoding("utf8");
      process.stdout.on("data", (chunk: string) => (stdout += chunk));
      process.stderr.on("data", (chunk: string) => (stderr += chunk));
      process.on("error", (error) => reject(new ProviderError("provider_failure", error.message)));
      process.on("close", (code) => code === 0
        ? resolve(stdout)
        : reject(new ProviderError("provider_failure", stderr.slice(-800) || `pyannote exited with ${code}`)));
    });

    const parsed = runnerOutputSchema.parse(JSON.parse(output));
    if (parsed.segments.length === 0) {
      throw new ProviderError("insufficient_speech", "No speaker evidence found");
    }
    const labels = [...new Set(parsed.segments.map((segment) => segment.speaker))].sort();
    if (labels.length === 0) throw new ProviderError("insufficient_speech", "No speaker evidence found");
    const anonymous = new Map(labels.map((label, index) => [label, `speaker_${index + 1}` as const]));
    const segments = parsed.segments
      .filter((segment) => segment.end > segment.start && segment.end - segment.start >= 0.15)
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
      limitations: ["Overlapping speech and very short turns may reduce diarization accuracy."],
    };
  }
}
