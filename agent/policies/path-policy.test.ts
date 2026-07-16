// @vitest-environment node
import { describe, expect, it } from "vitest";
import { assertAllowedPath, assertWithinRoot, isResolvedContextAllowed, globMatches } from "./path-policy";

describe("path policy", () => {
  it("allows task-scoped paths", () => expect(assertAllowedPath("benchmarks/fixtures/a.txt", ["benchmarks/**"], [])).toBe("benchmarks/fixtures/a.txt"));
  it("rejects production and policy paths", () => {
    expect(() => assertAllowedPath("production/file", ["**"], [])).toThrow("globally_forbidden_path");
    expect(() => assertAllowedPath("agent/policies/x.ts", ["agent/**"], [])).toThrow("globally_forbidden_path");
    expect(() => assertAllowedPath(".env.agent", ["**"], [])).toThrow("globally_forbidden_path");
  });
  it("rejects traversal and absolute paths", () => {
    expect(() => assertAllowedPath("../escape", ["**"], [])).toThrow();
    expect(() => assertAllowedPath("/etc/passwd", ["**"], [])).toThrow();
  });
  it("rejects filesystem escape", () => expect(() => assertWithinRoot("/tmp/work", "/tmp/other")).toThrow("filesystem_path_escape"));
});

describe("globMatches", () => {
  describe("glob allowed path accepts resolved directory root", () => {
    it("accepts lib/subtitle-quality when allowed is lib/subtitle-quality/**/*.ts", () => {
      expect(globMatches("lib/subtitle-quality/**/*.ts", "lib/subtitle-quality")).toBe(true);
    });
    it("accepts lib/subtitle-quality when allowed is lib/subtitle-quality/**", () => {
      expect(globMatches("lib/subtitle-quality/**", "lib/subtitle-quality")).toBe(true);
    });
  });

  describe("glob allowed path accepts matching nested file", () => {
    it("accepts lib/subtitle-quality/engine.ts when allowed is lib/subtitle-quality/**/*.ts", () => {
      expect(globMatches("lib/subtitle-quality/**/*.ts", "lib/subtitle-quality/engine.ts")).toBe(true);
    });
    it("accepts deeply nested lib/subtitle-quality/rules/turkish.ts", () => {
      expect(globMatches("lib/subtitle-quality/**/*.ts", "lib/subtitle-quality/rules/turkish.ts")).toBe(true);
    });
  });

  describe("unrelated directory rejected", () => {
    it("rejects lib/server when allowed is lib/subtitle-quality/**/*.ts", () => {
      expect(globMatches("lib/subtitle-quality/**/*.ts", "lib/server")).toBe(false);
    });
    it("rejects lib/other when allowed is lib/subtitle-quality/**", () => {
      expect(globMatches("lib/subtitle-quality/**", "lib/other")).toBe(false);
    });
  });

  describe("prefix collision rejected", () => {
    it("rejects lib/subtitle-quality-old when allowed is lib/subtitle-quality/**/*.ts", () => {
      expect(globMatches("lib/subtitle-quality/**/*.ts", "lib/subtitle-quality-old")).toBe(false);
    });
    it("rejects lib/subtitle-quality-v2 when allowed is lib/subtitle-quality/**", () => {
      expect(globMatches("lib/subtitle-quality/**", "lib/subtitle-quality-v2")).toBe(false);
    });
    it("rejects lib/subtitle-quality-old/file.ts", () => {
      expect(globMatches("lib/subtitle-quality/**/*.ts", "lib/subtitle-quality-old/file.ts")).toBe(false);
    });
  });

  describe("traversal rejected", () => {
    it("rejects ../lib/subtitle-quality", () => {
      expect(() => globMatches("lib/subtitle-quality", "../lib/subtitle-quality")).toThrow("path_escape");
    });
  });

  describe("absolute outside path rejected", () => {
    it("rejects /opt/other-repository", () => {
      expect(() => globMatches("lib/subtitle-quality", "/opt/other-repository")).toThrow("unsafe_path");
    });
  });

  describe("mixed literal and glob allowed paths", () => {
    it("accepts literal path when explicitly listed", () => {
      expect(globMatches("lib/specific.ts", "lib/specific.ts")).toBe(true);
    });
    it("rejects different literal path", () => {
      expect(globMatches("lib/specific.ts", "lib/other.ts")).toBe(false);
    });
  });
});

describe("isResolvedContextAllowed", () => {
  it("accepts directory root covered by glob", () => {
    expect(isResolvedContextAllowed("lib/subtitle-quality", ["lib/subtitle-quality/**/*.ts"])).toBe(true);
  });
  it("accepts nested file covered by glob", () => {
    expect(isResolvedContextAllowed("lib/subtitle-quality/engine.ts", ["lib/subtitle-quality/**/*.ts"])).toBe(true);
  });
  it("rejects directory not covered by any glob", () => {
    expect(isResolvedContextAllowed("lib/server", ["lib/subtitle-quality/**/*.ts"])).toBe(false);
  });
  it("accepts when any glob matches", () => {
    expect(isResolvedContextAllowed("lib/other", ["lib/subtitle-quality/**", "lib/other/**"])).toBe(true);
  });
});

describe("assertAllowedPath with glob patterns", () => {
  it("allows directory root when covered by glob", () => {
    expect(assertAllowedPath("lib/subtitle-quality", ["lib/subtitle-quality/**/*.ts"], [])).toBe("lib/subtitle-quality");
  });
  it("allows nested file when covered by glob", () => {
    expect(assertAllowedPath("lib/subtitle-quality/engine.ts", ["lib/subtitle-quality/**/*.ts"], [])).toBe("lib/subtitle-quality/engine.ts");
  });
  it("rejects directory not covered by glob", () => {
    expect(() => assertAllowedPath("lib/server", ["lib/subtitle-quality/**/*.ts"], [])).toThrow("path_not_allowed_by_task");
  });
  it("rejects prefix collision", () => {
    expect(() => assertAllowedPath("lib/subtitle-quality-old", ["lib/subtitle-quality/**/*.ts"], [])).toThrow("path_not_allowed_by_task");
  });
});
