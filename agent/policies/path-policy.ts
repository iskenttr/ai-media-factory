import path from "node:path";

const GLOBAL_FORBIDDEN = [
  "deploy", "production", "secrets", "storage", ".git", ".gitmodules", ".env", ".gemini", "agent/policies",
  "docs/AI_MEDIA_FACTORY_CONSTITUTION.md",
];

export function normalizeRepositoryPath(value: string) {
  if (value.includes("\0") || path.isAbsolute(value) || value.includes("\\")) throw new Error(`unsafe_path:${value}`);
  const normalized = path.posix.normalize(value);
  if (normalized === ".." || normalized.startsWith("../")) throw new Error(`path_escape:${value}`);
  return normalized.replace(/^\.\//, "");
}

export function globMatches(glob: string, candidate: string) {
  const normalizedGlob = normalizeRepositoryPath(glob);
  const normalizedCandidate = normalizeRepositoryPath(candidate);
  if (normalizedGlob.endsWith("/**")) {
    const prefix = normalizedGlob.slice(0, -3);
    return normalizedCandidate === prefix || normalizedCandidate.startsWith(`${prefix}/`);
  }
  return normalizedCandidate === normalizedGlob;
}

export function assertAllowedPath(candidate: string, allowed: string[], forbidden: string[]) {
  const normalized = normalizeRepositoryPath(candidate);
  const global = GLOBAL_FORBIDDEN.find((entry) => normalized === entry || normalized.startsWith(`${entry}/`) || (entry === ".env" && normalized.startsWith(".env.")));
  if (global) throw new Error(`globally_forbidden_path:${normalized}`);
  if (forbidden.some((glob) => globMatches(glob, normalized))) throw new Error(`task_forbidden_path:${normalized}`);
  if (!allowed.some((glob) => globMatches(glob, normalized))) throw new Error(`path_not_allowed_by_task:${normalized}`);
  return normalized;
}

export function assertWithinRoot(root: string, candidate: string) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(candidate);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error(`filesystem_path_escape:${candidate}`);
  return resolved;
}
