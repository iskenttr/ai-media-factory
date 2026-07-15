import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EngineeringTask } from "../tasks/schema";
import { assertAllowedPath, assertWithinRoot } from "../policies/path-policy";
import { applyCandidatePatch } from "./git-gateway";
import { requestGeminiPatch } from "./gemini-broker";

function patchFiles(patch: string) {
  return [...patch.matchAll(/^\+\+\+ b\/(.+)$/gm)].map((match) => match[1]);
}

export function normalizeUnifiedDiffHunks(patch: string): string {
  const lines = patch.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/);
    if (!match) continue;
    const diffStart = lines.slice(0, index).findLastIndex((line) => line.startsWith("diff --git "));
    const isNewFile = lines.slice(diffStart, index).some((line) => line === "--- /dev/null");
    let oldCount = 0;
    let newCount = 0;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      let line = lines[cursor];
      if (line.startsWith("@@ ") || line.startsWith("diff --git ")) break;
      if (cursor === lines.length - 1 && line === "") continue;
      if (isNewFile && !/^[ +\\-]/.test(line)) {
        lines[cursor] = `+${line}`;
        line = lines[cursor];
      }
      if (line.startsWith("\\ No newline")) continue;
      if (line.startsWith(" ") || line.startsWith("-")) oldCount += 1;
      if (line.startsWith(" ") || line.startsWith("+")) newCount += 1;
    }
    lines[index] = `@@ -${match[1]},${oldCount} +${match[2]},${newCount} @@${match[3]}`;
  }
  const normalized = lines.join("\n");
  return normalized.endsWith("\n") ? normalized : `${normalized}\n`;
}

export async function implementTask(root: string, task: EngineeringTask, worktree: string, artifactDirectory: string, repairContext?: string) {
  if (task.execution.kind === "approval_required") throw new Error("task_requires_human_approval");
  if (task.execution.kind === "controlled_sample") {
    const target = assertAllowedPath(task.execution.target, task.allowed_paths, task.forbidden_paths);
    const absolute = assertWithinRoot(worktree, path.join(worktree, target));
    await writeFile(absolute, task.execution.content, { encoding: "utf8", flag: "wx" });
    return { plan: ["Create the task-scoped controlled sample file.", "Run isolated tests and deterministic evaluation.", "Commit only after QA and Security approval."], rationale: "Controlled migration smoke task; no model call was made.", modelCalls: 0 };
  }
  const context: string[] = [];
  let total = 0;
  for (const requested of task.execution.context_paths) {
    const file = assertAllowedPath(requested, task.allowed_paths, task.forbidden_paths);
    const content = await readFile(assertWithinRoot(worktree, path.join(worktree, file)), "utf8");
    total += content.length;
    if (total > 250_000) throw new Error("model_context_budget_exhausted");
    context.push(`FILE: ${file}\n${content}`);
  }
  const constitution = await readFile(path.join(root, "docs/AI_MEDIA_FACTORY_CONSTITUTION.md"), "utf8");
  const rolePrompt = await readFile(path.join(root, "agent/prompts/engineering-agent.md"), "utf8");
  const prompt = [
    constitution,
    rolePrompt,
    "Return JSON only with keys plan:string[], patch:string, rationale:string.",
    "Do not request or execute tools. Produce one unified diff. Do not change policy, production, deployment, credentials, Git configuration, or paths outside allowed_paths.",
    "Unified diff rules: every changed file must include diff --git, --- and +++ headers; preserve mode 100644 for existing FILE context paths; never mark an existing FILE as /dev/null or new file; edit existing tests in place; use new file mode 100644 only for a genuinely new path; preserve literal backslashes by escaping them correctly in JSON.",
    `TASK: ${task.objective}`,
    `ALLOWED_PATHS: ${task.allowed_paths.join(", ")}`,
    repairContext ? `REPAIR_CONTEXT: ${repairContext.slice(0, 30_000)}` : "INITIAL_IMPLEMENTATION",
    ...context,
  ].join("\n\n");
  const response = await requestGeminiPatch(root, task.task_id, prompt, task.limits.maximum_model_calls, task.limits.maximum_model_tokens);
  const normalizedPatch = normalizeUnifiedDiffHunks(response.patch);
  const files = patchFiles(normalizedPatch);
  if (!files.length) throw new Error("model_patch_has_no_files");
  for (const file of files) assertAllowedPath(file, task.allowed_paths, task.forbidden_paths);
  const patchFile = path.join(artifactDirectory, "model.patch");
  await writeFile(patchFile, normalizedPatch, { mode: 0o600 });
  await applyCandidatePatch(root, task.task_id, worktree, patchFile);
  return { plan: response.plan, rationale: response.rationale, modelCalls: 1 };
}
