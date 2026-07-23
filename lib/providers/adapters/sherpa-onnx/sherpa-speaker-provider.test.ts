// @vitest-environment node
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SherpaOnnxSpeakerProvider } from "./sherpa-speaker-provider";

describe("SherpaOnnxSpeakerProvider", () => {
  let directory: string | undefined;

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  async function providerFor(payload: unknown) {
    directory = await mkdtemp(path.join(os.tmpdir(), "amf-sherpa-contract-"));
    const runner = path.join(directory, "runner.sh");
    const segmentation = path.join(directory, "segmentation.onnx");
    const embedding = path.join(directory, "embedding.onnx");
    const audio = path.join(directory, "audio.wav");
    await Promise.all([
      writeFile(segmentation, "model"),
      writeFile(embedding, "model"),
      writeFile(audio, "audio"),
    ]);
    await writeFile(runner, `#!/bin/sh\nprintf '%s' '${JSON.stringify(payload)}'\n`);
    await chmod(runner, 0o755);
    return {
      provider: new SherpaOnnxSpeakerProvider("/bin/sh", segmentation, embedding, runner),
      audio,
    };
  }

  it("anonymizes speakers by first appearance and sorts timestamps", async () => {
    const { provider, audio } = await providerFor({
      providerVersion: "sherpa-test",
      segments: [
        { speaker: 9, start: 2, end: 4 },
        { speaker: 4, start: 0, end: 2 },
        { speaker: 4, start: 4, end: 5 },
      ],
    });
    await expect(provider.analyze(audio)).resolves.toMatchObject({
      availability: "available",
      speakerCount: 2,
      segments: [
        { speakerId: "speaker_1", start: 0, end: 2 },
        { speakerId: "speaker_2", start: 2, end: 4 },
        { speakerId: "speaker_1", start: 4, end: 5 },
      ],
    });
  });

  it("fails closed on empty evidence", async () => {
    const { provider, audio } = await providerFor({
      providerVersion: "sherpa-test",
      segments: [],
    });
    await expect(provider.analyze(audio)).rejects.toMatchObject({
      code: "insufficient_speech",
    });
  });
});
