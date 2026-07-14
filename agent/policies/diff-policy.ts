import { createHash } from "node:crypto";
import type { EngineeringTask } from "../tasks/schema";
import { assertAllowedPath } from "./path-policy";

const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:api[_-]?key|password|secret|token)\s*[:=]\s*["']?[A-Za-z0-9_\-]{16,}/i,
  /AIza[0-9A-Za-z\-_]{30,}/,
];

export function inspectDiff(task: EngineeringTask, files: string[], patch: string) {
  if (files.length > task.limits.maximum_changed_files) throw new Error(`changed_file_limit:${files.length}`);
  const lines = patch.split("\n").filter((line) => line.startsWith("+") || line.startsWith("-")).length;
  if (lines > task.limits.maximum_diff_lines) throw new Error(`diff_line_limit:${lines}`);
  if (/^(?:new file mode 120000|new file mode 160000|old mode |new mode 100755)/m.test(patch)) throw new Error("unsafe_git_mode_change");
  for (const file of files) assertAllowedPath(file, task.allowed_paths, task.forbidden_paths);
  if (secretPatterns.some((pattern) => pattern.test(patch))) throw new Error("possible_secret_in_diff");
  return { files, diffLines: lines, sha256: createHash("sha256").update(patch).digest("hex"), secretScan: "passed" as const };
}
