// @vitest-environment node
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { normalizeUnifiedDiffHunks, normalizeUnifiedDiffMetadata, isGlobPattern, expandGlobPattern } from "./engineering-agent";

// Test the helper functions by importing them (they are not exported, so we test via enumerateDirectoryFiles behavior)
describe("Directory context handling", () => {
  let mockConsoleLog: ReturnType<typeof vi.fn>;
  let mockConsoleError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockConsoleLog = vi.fn();
    mockConsoleError = vi.fn();
    vi.stubGlobal("console", {
      ...console,
      log: mockConsoleLog,
      error: mockConsoleError,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("source file filtering", () => {
    it("supports TypeScript, JavaScript, JSON, and Markdown files", async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), "amf-dir-source-"));
      try {
        await mkdir(path.join(root, "src"), { recursive: true });
        await writeFile(path.join(root, "src/file.ts"), "ts content");
        await writeFile(path.join(root, "src/file.tsx"), "tsx content");
        await writeFile(path.join(root, "src/file.js"), "js content");
        await writeFile(path.join(root, "src/file.jsx"), "jsx content");
        await writeFile(path.join(root, "src/file.json"), '{"key": "value"}');
        await writeFile(path.join(root, "src/file.md"), "# Markdown");
        // Binary file should be filtered
        await writeFile(path.join(root, "src/image.png"), "\x89PNG\r\n\x1a\n");

        const pattern = "src/**/*.{ts,tsx,js,jsx,json,md}";
        const results = await expandGlobPattern(pattern, root, "TEST-SOURCE");
        expect(results).toHaveLength(6);
        expect(results).toContain("src/file.ts");
        expect(results).toContain("src/file.tsx");
        expect(results).toContain("src/file.js");
        expect(results).toContain("src/file.jsx");
        expect(results).toContain("src/file.json");
        expect(results).toContain("src/file.md");
        expect(results).not.toContain("src/image.png");
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  });

  describe("nested directory enumeration", () => {
    it("enumerates files in nested directories", async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), "amf-dir-nested-"));
      try {
        await mkdir(path.join(root, "lib/subtitle-quality/rules"), { recursive: true });
        await writeFile(path.join(root, "lib/subtitle-quality/engine.ts"), "engine");
        await writeFile(path.join(root, "lib/subtitle-quality/rules/turkish.ts"), "turkish");
        await writeFile(path.join(root, "lib/subtitle-quality/rules/english.ts"), "english");

        const pattern = "lib/subtitle-quality/**/*.ts";
        const results = await expandGlobPattern(pattern, root, "TEST-NESTED");
        expect(results).toHaveLength(3);
        expect(results).toContain("lib/subtitle-quality/engine.ts");
        expect(results).toContain("lib/subtitle-quality/rules/turkish.ts");
        expect(results).toContain("lib/subtitle-quality/rules/english.ts");
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  });

  describe("mixed directory and glob contexts", () => {
    it("handles mixed literal file and glob patterns", async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), "amf-dir-mixed-"));
      try {
        await mkdir(path.join(root, "lib/render"), { recursive: true });
        await mkdir(path.join(root, "lib/utils"), { recursive: true });
        await writeFile(path.join(root, "lib/render/renderer.ts"), "renderer");
        await writeFile(path.join(root, "lib/utils/helper.ts"), "helper");
        await writeFile(path.join(root, "lib/config.json"), "config");

        // Test glob expansion
        const globResults = await expandGlobPattern("lib/render/**/*.ts", root, "TEST-MIXED-GLOB");
        expect(globResults).toHaveLength(1);
        expect(globResults[0]).toBe("lib/render/renderer.ts");

        // Test literal file
        const isLiteral = isGlobPattern("lib/config.json");
        expect(isLiteral).toBe(false);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  });

  describe("empty directory handling", () => {
    it("handles empty directory gracefully", async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), "amf-dir-empty-"));
      try {
        await mkdir(path.join(root, "empty-dir"), { recursive: true });
        await mkdir(path.join(root, "empty-dir/subdir"), { recursive: true });

        const results = await expandGlobPattern("empty-dir/**/*.{ts,tsx,js,jsx,json,md}", root, "TEST-EMPTY");
        expect(results).toHaveLength(0);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });

    it("logs message for empty directory", async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), "amf-dir-empty-log-"));
      try {
        await mkdir(path.join(root, "empty"), { recursive: true });

        const results = await expandGlobPattern("empty/**/*.ts", root, "TEST-EMPTY-LOG");
        expect(results).toHaveLength(0);
        expect(mockConsoleLog).toHaveBeenCalledWith("[TEST-EMPTY-LOG] No files matched glob pattern: empty/**/*.ts");
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  });
});

