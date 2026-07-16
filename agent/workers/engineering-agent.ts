import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import type { EngineeringTask } from "../tasks/schema";
import { assertAllowedPath, assertWithinRoot } from "../policies/path-policy";
import { applyCandidatePatch } from "./git-gateway";
import { requestGeminiPatch } from "./gemini-broker";

const GLOB_PATTERN = /[*?[\]]/;
const MAX_CONTEXT_SIZE = 250_000;

export function isGlobPattern(requested: string): boolean {
  return GLOB_PATTERN.test(requested);
}

export async function expandGlobPattern(pattern: string, worktree: string, taskId: string): Promise<string[]> {
  try {
    // Join pattern with worktree for absolute path matching
    const resolvedPattern = path.join(worktree, pattern);
    const matches = await fg.glob([resolvedPattern], {
      absolute: true,
      onlyFiles: true,
      dot: false,
    });
    // Convert absolute paths back to relative paths
    const relativeMatches = matches.map((m) => path.relative(worktree, m).replace(/\\/g, "/"));
    if (relativeMatches.length === 0) {
      console.log(`[${taskId}] No files matched glob pattern: ${pattern}`);
    }
    return relativeMatches;
  } catch (error) {
    console.error(`[${taskId}] Error expanding glob pattern ${pattern}:`, error);
    return [];
  }
}

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

export async function normalizeUnifiedDiffMetadata(patch: string, worktree: string) {
  const sections = patch.split(/(?=^diff --git )/m);
  const normalized: string[] = [];
  for (const section of sections) {
    const lines = section.split("\n");
    const header = lines[0]?.match(/^diff --git a\/(.+) b\/(.+)$/);
    if (!header || header[1] !== header[2]) {
      normalized.push(section);
      continue;
    }
    const file = header[2];
    const absolute = assertWithinRoot(worktree, path.join(worktree, file));
    const existing = await stat(absolute).catch(() => null);
    const expectedMode = existing && (existing.mode & 0o111) ? "100755" : "100644";
    const repaired = lines
      .filter((line) => !(existing && line.startsWith("new file mode ")))
      .map((line) => {
        if (existing && line === "--- /dev/null") return `--- a/${file}`;
        if (line.startsWith("new file mode ")) return `new file mode ${expectedMode}`;
        if (/^index [0-9a-f]+\.\.[0-9a-f]+ \d+$/.test(line)) return line.replace(/ \d+$/, ` ${expectedMode}`);
        return line;
      });
    normalized.push(repaired.join("\n"));
  }
  return normalized.join("");
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
    const files = isGlobPattern(requested)
      ? await expandGlobPattern(requested, worktree, task.task_id)
      : [requested];

    for (const file of files) {
      try {
        const validatedFile = assertAllowedPath(file, task.allowed_paths, task.forbidden_paths);
        const absolutePath = assertWithinRoot(worktree, path.join(worktree, validatedFile));
        const content = await readFile(absolutePath, "utf8");
        total += content.length;
        if (total > MAX_CONTEXT_SIZE) throw new Error("model_context_budget_exhausted");
        context.push(`FILE: ${validatedFile}\n${content}`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          console.error(`[${task.task_id}] Context file not found: ${file}, skipping`);
        } else if ((error as Error).message.startsWith("path_not_allowed_by_task")) {
          throw new Error(`task_context_path_not_allowed:${file}`);
        } else {
          throw error;
        }
      }
    }
  }
  const constitution = await readFile(path.join(root, "docs/AI_MEDIA_FACTORY_CONSTITUTION.md"), "utf8");
  const rolePrompt = await readFile(path.join(root, "agent/prompts/engineering-agent.md"), "utf8");
  const promptParts = [
    constitution,
    rolePrompt,
    "Return JSON only with keys plan:string[], patch:string, rationale:string.",
    "Do not request or execute tools. Produce one unified diff. Do not change policy, production, deployment, credentials, Git configuration, or paths outside allowed_paths.",
    "Unified diff rules: every changed file must include diff --git, --- and +++ headers; preserve mode 100644 for existing FILE context paths; never mark an existing FILE as /dev/null or new file; edit existing tests in place; use new file mode 100644 only for a genuinely new path; preserve literal backslashes by escaping them correctly in JSON.",
    `TASK: ${task.objective}`,
    `ALLOWED_PATHS: ${task.allowed_paths.join(", ")}`,
    repairContext ? `REPAIR_CONTEXT: ${repairContext.slice(0, 30_000)}` : "INITIAL_IMPLEMENTATION",
    ...context,
  ];
  const maximumPatchAttempts = task.execution.repair_strategy === "gemini_patch_review"
    ? Math.min(2, task.limits.maximum_model_calls)
    : 1;
  let patchRepairContext = "";
  let lastError: unknown = new Error("model_patch_not_attempted");
  for (let attempt = 1; attempt <= maximumPatchAttempts; attempt += 1) {
    const prompt = [
      ...promptParts,
      patchRepairContext || "NO_PATCH_APPLY_FAILURE",
    ].join("\n\n");
    const response = await requestGeminiPatch(root, task.task_id, prompt, task.limits.maximum_model_calls, task.limits.maximum_model_tokens);
    const metadataNormalized = await normalizeUnifiedDiffMetadata(response.patch, worktree);
    const normalizedPatch = normalizeUnifiedDiffHunks(metadataNormalized);
    const files = patchFiles(normalizedPatch);
    if (!files.length) throw new Error("model_patch_has_no_files");
    for (const file of files) assertAllowedPath(file, task.allowed_paths, task.forbidden_paths);
    const attemptPatchFile = path.join(artifactDirectory, `model-patch-${attempt}.patch`);
    const patchFile = path.join(artifactDirectory, "model.patch");
    await writeFile(attemptPatchFile, normalizedPatch, { mode: 0o600 });
    await writeFile(patchFile, normalizedPatch, { mode: 0o600 });
    try {
      await applyCandidatePatch(root, task.task_id, worktree, patchFile);
      return { plan: response.plan, rationale: response.rationale, modelCalls: attempt };
    } catch (error) {
      lastError = error;
      if (attempt >= maximumPatchAttempts) break;
      const detail = error instanceof Error ? error.message : String(error);
      patchRepairContext = [
        "PATCH_APPLY_REPAIR_REQUIRED",
        `APPLY_ERROR: ${detail.slice(0, 4_000)}`,
        "The previous patch was rejected before application. Produce a complete replacement unified diff against the exact FILE contents in this prompt. Do not repeat stale hunk line numbers or invalid file metadata.",
        `REJECTED_PATCH:\n${normalizedPatch.slice(0, 30_000)}`,
      ].join("\n");
    }
  }
  throw lastError;
}
