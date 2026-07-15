import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { QualityReportV3 } from "../../lib/subtitle-quality/v3";

export interface BenchmarkReport {
  schemaVersion: 1;
  runId: string;
  fixture: string;
  goldenApproval: "pending" | "approved";
  status: "passed" | "failed" | "no_approved_golden";
  artifactsComplete: boolean;
  baselineScore: number | null;
  candidateScore: number;
  qualityDelta: number | null;
  regressions: string[];
}

async function exists(file: string) {
  try { return (await stat(file)).isFile(); } catch { return false; }
}

export async function writeBenchmarkReports(artifactDirectory: string, runId: string, quality: QualityReportV3, goldenApproval: "pending" | "approved" = "pending") {
  await mkdir(artifactDirectory, { recursive: true });
  const required = ["output.mp4", "subtitles.ass", "transcript.json", "ffmpeg.log"];
  const artifactsComplete = (await Promise.all(required.map((name) => exists(path.join(artifactDirectory, name))))).every(Boolean);
  const report: BenchmarkReport = {
    schemaVersion: 1,
    runId,
    fixture: "agent-smoke-synthetic",
    goldenApproval,
    status: goldenApproval === "pending" ? "no_approved_golden" : artifactsComplete && quality.criticalErrorCount === 0 ? "passed" : "failed",
    artifactsComplete,
    baselineScore: null,
    candidateScore: quality.overallScore,
    qualityDelta: null,
    regressions: artifactsComplete ? [] : ["required_artifact_missing"],
  };
  await writeFile(path.join(artifactDirectory, "quality-report.json"), `${JSON.stringify(quality, null, 2)}\n`);
  await writeFile(path.join(artifactDirectory, "benchmark-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${runId}</title></head><body><h1>AI Media Factory benchmark</h1><dl><dt>Run</dt><dd>${runId}</dd><dt>Status</dt><dd>${report.status}</dd><dt>Candidate score</dt><dd>${report.candidateScore}</dd><dt>Golden approval</dt><dd>${goldenApproval}</dd></dl><p>No baseline delta is claimed until a human-approved golden fixture exists.</p></body></html>`;
  await writeFile(path.join(artifactDirectory, "comparison-report.html"), html);
  const summary = `# Technical summary\n\n- Run: ${runId}\n- Fixture: synthetic agent smoke\n- Deterministic score: ${quality.overallScore}\n- Critical errors: ${quality.criticalErrorCount}\n- Render artifacts complete: ${artifactsComplete}\n- Golden approval: ${goldenApproval}\n- Baseline comparison: not claimed\n`;
  await writeFile(path.join(artifactDirectory, "technical-summary.md"), summary);
  const checksums: Record<string, string> = {};
  for (const name of [...required, "quality-report.json", "benchmark-report.json", "comparison-report.html", "technical-summary.md"]) {
    const file = path.join(artifactDirectory, name);
    if (await exists(file)) checksums[name] = createHash("sha256").update(await readFile(file)).digest("hex");
  }
  await writeFile(path.join(artifactDirectory, "checksums.json"), `${JSON.stringify(checksums, null, 2)}\n`);
  return report;
}