describe("normalizeUnifiedDiffHunks", () => {
  it("repairs model-reported hunk counts without changing content", () => {
    const patch = [
      "diff --git a/docs/new.md b/docs/new.md",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/docs/new.md",
      "@@ -0,0 +1,114 @@",
      "+first",
      "second",
      "+third",
      "",
    ].join("\n");

    expect(normalizeUnifiedDiffHunks(patch)).toContain("@@ -0,0 +1,3 @@");
    expect(normalizeUnifiedDiffHunks(patch)).toContain("+first\n+second\n+third");
  });

  it("counts context, additions, and removals independently", () => {
    const patch = "@@ -4,99 +4,99 @@\n context\n-old\n+new";
    expect(normalizeUnifiedDiffHunks(patch)).toBe("@@ -4,2 +4,2 @@\n context\n-old\n+new\n");
  });
});

describe("normalizeUnifiedDiffMetadata", () => {
  it("repairs an invalid mode for an existing regular file", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "amf-diff-metadata-"));
    try {
      await writeFile(path.join(root, "existing.ts"), "old\n");
      const patch = [
        "diff --git a/existing.ts b/existing.ts",
        "index 1111111..2222222 100",
        "--- a/existing.ts",
        "+++ b/existing.ts",
        "@@ -1 +1 @@",
        "-old",
        "+new",
        "",
      ].join("\n");
      expect(await normalizeUnifiedDiffMetadata(patch, root)).toContain("index 1111111..2222222 100644");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not let a new-file marker overwrite an existing file", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "amf-diff-existing-"));
    try {
      await writeFile(path.join(root, "existing.ts"), "old\n");
      const patch = "diff --git a/existing.ts b/existing.ts\nnew file mode 100644\n--- /dev/null\n+++ b/existing.ts\n@@ -0,0 +1 @@\n+new\n";
      const result = await normalizeUnifiedDiffMetadata(patch, root);
      expect(result).not.toContain("new file mode");
      expect(result).toContain("--- a/existing.ts");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("Context path glob expansion", () => {
  let mockConsoleLog: ReturnType<typeof vi.fn>;
  let mockConsoleError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockConsoleLog = vi.fn();
    mockConsoleError = vi.fn();
    vi.stubGlobal("console", {
      ...console,
      log: mockConsoleLog,
      error: mockConsoleError,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("wildcard context paths", () => {
    it("expands wildcard pattern into matching files", async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), "amf-glob-wildcard-"));
      try {
        await mkdir(path.join(root, "lib/render/nested"), { recursive: true });
        await writeFile(path.join(root, "lib/render/file1.ts"), "export const a = 1;");
        await writeFile(path.join(root, "lib/render/file2.ts"), "export const b = 2;");
        await writeFile(path.join(root, "lib/render/nested/deep.ts"), "export const c = 3;");

        const results = await expandGlobPattern("lib/render/**/*.ts", root, "TEST-001");

        expect(results).toHaveLength(3);
        expect(results).toContain("lib/render/file1.ts");
        expect(results).toContain("lib/render/file2.ts");
        expect(results).toContain("lib/render/nested/deep.ts");
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });

    it("handles empty glob matches gracefully", async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), "amf-glob-empty-"));
      try {
        const results = await expandGlobPattern("nonexistent/**/*.ts", root, "TEST-002");

        expect(results).toHaveLength(0);
        expect(mockConsoleLog).toHaveBeenCalledWith(
          "[TEST-002] No files matched glob pattern: nonexistent/**/*.ts"
        );
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  });

  describe("literal file paths", () => {
    it("detects glob patterns vs literal paths", () => {
      expect(isGlobPattern("lib/specific.ts")).toBe(false);
      expect(isGlobPattern("lib/**/*.ts")).toBe(true);
      expect(isGlobPattern("*.ts")).toBe(true);
      expect(isGlobPattern("[abc].ts")).toBe(true);
      expect(isGlobPattern("file?.ts")).toBe(true);
    });
  });

  describe("mixed wildcard + literal paths", () => {
    it("processes mixed patterns correctly", async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), "amf-glob-mixed-"));
      try {
        await mkdir(path.join(root, "lib/render"), { recursive: true });
        await mkdir(path.join(root, "workers"), { recursive: true });
        await writeFile(path.join(root, "lib/render/render.ts"), "render content");
        await writeFile(path.join(root, "workers/worker.ts"), "worker content");

        const renderResults = await expandGlobPattern("lib/render/**/*.ts", root, "TEST-004");
        expect(renderResults).toHaveLength(1);
        expect(renderResults[0]).toBe("lib/render/render.ts");

        const workerResults = await expandGlobPattern("workers/**/*.ts", root, "TEST-005");
        expect(workerResults).toHaveLength(1);
        expect(workerResults[0]).toBe("workers/worker.ts");
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  });
});
