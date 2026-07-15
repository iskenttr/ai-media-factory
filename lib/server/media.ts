import { spawn } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

import { serverConfig } from "./config";

const ffmpegPath = process.env.FFMPEG_PATH ?? ffmpegStatic ?? "ffmpeg";
const ffprobePath = process.env.FFPROBE_PATH ?? ffprobeStatic.path ?? "ffprobe";

interface ProbeStream {
  codec_type?: "video" | "audio";
  width?: number;
  height?: number;
  duration?: string;
}

interface ProbeOutput {
  format?: {
    duration?: string;
    format_name?: string;
  };
  streams?: ProbeStream[];
}

export interface MediaMetadata {
  durationMs: number;
  width: number;
  height: number;
  audioPresent: boolean;
  container: string;
}

export interface AudioSignalAssessment {
  meanVolumeDb: number;
  peakVolumeDb: number;
  silenceRatio: number;
  assessment: "strong" | "usable" | "limited";
}

export type MediaProcessStage =
  | "media_probe"
  | "audio_extraction"
  | "audio_signal_assessment"
  | "representative_frame_extraction";

export class MediaProcessError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "MediaProcessError";
  }
}

interface MediaProcessOptions {
  stage: MediaProcessStage;
  timeoutMs: number;
  killGraceMs?: number;
  maxOutputBytes?: number;
}

function appendBounded(chunks: Buffer[], chunk: Buffer | string, currentBytes: number, maximumBytes: number) {
  const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  const remaining = Math.max(0, maximumBytes - currentBytes);
  if (remaining > 0) chunks.push(bytes.subarray(0, remaining));
  return { bytes: currentBytes + Math.min(bytes.length, remaining), exceeded: bytes.length > remaining };
}

export async function runBoundedMediaProcess(
  command: string,
  args: string[],
  options: MediaProcessOptions,
) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const maximumBytes = options.maxOutputBytes ?? serverConfig.mediaProcessMaxOutputBytes;
    const killGraceMs = options.killGraceMs ?? serverConfig.mediaProcessKillGraceMs;
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let failureCode: string | null = null;
    let settled = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);
      child.stdout.off("data", onStdout);
      child.stderr.off("data", onStderr);
      child.off("error", onError);
      child.off("close", onClose);
    };
    const finish = (error?: MediaProcessError) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve({ stdout: Buffer.concat(stdoutChunks).toString("utf8"), stderr: Buffer.concat(stderrChunks).toString("utf8") });
    };
    const stop = (code: string) => {
      if (failureCode || settled) return;
      failureCode = code;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        if (!settled) child.kill("SIGKILL");
      }, killGraceMs);
      killTimer.unref();
    };
    function onStdout(chunk: Buffer) {
      const result = appendBounded(stdoutChunks, chunk, stdoutBytes, maximumBytes);
      stdoutBytes = result.bytes;
      if (result.exceeded) stop(`${options.stage}_output_limit_exceeded`);
    }
    function onStderr(chunk: Buffer) {
      const result = appendBounded(stderrChunks, chunk, stderrBytes, maximumBytes);
      stderrBytes = result.bytes;
      if (result.exceeded) stop(`${options.stage}_output_limit_exceeded`);
    }
    function onError() {
      finish(new MediaProcessError(`${options.stage}_spawn_failed`));
    }
    function onClose(code: number | null) {
      if (failureCode) finish(new MediaProcessError(failureCode));
      else if (code !== 0) finish(new MediaProcessError(`${options.stage}_failed`));
      else finish();
    }

    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);
    child.on("error", onError);
    child.on("close", onClose);
    const timeoutTimer = setTimeout(() => stop(`${options.stage}_timeout`), options.timeoutMs);
    timeoutTimer.unref();
  });
}

