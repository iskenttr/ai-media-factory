import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const payloadSchema = z.object({ relativePath: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).passthrough();
const fixtureSchema = z.object({
  schemaVersion: z.literal(1), fixtureId: z.string().min(1), goldenApproval: z.enum(["pending", "approved"]),
  mediaRootEnvironmentVariable: z.string().regex(/^[A-Z][A-Z0-9_]+$/), sourceVideo: payloadSchema, localizedSegments: payloadSchema,
  provenance: z.object({ classification: z.literal("sanitized-development-fixture"), sourceTextReconstructedFromBurnedCaptions: z.literal(false), productionIdentifiersIncluded: z.literal(false), humanGoldenApproval: z.literal("required") }),
}).strict();

async function verify(root: string, relative: string, expected: string) {
  if (path.isAbsolute(relative) || relative.includes("..") || relative.includes("\\")) throw new Error(`unsafe_fixture_path:${relative}`);
  const file = path.resolve(root, relative);
  if (!file.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error(`fixture_path_escape:${relative}`);
  const actual = createHash("sha256").update(await readFile(file)).digest("hex");
  if (actual !== expected) throw new Error(`fixture_checksum_mismatch:${relative}:${expected}:${actual}`);
  return { file, sha256: actual };
}

export async function loadVerifiedFixture(manifestFile: string, environment: Record<string, string | undefined> = process.env) {
  const manifest = fixtureSchema.parse(JSON.parse(await readFile(manifestFile, "utf8")));
  const payloadRoot = environment[manifest.mediaRootEnvironmentVariable];
  if (!payloadRoot) throw new Error(`fixture_media_root_not_configured:${manifest.mediaRootEnvironmentVariable}`);
  const sourceVideo = await verify(payloadRoot, manifest.sourceVideo.relativePath, manifest.sourceVideo.sha256);
  const localizedSegments = await verify(payloadRoot, manifest.localizedSegments.relativePath, manifest.localizedSegments.sha256);
  return { manifest, sourceVideo, localizedSegments };
}
