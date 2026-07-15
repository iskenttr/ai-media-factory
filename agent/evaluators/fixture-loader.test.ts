// @vitest-environment node
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadVerifiedFixture } from "./fixture-loader";

let root = "";
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); root = ""; });

describe("fixture loader", () => {
  it("verifies fixture payload checksums", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "amf-fixture-"));
    await writeFile(path.join(root, "source.webm"), "video");
    await writeFile(path.join(root, "segments.json"), "[]");
    const sha = (value: string) => createHash("sha256").update(value).digest("hex");
    const manifestFile = path.join(root, "fixture.json");
    await writeFile(manifestFile, JSON.stringify({
      schemaVersion: 1, fixtureId: "test", goldenApproval: "pending", mediaRootEnvironmentVariable: "TEST_ROOT",
      sourceVideo: { relativePath: "source.webm", sha256: sha("video") }, localizedSegments: { relativePath: "segments.json", sha256: sha("[]") },
      provenance: { classification: "sanitized-development-fixture", sourceTextReconstructedFromBurnedCaptions: false, productionIdentifiersIncluded: false, humanGoldenApproval: "required" },
    }));
    expect((await loadVerifiedFixture(manifestFile, { TEST_ROOT: root })).sourceVideo.sha256).toBe(sha("video"));
  });

  it("fails closed on checksum mismatch", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "amf-fixture-"));
    await writeFile(path.join(root, "source.webm"), "video");
    await writeFile(path.join(root, "segments.json"), "[]");
    const manifestFile = path.join(root, "fixture.json");
    await writeFile(manifestFile, JSON.stringify({
      schemaVersion: 1, fixtureId: "test", goldenApproval: "pending", mediaRootEnvironmentVariable: "TEST_ROOT",
      sourceVideo: { relativePath: "source.webm", sha256: "0".repeat(64) }, localizedSegments: { relativePath: "segments.json", sha256: createHash("sha256").update("[]").digest("hex") },
      provenance: { classification: "sanitized-development-fixture", sourceTextReconstructedFromBurnedCaptions: false, productionIdentifiersIncluded: false, humanGoldenApproval: "required" },
    }));
    await expect(loadVerifiedFixture(manifestFile, { TEST_ROOT: root })).rejects.toThrow("fixture_checksum_mismatch");
  });
});