export async function probeMedia(sourcePath: string): Promise<MediaMetadata> {
  const { stdout } = await runBoundedMediaProcess(ffprobePath, [
    "-v",
    "error",
    "-show_format",
    "-show_streams",
    "-of",
    "json",
    sourcePath,
  ], { stage: "media_probe", timeoutMs: serverConfig.mediaProbeTimeoutMs });
  const output = JSON.parse(stdout) as ProbeOutput;
  const video = output.streams?.find((stream) => stream.codec_type === "video");
  if (!video?.width || !video.height) {
    throw new Error("The uploaded media does not contain a readable video stream");
  }

  const durationSeconds = Number(output.format?.duration ?? video.duration ?? 0);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("The uploaded video duration could not be verified");
  }

  return {
    durationMs: Math.round(durationSeconds * 1000),
    width: video.width,
    height: video.height,
    audioPresent: Boolean(output.streams?.some((stream) => stream.codec_type === "audio")),
    container: output.format?.format_name?.split(",")[0] ?? "unknown",
  };
}

export async function extractAnalysisAudio(sourcePath: string, outputDirectory: string) {
  await mkdir(outputDirectory, { recursive: true });
  const audioPath = path.join(outputDirectory, "analysis-audio.wav");
  await runBoundedMediaProcess(ffmpegPath, [
    "-y",
    "-i",
    sourcePath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-codec:a",
    "pcm_s16le",
    audioPath,
  ], { stage: "audio_extraction", timeoutMs: serverConfig.mediaFfmpegTimeoutMs });
  return audioPath;
}

export async function assessAudioSignal(
  sourcePath: string,
  durationMs: number,
): Promise<AudioSignalAssessment> {
  const { stderr } = await runBoundedMediaProcess(ffmpegPath, [
    "-i",
    sourcePath,
    "-af",
    "silencedetect=noise=-40dB:d=0.3,volumedetect",
    "-f",
    "null",
    "-",
  ], { stage: "audio_signal_assessment", timeoutMs: serverConfig.mediaFfmpegTimeoutMs });
  const meanVolumeDb = Number(stderr.match(/mean_volume:\s*(-?[\d.]+) dB/)?.[1]);
  const peakVolumeDb = Number(stderr.match(/max_volume:\s*(-?[\d.]+) dB/)?.[1]);
  const silenceDurations = [...stderr.matchAll(/silence_duration:\s*([\d.]+)/g)].map((match) =>
    Number(match[1]),
  );
  if (!Number.isFinite(meanVolumeDb) || !Number.isFinite(peakVolumeDb)) {
    throw new Error("Audio signal metrics could not be measured");
  }

  const totalSilenceSeconds = silenceDurations.reduce((total, value) => total + value, 0);
  const silenceRatio = Math.min(1, totalSilenceSeconds / (durationMs / 1000));
  const assessment =
    meanVolumeDb >= -28 && peakVolumeDb <= -0.5 && silenceRatio <= 0.45
      ? "strong"
      : meanVolumeDb >= -38 && peakVolumeDb <= 0 && silenceRatio <= 0.7
        ? "usable"
        : "limited";

  return { meanVolumeDb, peakVolumeDb, silenceRatio, assessment };
}

export async function extractRepresentativeFrames(
  sourcePath: string,
  outputDirectory: string,
  durationMs: number,
) {
  await mkdir(outputDirectory, { recursive: true });
  const positions = [0.2, 0.5, 0.8].map((ratio) => Math.max(0, (durationMs / 1000) * ratio));
  const framePaths: string[] = [];

  for (const [index, position] of positions.entries()) {
    const framePath = path.join(outputDirectory, `frame-${index + 1}.jpg`);
    await runBoundedMediaProcess(ffmpegPath, [
      "-y",
      "-ss",
      position.toFixed(3),
      "-i",
      sourcePath,
      "-frames:v",
      "1",
      "-vf",
      "scale='min(1280,iw)':-2",
      "-q:v",
      "3",
      framePath,
    ], { stage: "representative_frame_extraction", timeoutMs: serverConfig.mediaFrameTimeoutMs });
    framePaths.push(framePath);
  }

  return framePaths;
}

export async function frameAsDataUrl(framePath: string) {
  const bytes = await readFile(framePath);
  return `data:image/jpeg;base64,${bytes.toString("base64")}`;
}

export async function removeWorkDirectory(directory: string) {
  await rm(directory, { recursive: true, force: true });
}
