// @vitest-environment node
import { describe, expect, it } from "vitest";
import { assertAllowedPath, assertWithinRoot } from "./path-policy";

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
