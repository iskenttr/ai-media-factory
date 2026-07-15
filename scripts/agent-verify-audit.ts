import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

async function main() {
  const root = path.resolve(process.env.AMF_AGENT_ROOT ?? process.cwd());
  const file = path.join(root, "agent/state/audit.jsonl");
  const lines = (await readFile(file, "utf8")).split("\n").filter(Boolean);
  let previousHash = "GENESIS";
  for (const [index, line] of lines.entries()) {
    const parsed = JSON.parse(line) as Record<string, unknown> & { hash: string; previousHash: string };
    if (parsed.previousHash !== previousHash) throw new Error(`audit_previous_hash_mismatch:${index + 1}`);
    const { hash, ...payload } = parsed;
    const calculated = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    if (hash !== calculated) throw new Error(`audit_hash_mismatch:${index + 1}`);
    previousHash = hash;
  }
  console.log(JSON.stringify({ valid: true, entries: lines.length, finalHash: previousHash }));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
