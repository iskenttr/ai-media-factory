import { spawn } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

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

async function runProcess(command: string, args: string[]) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => (stdout += chunk));
    child.stderr.on("data", (chunk: string) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${path.basename(command)} exited with code ${code}: ${stderr.slice(-800)}`));
      }
    });
  });
}

export async function probeMedia(sourcePath: string): Promise<MediaMetadata> {
  const { stdout } = await runProcess(ffprobePath, [
    "-v",
    "error",
    "-show_format",
    "-show_streams",
    "-of",
    "json",
    sourcePath,
  ]);
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
  await runProcess(ffmpegPath, [
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
  ]);
  return audioPath;
}

export async function assessAudioSignal(
  sourcePath: string,
  durationMs: number,
): Promise<AudioSignalAssessment> {
  const { stderr } = await runProcess(ffmpegPath, [
    "-i",
    sourcePath,
    "-af",
    "silencedetect=noise=-40dB:d=0.3,volumedetect",
    "-f",
    "null",
    "-",
  ]);
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
    await runProcess(ffmpegPath, [
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
    ]);
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
