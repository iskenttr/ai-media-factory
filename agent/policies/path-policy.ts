import path from "node:path";

/**
 * Production-Protected Paths
 * These paths are forbidden in ALL contexts (development and production).
 * Access to these paths represents a critical security violation.
 */
const GLOBAL_FORBIDDEN = [
  ".github",          // Trusted repository automation and workflow permissions
  "deploy",           // Deployment configurations
  "production",       // Production environment files
  "secrets",          // Secret management
  "storage",          // Storage configurations
  ".git",             // Git repository metadata
  ".gitmodules",      // Git submodules
  ".env",             // Environment files (may contain secrets)
  ".gemini",          // Gemini configuration
  "agent/policies",   // Policy enforcement code (must not be modified by agent)
  "docs/AI_MEDIA_FACTORY_CONSTITUTION.md", // Core constitution
];

/**
 * Development-Allowed Paths
 * These paths are allowed for development mode autonomous engineering.
 * These relaxations do NOT apply to production environments.
 */
const DEVELOPMENT_ALLOWED = [
  "docs/**",          // Documentation files
  "agent/state/**",   // Runtime state files
  "agent/reports/**", // Agent reports
  "artifacts/**",     // Build artifacts
  "logs/**",          // Log files
  "worktrees/**",     // Git worktrees
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
  // Handle directory globs with extensions like lib/subtitle-quality/**/*.ts
  // These should accept the directory root and all nested files
  // But NOT match literal file paths like lib/specific.ts
  if (normalizedGlob.includes("/**/")) {
    const dirPrefix = extractGlobDirectoryPrefix(normalizedGlob);
    if (dirPrefix) {
      return normalizedCandidate === dirPrefix || normalizedCandidate.startsWith(`${dirPrefix}/`);
    }
  }
  return normalizedCandidate === normalizedGlob;
}

/**
 * Extract the directory prefix from a glob pattern.
 */
function extractGlobDirectoryPrefix(glob: string): string | null {
  const match = glob.match(/^([^*?\[]+\/)/);
  if (match) {
    return match[1].replace(/\/$/, "") || null;
  }
  // Handle case like lib/**/*.ts where there's no leading dir separator
  const simpleMatch = glob.match(/^([^*?\[]+)\/\*\*/);
  if (simpleMatch) {
    return simpleMatch[1];
  }
  return null;
}

/**
 * Check if a resolved context root is safely derived from an allowed glob.
 * This ensures that:
 * - lib/subtitle-quality is accepted when allowed_paths contains lib/subtitle-quality/**
 * - lib/subtitle-quality/engine.ts is accepted
 * - lib/subtitle-quality-old is rejected (different prefix)
 * - ../lib/subtitle-quality is rejected (traversal)
 */
export function isResolvedContextAllowed(contextPath: string, allowedGlobs: string[]): boolean {
  const normalized = normalizeRepositoryPath(contextPath);
  return allowedGlobs.some((glob) => globMatches(glob, normalized));
}

export function assertAllowedPath(candidate: string, allowed: string[], forbidden: string[], developmentMode = false) {
  const normalized = normalizeRepositoryPath(candidate);
  const global = GLOBAL_FORBIDDEN.find((entry) => normalized === entry || normalized.startsWith(`${entry}/`) || (entry === ".env" && normalized.startsWith(".env.")));
  if (global) throw new Error(`globally_forbidden_path:${normalized}`);
  if (forbidden.some((glob) => globMatches(glob, normalized))) throw new Error(`task_forbidden_path:${normalized}`);
  if (!allowed.some((glob) => globMatches(glob, normalized))) {
    // In development mode, check if path is in development-allowed paths
    if (developmentMode && DEVELOPMENT_ALLOWED.some((glob) => globMatches(glob, normalized))) {
      return normalized;
    }
    throw new Error(`path_not_allowed_by_task:${normalized}`);
  }
  return normalized;
}

export function assertWithinRoot(root: string, candidate: string) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(candidate);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error(`filesystem_path_escape:${candidate}`);
  return resolved;
}

/**
 * Check if a path is a test file (development only)
 */
export function isTestFile(candidate: string): boolean {
  const normalized = normalizeRepositoryPath(candidate);
  return normalized.endsWith(".test.ts") || normalized.endsWith(".test.tsx");
}

/**
 * Development mode: allow test file creation
 */
export function assertAllowedPathDevelopment(candidate: string, allowed: string[], forbidden: string[]): string {
  const normalized = normalizeRepositoryPath(candidate);
  const global = GLOBAL_FORBIDDEN.find((entry) => normalized === entry || normalized.startsWith(`${entry}/`) || (entry === ".env" && normalized.startsWith(".env.")));
  if (global) throw new Error(`globally_forbidden_path:${normalized}`);
  if (forbidden.some((glob) => globMatches(glob, normalized))) throw new Error(`task_forbidden_path:${normalized}`);
  // Allow test files anywhere
  if (isTestFile(candidate) || allowed.some((glob) => globMatches(glob, normalized))) {
    return normalized;
  }
  throw new Error(`path_not_allowed_by_task:${normalized}`);
}
