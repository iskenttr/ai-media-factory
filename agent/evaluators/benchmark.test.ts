// @vitest-environment node
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { evaluateSmokeQuality } from "./subtitle-quality-agent";
import { writeBenchmarkReports } from "./benchmark";

let root = "";
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); root = ""; });

describe("benchmark report writer", () => {
  it("marks missing render artifacts without manufacturing success", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "amf-benchmark-"));
    const report = await writeBenchmarkReports(root, "run-1", evaluateSmokeQuality("run-1"));
    expect(report.status).toBe("no_approved_golden");
    expect(report.artifactsComplete).toBe(false);
    expect(report.regressions).toContain("required_artifact_missing");
  });

  it("records a complete synthetic fixture without claiming a golden delta", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "amf-benchmark-"));
    for (const file of ["output.mp4", "subtitles.ass", "transcript.json", "ffmpeg.log"]) await writeFile(path.join(root, file), "evidence");
    await mkdir(path.join(root, "sampled-frames"));
    const report = await writeBenchmarkReports(root, "run-2", evaluateSmokeQuality("run-2"));
    expect(report.artifactsComplete).toBe(true);
    expect(report.baselineScore).toBeNull();
    expect(report.qualityDelta).toBeNull();
  });
});
