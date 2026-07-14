// @vitest-environment node
import { describe, expect, it } from "vitest";
import { normalizeUnifiedDiffHunks } from "./engineering-agent";

describe("normalizeUnifiedDiffHunks", () => {
  it("repairs model-reported hunk counts without changing content", () => {
    const patch = [
      "diff --git a/docs/new.md b/docs/new.md",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/docs/new.md",
      "@@ -0,0 +1,114 @@",
      "+first",
      "+second",
      "+third",
      "",
    ].join("\n");

    expect(normalizeUnifiedDiffHunks(patch)).toContain("@@ -0,0 +1,3 @@");
    expect(normalizeUnifiedDiffHunks(patch)).toContain("+first\n+second\n+third");
  });

  it("counts context, additions, and removals independently", () => {
    const patch = "@@ -4,99 +4,99 @@\n context\n-old\n+new\n";
    expect(normalizeUnifiedDiffHunks(patch)).toBe("@@ -4,2 +4,2 @@\n context\n-old\n+new\n");
  });
});
