import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { PyannoteCommunitySpeakerProvider } from "./pyannote-speaker-provider";

describe("PyannoteCommunitySpeakerProvider contract", () => {
  let directory: string | undefined;

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  async function providerFor(payload: unknown) {
    directory = await mkdtemp(path.join(os.tmpdir(), "amf-pyannote-contract-"));
    const runner = path.join(directory, "runner.sh");
    const model = path.join(directory, "model");
    const audio = path.join(directory, "audio.wav");
    await Promise.all([writeFile(model, "model"), writeFile(audio, "audio")]);
    await writeFile(runner, `#!/bin/sh\nprintf '%s' '${JSON.stringify(payload)}'\n`);
    await chmod(runner, 0o755);
    return { provider: new PyannoteCommunitySpeakerProvider("/bin/sh", model, runner), audio };
  }

  it("normalizes a real single-speaker diarization response", async () => {
    const { provider, audio } = await providerFor({
      providerVersion: "community-1",
      segments: [{ speaker: "SPEAKER_00", start: 0.2, end: 4.8 }],
    });
    await expect(provider.analyze(audio)).resolves.toMatchObject({
      availability: "available",
      speakerCount: 1,
      segments: [{ speakerId: "speaker_1", start: 0.2, end: 4.8 }],
    });
  });

  it("anonymizes and preserves multi-speaker timestamps", async () => {
    const { provider, audio } = await providerFor({
      providerVersion: "community-1",
      segments: [
        { speaker: "B", start: 2, end: 4 },
        { speaker: "A", start: 0, end: 2 },
        { speaker: "A", start: 4, end: 5 },
      ],
    });
    const result = await provider.analyze(audio);
    expect(result.availability).toBe("available");
    if (result.availability === "available") {
      expect(result.speakerCount).toBe(2);
      expect(result.segments.map((segment) => segment.speakerId)).toEqual([
        "speaker_2", "speaker_1", "speaker_1",
      ]);
    }
  });

  it("rejects silence instead of fabricating a speaker", async () => {
    const { provider, audio } = await providerFor({ providerVersion: "community-1", segments: [] });
    await expect(provider.analyze(audio)).rejects.toMatchObject({
      code: "insufficient_speech",
    });
  });
});
