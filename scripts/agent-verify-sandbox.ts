import path from "node:path";
import { executeSandboxedCommand } from "../agent/workers/command-executor";

async function main() {
  const root = path.resolve(process.env.AMF_AGENT_ROOT ?? process.cwd());
  const worktree = process.argv[2];
  const artifacts = process.argv[3];
  if (!worktree || !artifacts) throw new Error("usage:npm run agent:verify-sandbox -- <worktree> <artifact-directory>");
  const result = await executeSandboxedCommand(root, path.resolve(worktree), path.resolve(artifacts), {
    taskId: "SANDBOX-VERIFY", cwd: path.resolve(worktree), timeoutMs: 30_000,
    argv: ["node", "--experimental-strip-types", "agent/workers/sandbox-probe.ts"],
  });
  console.log(JSON.stringify(result));
  if (result.exitCode !== 0) process.exitCode = 1;
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
