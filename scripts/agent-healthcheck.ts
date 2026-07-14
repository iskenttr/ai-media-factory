import { readFile } from "node:fs/promises";
import path from "node:path";
import { numericSetting } from "../agent/policies/limits";

async function main() {
  const root = path.resolve(process.env.AMF_AGENT_ROOT ?? process.cwd());
  const heartbeat = JSON.parse(await readFile(path.join(root, "agent/state/heartbeat.json"), "utf8")) as { pid: number; timestamp: string };
  const ageMs = Date.now() - Date.parse(heartbeat.timestamp);
  if (!Number.isFinite(ageMs) || ageMs > numericSetting(process.env.AMF_AGENT_HEALTH_MAX_AGE_MS, 120_000)) throw new Error(`agent_heartbeat_stale:${ageMs}`);
  try { process.kill(heartbeat.pid, 0); } catch { throw new Error(`agent_process_not_running:${heartbeat.pid}`); }
  console.log(JSON.stringify({ healthy: true, pid: heartbeat.pid, heartbeatAgeMs: ageMs }));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
