import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

import {
  createQualityProfile,
  prepareCues,
  speechIntervalsFromSilenceLog,
  validateCues,
  type FittedCue,
} from "@/lib/subtitle-quality/engine";
import { choosePlacement } from "@/lib/subtitle-quality/visual";
import type { AlignedWord } from "@/lib/subtitle-quality/contracts";
import { passesQualityGate, qualitySnapshot } from "@/lib/subtitle-quality/validation";
import { nextRepair } from "@/lib/subtitle-quality/repair";

const ffmpegPath = process.env.FFMPEG_PATH ?? ffmpegStatic ?? "ffmpeg";
const ffprobePath = process.env.FFPROBE_PATH ?? ffprobeStatic.path ?? "ffprobe";

export interface RenderSubtitle {
  startMs: number;
  endMs: number;
  text: string;
  speakerId?: string;
  words?: AlignedWord[];
}

export interface SubtitleLayout {
  width: number;
  height: number;
  orientation: "horizontal" | "vertical";
  fontSize: number;
  horizontalMargin: number;
  bottomMargin: number;
  maxCharactersPerLine: number;
}

function runProcess(command: string, args: string[]) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr = `${stderr}${chunk}`.slice(-100_000); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${path.basename(command)}_failed:${code}:${stderr.slice(-800)}`)));
  });
}

function runBinaryProcess(command: string, args: string[]) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => { stderr = `${stderr}${chunk}`.slice(-4_000); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`${path.basename(command)}_failed:${code}:${stderr.slice(-800)}`)));
  });
}

async function sampleVisualFrames(sourcePath: string) {
  const width = 180;
  const height = 320;
  const bytes = await runBinaryProcess(ffmpegPath, [
    "-hide_banner", "-loglevel", "error", "-i", sourcePath,
    "-vf", `fps=1/4,scale=${width}:${height},format=gray`, "-frames:v", "24",
    "-f", "rawvideo", "-pix_fmt", "gray", "-",
  ]);
  const size = width * height;
  const frames: Uint8Array[] = [];
  for (let offset = 0; offset + size <= bytes.length; offset += size) frames.push(bytes.subarray(offset, offset + size));
  return { width, height, frames };
}

async function detectSubtitleLayout(sourcePath: string): Promise<SubtitleLayout & { durationMs: number }> {
  const { stdout } = await runProcess(ffprobePath, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", sourcePath]);
  const parsed = JSON.parse(stdout) as { streams?: Array<{ width?: number; height?: number }>; format?: { duration?: string } };
  const stream = parsed.streams?.[0];
  if (!stream?.width || !stream.height) throw new Error("video_dimensions_unavailable");
  const profile = createQualityProfile(stream.width, stream.height);
  return {
    width: stream.width,
    height: stream.height,
    orientation: profile.orientation,
    fontSize: profile.maxFontSize,
    horizontalMargin: profile.safeLeft,
    bottomMargin: profile.preferredBottom,
    maxCharactersPerLine: profile.orientation === "vertical" ? 30 : 48,
    durationMs: Math.round(Number(parsed.format?.duration ?? 0) * 1_000),
  };
}

function normalizeText(text: string) {
  return text.normalize("NFC").replace(/\s+/g, " ").trim();
}

export function rebalanceSubtitleCues(segments: RenderSubtitle[], maxCharactersPerLine: number) {
  const profile = createQualityProfile(maxCharactersPerLine <= 30 ? 1080 : 1920, maxCharactersPerLine <= 30 ? 1920 : 1080);
  return prepareCues(segments, profile).map((cue) => ({
    startMs: cue.startMs,
    endMs: cue.endMs,
    text: cue.text,
    ...(cue.speakerId ? { speakerId: cue.speakerId } : {}),
  }));
}

export function wrapSubtitleText(text: string, maxCharactersPerLine: number) {
  const normalized = normalizeText(text);
  if (normalized.length <= maxCharactersPerLine) return normalized;
  const words = normalized.split(" ");
  if (words.length === 1) {
    const midpoint = Math.ceil(normalized.length / 2);
    return `${normalized.slice(0, midpoint)}\\N${normalized.slice(midpoint)}`;
  }
  let bestIndex = 1;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let index = 1; index < words.length; index += 1) {
    const first = words.slice(0, index).join(" ");
    const second = words.slice(index).join(" ");
    const overflow = Math.max(0, first.length - maxCharactersPerLine) + Math.max(0, second.length - maxCharactersPerLine);
    const score = overflow * 100 + Math.abs(first.length - second.length);
    if (score < bestScore) { bestScore = score; bestIndex = index; }
  }
  return `${words.slice(0, bestIndex).join(" ")}\\N${words.slice(bestIndex).join(" ")}`;
}

function assTime(milliseconds: number) {
  const totalCentiseconds = Math.max(0, Math.floor(milliseconds / 10));
  const centiseconds = totalCentiseconds % 100;
  const totalSeconds = Math.floor(totalCentiseconds / 100);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

function assText(text: string, maxCharactersPerLine: number) {
  return wrapSubtitleText(text, maxCharactersPerLine).replaceAll("\\N", "\u0000").replaceAll("\\", "\\\\")
    .replaceAll("{", "\\{").replaceAll("}", "\\}").replaceAll("\u0000", "\\N");
}

function fittedAssText(cue: FittedCue) {
  return cue.lines.join("\\N").replaceAll("\\N", "\u0000").replaceAll("\\", "\\\\")
    .replaceAll("{", "\\{").replaceAll("}", "\\}").replaceAll("\u0000", "\\N");
}

function createFittedAss(cues: FittedCue[], layout: SubtitleLayout) {
  const dialogue = cues.map((cue) =>
    `Dialogue: 0,${assTime(cue.startMs)},${assTime(cue.endMs)},Localized,,0,0,0,,{\\fs${cue.fontSize}}${fittedAssText(cue)}`,
  ).join("\n");
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: ${layout.width}\nPlayResY: ${layout.height}\nScaledBorderAndShadow: yes\nWrapStyle: 2\nYCbCr Matrix: TV.709\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Localized,Arial,${layout.fontSize},&H00FFFFFF,&H000000FF,&H00101010,&H70000000,-1,0,0,0,100,100,0,0,1,${Math.max(2, Math.round(layout.fontSize * 0.065))},${Math.max(1, Math.round(layout.fontSize * 0.02))},2,${layout.horizontalMargin},${layout.horizontalMargin},${layout.bottomMargin},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${dialogue}\n`;
}

