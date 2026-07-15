import { describe, expect, it } from "vitest";
import { acceptedCandidateRefspec } from "./git-gateway";

const hash = "a".repeat(40);

describe("accepted candidate publisher boundary", () => {
  it("builds an explicit non-deleting agent refspec", () => {
    expect(acceptedCandidateRefspec("TEST-001", "agent/test-001-add-tests", hash))
      .toBe(`${hash}:refs/heads/agent/test-001-add-tests`);
  });

  it.each([
    "main",
    "codex/agent-v2",
    "agent/other-001-wrong-task",
    "agent/test-001-../../main",
  ])("rejects branch %s", (branch) => {
    expect(() => acceptedCandidateRefspec("TEST-001", branch, hash)).toThrow("candidate_publish_invalid_branch");
  });

  it("rejects non-object commit identifiers", () => {
    expect(() => acceptedCandidateRefspec("TEST-001", "agent/test-001-add-tests", "HEAD"))
      .toThrow("candidate_publish_invalid_commit");
  });
});
