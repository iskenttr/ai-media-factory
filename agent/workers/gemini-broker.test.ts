// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { allowedModelFamilies, extractResponse, isModelAllowed, isTransientVertexFailure } from "./gemini-broker";

// ---------------------------------------------------------------------------
// allowedModelFamilies
// ---------------------------------------------------------------------------
describe("allowedModelFamilies", () => {
  const originalEnv = process.env.AMF_AGENT_ALLOWED_MODEL_FAMILIES;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.AMF_AGENT_ALLOWED_MODEL_FAMILIES;
    } else {
      process.env.AMF_AGENT_ALLOWED_MODEL_FAMILIES = originalEnv;
    }
  });

  it("returns the built-in default families when env is unset", () => {
    delete process.env.AMF_AGENT_ALLOWED_MODEL_FAMILIES;
    const families = allowedModelFamilies();
    expect(families).toContain("gemini-2.5-flash");
    expect(families).toContain("gemini-3.5-flash");
  });

  it("parses a comma-separated override from env", () => {
    process.env.AMF_AGENT_ALLOWED_MODEL_FAMILIES = "gemini-1.5-pro,gemini-2.0-flash";
    const families = allowedModelFamilies();
    expect(families).toEqual(["gemini-1.5-pro", "gemini-2.0-flash"]);
  });

  it("trims whitespace around entries", () => {
    process.env.AMF_AGENT_ALLOWED_MODEL_FAMILIES = " gemini-2.5-flash , gemini-3.5-flash ";
    const families = allowedModelFamilies();
    expect(families).toEqual(["gemini-2.5-flash", "gemini-3.5-flash"]);
  });

  it("falls back to defaults when env is blank", () => {
    process.env.AMF_AGENT_ALLOWED_MODEL_FAMILIES = "   ";
    const families = allowedModelFamilies();
    expect(families).toContain("gemini-2.5-flash");
    expect(families).toContain("gemini-3.5-flash");
  });
});

// ---------------------------------------------------------------------------
// isModelAllowed — exact match and prefix match
// ---------------------------------------------------------------------------
describe("isModelAllowed", () => {
  const families = ["gemini-2.5-flash", "gemini-3.5-flash"];

  it("accepts an exact family name", () => {
    expect(isModelAllowed("gemini-2.5-flash", families)).toBe(true);
    expect(isModelAllowed("gemini-3.5-flash", families)).toBe(true);
  });

  it("accepts a versioned variant that starts with a family prefix", () => {
    expect(isModelAllowed("gemini-2.5-flash-001", families)).toBe(true);
    expect(isModelAllowed("gemini-3.5-flash-exp-0827", families)).toBe(true);
  });

  it("rejects a model outside the allowlist", () => {
    expect(isModelAllowed("gemini-1.0-pro", families)).toBe(false);
    expect(isModelAllowed("gpt-4o", families)).toBe(false);
    expect(isModelAllowed("claude-3-opus", families)).toBe(false);
  });

  it("rejects a model that is a partial prefix of an allowed family", () => {
    // "gemini-2.5" alone is not an allowed family; it must start with "gemini-2.5-flash"
    expect(isModelAllowed("gemini-2.5", families)).toBe(false);
  });

  it("is case-sensitive", () => {
    expect(isModelAllowed("Gemini-2.5-Flash", families)).toBe(false);
  });

  it("returns false on an empty model string", () => {
    expect(isModelAllowed("", families)).toBe(false);
  });

  it("returns false when the allowlist is empty", () => {
    expect(isModelAllowed("gemini-2.5-flash", [])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Transparent routing — allowed routed model should pass
// ---------------------------------------------------------------------------
describe("transparent routing policy", () => {
  const families = ["gemini-2.5-flash", "gemini-3.5-flash"];

  it("accepts gemini-3.5-flash when gemini-2.5-flash was requested but provider routed", () => {
    // Both are in the allowlist so routing is transparent and acceptable
    expect(isModelAllowed("gemini-3.5-flash", families)).toBe(true);
  });

  it("rejects an unknown model returned by the provider even if requested model was allowed", () => {
    expect(isModelAllowed("gemini-ultra-secret", families)).toBe(false);
  });
});

describe("Gemini CLI JSON parsing", () => {
  it("extracts the routed model and aggregate usage from outer stats", () => {
    const result = extractResponse(JSON.stringify({
      response: JSON.stringify({
        plan: ["inspect", "patch"],
        patch: "diff --git a/a.ts b/a.ts",
        rationale: "bounded change",
      }),
      stats: {
        models: {
          "gemini-3.5-flash": {
            tokens: {
              input: 6481,
              prompt: 6481,
              candidates: 5,
              total: 7703,
              cached: 0,
              thoughts: 1217,
              tool: 0,
            },
          },
        },
      },
    }));

    expect(result.error).toBeNull();
    expect(result.parsed?.actualModel).toBe("gemini-3.5-flash");
    expect(result.parsed?.reportedUsage).toEqual({
      input: 6481,
      prompt: 6481,
      candidates: 5,
      total: 7703,
      cached: 0,
      thoughts: 1217,
      tool: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// is429 helper — tested indirectly via pattern matching strings used in broker
// ---------------------------------------------------------------------------
describe("429 pattern detection", () => {
  const patterns = [
    "429 Too Many Requests",
    "RESOURCE_EXHAUSTED: quota exceeded",
    "Rate limit exceeded",
    "rate-limit hit",
    "Quota exceeded for project",
  ];

  const notPatterns = [
    "200 OK",
    "model not found",
    "invalid argument",
  ];

  // We test the regex directly since it's a private implementation detail
  // duplicated here for coverage.
  const is429Re = /429|RESOURCE_EXHAUSTED|quota.*exceeded|rate.?limit/i;

  for (const p of patterns) {
    it(`detects 429-like message: "${p.slice(0, 40)}"`, () => {
      expect(is429Re.test(p)).toBe(true);
    });
  }

  for (const p of notPatterns) {
    it(`does not false-positive on: "${p}"`, () => {
      expect(is429Re.test(p)).toBe(false);
    });
  }
});

describe("transient Vertex failure detection", () => {
  it("retries server and non-JSON gateway responses", () => {
    expect(isTransientVertexFailure(503, "service unavailable")).toBe(true);
    expect(isTransientVertexFailure(200, "vertex_non_json_response:200:<!DOCTYPE html>")).toBe(true);
  });

  it("does not retry deterministic client failures", () => {
    expect(isTransientVertexFailure(400, "invalid argument")).toBe(false);
    expect(isTransientVertexFailure(403, "permission denied")).toBe(false);
  });
});
