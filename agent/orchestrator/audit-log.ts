import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

export interface AuditEntry {
  timestamp: string;
  taskId: string;
  category: "state" | "command" | "security" | "model" | "system";
  event: string;
  detail?: Record<string, unknown>;
}

export async function appendAudit(root: string, entry: AuditEntry) {
  const directory = path.join(root, "agent/state");
  const file = path.join(directory, "audit.jsonl");
  await mkdir(directory, { recursive: true });
  let previousHash = "GENESIS";
  try {
    const lines = (await readFile(file, "utf8")).trim().split("\n");
    const last = lines.at(-1);
    if (last) previousHash = JSON.parse(last).hash as string;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const payload = { ...entry, previousHash };
  const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  await appendFile(file, `${JSON.stringify({ ...payload, hash })}\n`, { encoding: "utf8", mode: 0o600 });
}
