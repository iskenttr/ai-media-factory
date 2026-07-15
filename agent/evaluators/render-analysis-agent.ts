import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EngineeringTask } from "../tasks/schema";
import { executeSandboxedCommand } from "../workers/command-executor";

export const SMOKE_ASS = `[Script Info]
ScriptType: v4.00+
PlayResX: 320
PlayResY: 180

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Default,DejaVu Sans,18,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,1,0,2,20,20,24,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.10,0:00:00.85,Default,Speaker-1,0,0,0,,Güvenli test altyazısı
`;

export async function renderSmokeArtifact(root: string, task: EngineeringTask, worktree: string, artifacts: string) {
  const frames = path.join(artifacts, "sampled-frames");
  await mkdir(frames, { recursive: true });
  await writeFile(path.join(artifacts, "subtitles.ass"), SMOKE_ASS, "utf8");
  await writeFile(path.join(artifacts, "transcript.json"), `${JSON.stringify({ source: "synthetic-agent-smoke", cues: [{ id: "smoke-1", startMs: 100, endMs: 850, text: "Güvenli test altyazısı", speakerId: "Speaker-1" }] }, null, 2)}\n`, "utf8");
  const render = await executeSandboxedCommand(root, worktree, artifacts, {
    taskId: task.task_id, cwd: worktree, timeoutMs: 120_000,
    argv: ["ffmpeg", "-nostdin", "-y", "-f", "lavfi", "-i", "color=c=0x20242b:s=320x180:d=1:r=25", "-vf", "subtitles=/artifacts/subtitles.ass", "-c:v", "mpeg4", "-pix_fmt", "yuv420p", path.join(artifacts, "output.mp4")],
  });
  await copyFile(render.stderrPath, path.join(artifacts, "ffmpeg.log"));
  if (render.exitCode !== 0) return { passed: false, render, frame: null };
  const frame = await executeSandboxedCommand(root, worktree, artifacts, {
    taskId: task.task_id, cwd: worktree, timeoutMs: 60_000,
    argv: ["ffmpeg", "-nostdin", "-y", "-ss", "0.5", "-i", path.join(artifacts, "output.mp4"), "-frames:v", "1", path.join(frames, "frame-001.png")],
  });
  return { passed: frame.exitCode === 0, render, frame };
}
