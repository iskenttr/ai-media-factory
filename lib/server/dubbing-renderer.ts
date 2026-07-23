import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

import {
  evaluateDubbingQuality,
  measurePcm16Wav,
  parseEbur128Summary,
  type DubbingSegmentEvidence,
} from "@/lib/dubbing/audio-quality";
import { assignVoicesToSpeakers } from "@/lib/dubbing/voice-assignment";
import type { SpeechAnalysisProvider } from "@/lib/providers/contracts/speech-analysis-provider";
import type { TtsProvider } from "@/lib/providers/contracts/tts-provider";

import { renderLocalizedVideo, type RenderSubtitle } from "./video-renderer";

const ffmpegPath = process.env.FFMPEG_PATH ?? ffmpegStatic ?? "ffmpeg";
const ffprobePath = process.env.FFPROBE_PATH ?? ffprobeStatic.path ?? "ffprobe";

interface SourceMedia {
  durationMs: number;
  audioPresent: boolean;
}

function runProcess(command: string, args: string[]) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr = `${stderr}${chunk}`.slice(-200_000); });
    child.once("error", reject);
    child.once("close", (code) => code === 0
      ? resolve({ stdout, stderr })
      : reject(new Error(`${path.basename(command)}_failed:${code}:${stderr.slice(-1_000)}`)));
  });
}

async function probeSource(sourcePath: string): Promise<SourceMedia> {
  const { stdout } = await runProcess(ffprobePath, [
    "-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", sourcePath,
  ]);
  const parsed = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: Array<{ codec_type?: string }>;
  };
  const durationMs = Math.round(Number(parsed.format?.duration ?? 0) * 1_000);
  if (durationMs <= 0) throw new Error("dubbing_source_duration_unavailable");
  return {
    durationMs,
    audioPresent: Boolean(parsed.streams?.some((stream) => stream.codec_type === "audio")),
  };
}

function trustedOverrides() {
  const raw = process.env.AMF_TTS_SPEAKER_VOICE_MAP;
  if (!raw) return undefined;
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("tts_speaker_voice_map_invalid");
  }
  const result: Record<string, string> = {};
  for (const [speakerId, profileId] of Object.entries(parsed)) {
    if (typeof profileId !== "string") throw new Error("tts_speaker_voice_map_invalid");
    result[speakerId] = profileId;
  }
  return result;
}

async function synthesizeSegment(input: {
  index: number;
  segment: RenderSubtitle;
  voiceProfileId: string;
  ttsProvider: TtsProvider;
  speechProvider: SpeechAnalysisProvider | null;
  workDirectory: string;
}): Promise<{ fittedPath: string; evidence: DubbingSegmentEvidence }> {
  const targetDurationMs = input.segment.endMs - input.segment.startMs;
  if (targetDurationMs <= 0) throw new Error(`dubbing_segment_duration_invalid:${input.index}`);
  let synthesis = await input.ttsProvider.synthesize({
    text: input.segment.text,
    voiceProfileId: input.voiceProfileId,
    speed: 1,
    outputFormat: "wav",
    sampleRate: 24_000,
  });
  const initialRatio = synthesis.durationMs / targetDurationMs;
  if (initialRatio < 0.95 || initialRatio > 1.05) {
    const requestedSpeed = Math.min(1.2, Math.max(0.8, initialRatio));
    synthesis = await input.ttsProvider.synthesize({
      text: input.segment.text,
      voiceProfileId: input.voiceProfileId,
      speed: Number(requestedSpeed.toFixed(3)),
      outputFormat: "wav",
      sampleRate: 24_000,
    });
  }
  const stretchRatio = synthesis.durationMs / targetDurationMs;
  if (stretchRatio < 0.75 || stretchRatio > 1.35) {
    throw new Error(`dubbing_segment_timing_unfit:${input.index}:${stretchRatio.toFixed(3)}`);
  }

  const rawPath = path.join(input.workDirectory, `segment-${String(input.index).padStart(4, "0")}-raw.wav`);
  const fittedPath = path.join(input.workDirectory, `segment-${String(input.index).padStart(4, "0")}-fitted.wav`);
  await writeFile(rawPath, synthesis.audioBuffer, { mode: 0o600 });
  let recognizedText: string | null = null;
  if (input.speechProvider) {
    try {
      recognizedText = (await input.speechProvider.analyze(rawPath)).transcript;
    } catch {
      recognizedText = null;
    }
  }
  const targetSeconds = targetDurationMs / 1_000;
  await runProcess(ffmpegPath, [
    "-y", "-hide_banner", "-loglevel", "error", "-i", rawPath,
    "-af", [
      `atempo=${stretchRatio.toFixed(6)}`,
      `apad=pad_dur=${targetSeconds.toFixed(6)}`,
      `atrim=duration=${targetSeconds.toFixed(6)}`,
      "loudnorm=I=-18:LRA=7:TP=-2",
    ].join(","),
    "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", fittedPath,
  ]);
  const fitted = measurePcm16Wav(await readFile(fittedPath));
  return {
    fittedPath,
    evidence: {
      segmentId: `segment-${input.index + 1}`,
      speakerId: input.segment.speakerId ?? "speaker_1",
      voiceProfileId: input.voiceProfileId,
      expectedText: input.segment.text,
      recognizedText,
      targetDurationMs,
      synthesizedDurationMs: synthesis.durationMs,
      fittedDurationMs: fitted.durationMs,
      audioBuffer: synthesis.audioBuffer,
    },
  };
}