export function createAssSubtitles(segments: RenderSubtitle[], layout: SubtitleLayout = {
  width: 1920, height: 1080, orientation: "horizontal", fontSize: 52, horizontalMargin: 110, bottomMargin: 96, maxCharactersPerLine: 42,
}) {
  const cues = rebalanceSubtitleCues(segments, layout.maxCharactersPerLine);
  const dialogue = cues.map((segment) =>
    `Dialogue: 0,${assTime(segment.startMs)},${assTime(segment.endMs)},Localized,,0,0,0,,${assText(segment.text, layout.maxCharactersPerLine)}`,
  ).join("\n");
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: ${layout.width}\nPlayResY: ${layout.height}\nScaledBorderAndShadow: yes\nWrapStyle: 2\nYCbCr Matrix: TV.709\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Localized,Arial,${layout.fontSize},&H00FFFFFF,&H000000FF,&H00101010,&H70000000,-1,0,0,0,100,100,0,0,1,${Math.max(2, Math.round(layout.fontSize * 0.065))},${Math.max(1, Math.round(layout.fontSize * 0.02))},2,${layout.horizontalMargin},${layout.horizontalMargin},${layout.bottomMargin},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${dialogue}\n`;
}

function escapeFilterPath(filePath: string) {
  return filePath.replaceAll("\\", "\\\\").replaceAll(":", "\\:").replaceAll("'", "'\\''").replaceAll(",", "\\,");
}

export async function renderLocalizedVideo(sourcePath: string, outputPath: string, segments: RenderSubtitle[]) {
  if (segments.length === 0) throw new Error("localized_subtitles_unavailable");
  await mkdir(path.dirname(outputPath), { recursive: true });
  const subtitlePath = path.join(path.dirname(outputPath), "localized.ass");
  const layout = await detectSubtitleLayout(sourcePath);
  let profile = createQualityProfile(layout.width, layout.height);
  const silence = await runProcess(ffmpegPath, ["-hide_banner", "-i", sourcePath, "-af", "silencedetect=n=-38dB:d=0.12", "-f", "null", "-"]);
  const speech = speechIntervalsFromSilenceLog(silence.stderr, layout.durationMs);
  let cues: FittedCue[] = [];
  let issues = [] as ReturnType<typeof validateCues>;
  let attempt = 0;
  let repairState = { attempt: 1, profile, bottomCandidateIndex: 0 };
  for (; attempt < 5; attempt += 1) {
    cues = prepareCues(segments, profile, speech);
    issues = validateCues(cues, profile);
    if (!issues.length) break;
    const next = nextRepair(repairState, qualitySnapshot(cues, profile));
    if (!next) break;
    repairState = next;
    profile = next.profile;
  }
  if (issues.length) throw new Error(`subtitle_preflight_failed_after_5_attempts:${JSON.stringify(issues.slice(0, 8))}`);
  const visual = await sampleVisualFrames(sourcePath);
  const placement = choosePlacement(visual.frames, visual.width, visual.height, profile, Math.max(...cues.map((cue) => cue.fontSize)));
  layout.bottomMargin = Math.max(profile.safeBottom, placement.bottomMargin);
  const preRenderMetrics = qualitySnapshot(cues, profile, placement.collisionScore);
  if (!passesQualityGate(preRenderMetrics)) throw new Error(`subtitle_quality_gate_failed:${JSON.stringify(preRenderMetrics)}`);
  await writeFile(subtitlePath, createFittedAss(cues, layout), "utf8");
  try {
    await runProcess(ffmpegPath, [
      "-y", "-i", sourcePath,
      "-vf", `ass=filename='${escapeFilterPath(subtitlePath)}'`,
      "-c:v", "libx264", "-preset", "medium", "-crf", "20",
      "-c:a", "aac", "-b:a", "192k",
      "-movflags", "+faststart", outputPath,
    ]);
    const { stdout } = await runProcess(ffprobePath, ["-v", "error", "-show_entries", "format=duration", "-of", "json", outputPath]);
    const outputDurationMs = Math.round(Number((JSON.parse(stdout) as { format?: { duration?: string } }).format?.duration ?? 0) * 1_000);
    if (Math.abs(outputDurationMs - layout.durationMs) > 120) throw new Error(`subtitle_av_duration_mismatch:${layout.durationMs}:${outputDurationMs}`);
    const metrics = qualitySnapshot(cues, profile, placement.collisionScore, outputDurationMs - layout.durationMs);
    await writeFile(`${outputPath}.quality.json`, JSON.stringify({
      version: "subtitle-quality-v1",
      qualityScore: metrics.score,
      attempts: attempt + 1,
      cueCount: cues.length,
      cues: cues.map((cue) => ({
        startMs: cue.startMs,
        endMs: cue.endMs,
        durationMs: cue.endMs - cue.startMs,
        charactersPerSecond: Number((cue.text.length / ((cue.endMs - cue.startMs) / 1_000)).toFixed(2)),
        lineCount: cue.lines.length,
        lineWidths: cue.lines.map((line) => line.length),
        fontSize: cue.fontSize,
      })),
      speechIntervalCount: speech.length,
      issues: metrics.failures,
      metrics,
      placement,
      inputDurationMs: layout.durationMs,
      outputDurationMs,
    }, null, 2), "utf8");
  } finally {
    await rm(subtitlePath, { force: true });
  }
}
