import path from "node:path";
import { evaluateSmokeQuality } from "../agent/evaluators/subtitle-quality-agent";
import { writeBenchmarkReports } from "../agent/evaluators/benchmark";

async function main() {
  const artifactDirectory = path.resolve(process.argv[2] ?? "artifacts/manual-benchmark");
  const runId = `manual-${Date.now()}`;
  const report = await writeBenchmarkReports(artifactDirectory, runId, evaluateSmokeQuality(runId));
  console.log(JSON.stringify(report));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
