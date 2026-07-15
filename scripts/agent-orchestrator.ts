import path from "node:path";
import { loadAndProcessTask, runOrchestrator } from "../agent/orchestrator/orchestrator";

async function main() {
  const args = process.argv.slice(2);
  const root = path.resolve(process.env.AMF_AGENT_ROOT ?? process.cwd());
  const taskIndex = args.indexOf("--task");
  if (taskIndex >= 0 && args[taskIndex + 1]) {
    const report = await loadAndProcessTask(root, path.resolve(args[taskIndex + 1]));
    console.log(JSON.stringify(report));
  } else {
    await runOrchestrator(root, { once: args.includes("--once") });
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