async function createVoiceMix(input: {
  segments: Array<{ segment: RenderSubtitle; fittedPath: string }>;
  durationMs: number;
  outputPath: string;
}) {
  const filter = input.segments.map(({ segment }, index) =>
    `[${index}:a]adelay=${segment.startMs}:all=1[d${index}]`,
  );
  filter.push(
    `${input.segments.map((_, index) => `[d${index}]`).join("")}amix=inputs=${input.segments.length}:duration=longest:normalize=0,` +
    "loudnorm=I=-18:LRA=8:TP=-2[voice]",
  );
  await runProcess(ffmpegPath, [
    "-y", "-hide_banner", "-loglevel", "error",
    ...input.segments.flatMap(({ fittedPath }) => ["-i", fittedPath]),
    "-filter_complex", filter.join(";"),
    "-map", "[voice]", "-t", (input.durationMs / 1_000).toFixed(6),
    "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", input.outputPath,
  ]);
}

async function mixBackground(input: {
  sourcePath: string;
  voicePath: string;
  outputPath: string;
  durationMs: number;
  sourceAudioPresent: boolean;
}) {
  if (!input.sourceAudioPresent) {
    await runProcess(ffmpegPath, [
      "-y", "-hide_banner", "-loglevel", "error", "-i", input.voicePath,
      "-af", "loudnorm=I=-16:LRA=8:TP=-1.5",
      "-t", (input.durationMs / 1_000).toFixed(6),
      "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", input.outputPath,
    ]);
    return;
  }
  await runProcess(ffmpegPath, [
    "-y", "-hide_banner", "-loglevel", "error", "-i", input.sourcePath, "-i", input.voicePath,
    "-filter_complex", [
      "[0:a]volume=0.16[background]",
      "[1:a]asplit=2[sidechain][voice]",
      "[background][sidechain]sidechaincompress=threshold=0.025:ratio=12:attack=5:release=350[ducked]",
      "[ducked][voice]amix=inputs=2:duration=longest:normalize=0,loudnorm=I=-16:LRA=8:TP=-1.5[out]",
    ].join(";"),
    "-map", "[out]", "-t", (input.durationMs / 1_000).toFixed(6),
    "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", input.outputPath,
  ]);
}

async function measureLoudness(audioPath: string) {
  const result = await runProcess(ffmpegPath, [
    "-hide_banner", "-nostats", "-i", audioPath,
    "-filter_complex", "ebur128=peak=true", "-f", "null", "-",
  ]);
  return parseEbur128Summary(result.stderr);
}

export async function renderDubbedVideo(input: {
  sourcePath: string;
  outputPath: string;
  segments: RenderSubtitle[];
  targetLocale: string;
  projectId: string;
  ttsProvider: TtsProvider;
  speechProvider: SpeechAnalysisProvider | null;
}) {
  if (input.segments.length === 0) throw new Error("dubbing_segments_unavailable");
  const media = await probeSource(input.sourcePath);
  const voices = await input.ttsProvider.getVoiceProfiles();
  const assignments = assignVoicesToSpeakers({
    speakerIds: input.segments.map((segment) => segment.speakerId ?? "speaker_1"),
    targetLocale: input.targetLocale,
    voices,
    overrides: trustedOverrides(),
    projectId: input.projectId,
  });
  const bySpeaker = new Map(assignments.map((assignment) => [assignment.speakerId, assignment]));
  const outputDirectory = path.dirname(input.outputPath);
  const workDirectory = path.join(outputDirectory, ".dubbing-work");
  const qualityPath = `${input.outputPath}.audio-quality.json`;
  await mkdir(workDirectory, { recursive: true });
  try {
    const synthesized = [];
    for (const [index, segment] of input.segments.entries()) {
      if (segment.startMs < 0 || segment.endMs > media.durationMs + 120) {
        throw new Error(`dubbing_segment_outside_source:${index}`);
      }
      const speakerId = segment.speakerId ?? "speaker_1";
      const assignment = bySpeaker.get(speakerId);
      if (!assignment) throw new Error(`dubbing_voice_assignment_missing:${speakerId}`);
      synthesized.push({
        segment,
        ...await synthesizeSegment({
          index,
          segment,
          voiceProfileId: assignment.voiceProfileId,
          ttsProvider: input.ttsProvider,
          speechProvider: input.speechProvider,
          workDirectory,
        }),
      });
    }
    const voiceMixPath = path.join(workDirectory, "voices.wav");
    const finalAudioPath = path.join(workDirectory, "dubbed-final.wav");
    await createVoiceMix({
      segments: synthesized.map(({ segment, fittedPath }) => ({ segment, fittedPath })),
      durationMs: media.durationMs,
      outputPath: voiceMixPath,
    });
    await mixBackground({
      sourcePath: input.sourcePath,
      voicePath: voiceMixPath,
      outputPath: finalAudioPath,
      durationMs: media.durationMs,
      sourceAudioPresent: media.audioPresent,
    });
    const loudness = await measureLoudness(finalAudioPath);
    const quality = evaluateDubbingQuality({
      segments: synthesized.map(({ evidence }) => evidence),
      finalAudio: await readFile(finalAudioPath),
      ...loudness,
    });
    await writeFile(qualityPath, `${JSON.stringify({
      ...quality,
      provider: { id: input.ttsProvider.id, version: input.ttsProvider.version },
      assignments,
    }, null, 2)}\n`, { mode: 0o600 });
    if (!quality.passed) {
      throw new Error(`dubbing_quality_gate_failed:${JSON.stringify({
        intelligibility: quality.intelligibility,
        synchronization: quality.synchronization,
        loudness: quality.loudness,
        clipping: quality.clipping,
        speakerConsistency: quality.speakerConsistency,
      })}`);
    }
    await renderLocalizedVideo(input.sourcePath, input.outputPath, input.segments, {
      audioPath: finalAudioPath,
    });
    return { quality, assignments, qualityPath };
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
}
