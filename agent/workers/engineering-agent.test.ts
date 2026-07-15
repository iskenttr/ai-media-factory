// @vitest-environment node
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeUnifiedDiffHunks, normalizeUnifiedDiffMetadata } from "./engineering-agent";

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
