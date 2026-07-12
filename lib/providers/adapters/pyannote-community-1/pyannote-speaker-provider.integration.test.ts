// @vitest-environment node

import { access } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { PyannoteCommunitySpeakerProvider } from "./pyannote-speaker-provider";

const configured = Boolean(
  process.env.PYANNOTE_PYTHON &&
  process.env.PYANNOTE_MODEL_PATH &&
  process.env.AMF_REAL_PYANNOTE_TEST_AUDIO,
);

describe("real pyannote provider", () => {
  it.skipIf(!configured)("diarizes a real local audio file without mocks", async () => {
    const python = process.env.PYANNOTE_PYTHON!;
    const model = process.env.PYANNOTE_MODEL_PATH!;
    const audio = process.env.AMF_REAL_PYANNOTE_TEST_AUDIO!;
    await Promise.all([access(python), access(model), access(audio)]);
    const result = await new PyannoteCommunitySpeakerProvider(python, model).analyze(audio);
    expect(result.availability).toBe("available");
    if (result.availability === "available") {
      expect(result.speakerCount).toBeGreaterThan(0);
      expect(result.segments.length).toBeGreaterThan(0);
    }
  }, 600_000);
});
