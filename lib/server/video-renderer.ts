import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

const ffmpegPath = process.env.FFMPEG_PATH ?? ffmpegStatic ?? "ffmpeg";
const ffprobePath = process.env.FFPROBE_PATH ?? ffprobeStatic.path ?? "ffprobe";
const minimumCueDurationMs = 900;

export interface RenderSubtitle {
  startMs: number;
  endMs: number;
  text: string;
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
    child.stderr.on("data", (chunk: string) => { stderr = `${stderr}${chunk}`.slice(-4000); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${path.basename(command)}_failed:${code}:${stderr.slice(-800)}`)));
  });
}

async function detectSubtitleLayout(sourcePath: string): Promise<SubtitleLayout> {
  const { stdout } = await runProcess(ffprobePath, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", sourcePath]);
  const stream = (JSON.parse(stdout) as { streams?: Array<{ width?: number; height?: number }> }).streams?.[0];
  if (!stream?.width || !stream.height) throw new Error("video_dimensions_unavailable");
  const vertical = stream.height > stream.width;
  return {
    width: stream.width,
    height: stream.height,
    orientation: vertical ? "vertical" : "horizontal",
    fontSize: Math.max(30, Math.round(stream.height * (vertical ? 0.037 : 0.048))),
    horizontalMargin: Math.round(stream.width * (vertical ? 0.075 : 0.08)),
    bottomMargin: Math.round(stream.height * (vertical ? 0.14 : 0.09)),
    maxCharactersPerLine: vertical ? 24 : 42,
  };
}

function normalizeText(text: string) {
  return text.normalize("NFC").replace(/\s+/g, " ").trim();
}

function joinTexts(first: string, second: string) {
  const left = normalizeText(first);
  const right = normalizeText(second);
  return /[.!?…]$/u.test(left) ? `${left} ${right}` : `${left} · ${right}`;
}

export function rebalanceSubtitleCues(segments: RenderSubtitle[], maxCharactersPerLine: number) {
  const source = segments
    .filter((segment) => segment.endMs > segment.startMs && normalizeText(segment.text))
    .map((segment) => ({ ...segment, text: normalizeText(segment.text) }))
    .sort((a, b) => a.startMs - b.startMs);
  const result: RenderSubtitle[] = [];

  for (let index = 0; index < source.length; index += 1) {
    let current = { ...source[index] };
    let next = source[index + 1];
    const overlaps = next && current.endMs > next.startMs;
    const tooShort = current.endMs - current.startMs < minimumCueDurationMs;
    const canMerge = next && (overlaps || tooShort) && joinTexts(current.text, next.text).length <= maxCharactersPerLine * 2;
    if (canMerge) {
      current = { startMs: current.startMs, endMs: Math.max(current.endMs, next.endMs), text: joinTexts(current.text, next.text) };
      index += 1;
      next = source[index + 1];
    }
    if (current.endMs - current.startMs < minimumCueDurationMs) {
      const maximumEnd = next ? next.startMs : current.startMs + minimumCueDurationMs;
      current.endMs = Math.max(current.endMs, Math.min(current.startMs + minimumCueDurationMs, maximumEnd));
    }
    result.push(current);
  }
  return result;
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
  await writeFile(subtitlePath, createAssSubtitles(segments, layout), "utf8");
  try {
    await runProcess(ffmpegPath, [
      "-y", "-i", sourcePath,
      "-vf", `ass='${escapeFilterPath(subtitlePath)}'`,
      "-c:v", "libx264", "-preset", "medium", "-crf", "20",
      "-c:a", "aac", "-b:a", "192k",
      "-movflags", "+faststart", outputPath,
    ]);
  } finally {
    await rm(subtitlePath, { force: true });
  }
}
