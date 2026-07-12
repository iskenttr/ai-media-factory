import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { SpeechAnalysisProvider } from "../../contracts/speech-analysis-provider";
import { WhisperCppSpeechProvider } from "./whisper-cpp-provider";

function contract(provider: SpeechAnalysisProvider, audioPath: string) {
  return provider.analyze(audioPath).then((result) => {
    expect(result.transcript).toBe("Hello world");
    expect(result.language).toEqual({ code: "en", name: "English" });
    expect(result.segments).toEqual([{ startSeconds: 0, endSeconds: 1.2, text: "Hello world" }]);
  });
}

describe("WhisperCppSpeechProvider", () => {
  let directory: string | undefined;

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it("satisfies the speech provider contract using whisper.cpp JSON", async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "amf-whisper-"));
    const binary = path.join(directory, "whisper-cli");
    const model = path.join(directory, "model.bin");
    const audio = path.join(directory, "audio.wav");
    await Promise.all([writeFile(model, "model"), writeFile(audio, "audio")]);
    await writeFile(binary, `#!/bin/sh
while [ "$#" -gt 0 ]; do
  if [ "$1" = "-of" ]; then shift; output="$1"; fi
  shift
done
printf '%s' '{"result":{"language":"en"},"transcription":[{"text":" Hello world ","offsets":{"from":0,"to":1200}}]}' > "$output.json"
`);
    await chmod(binary, 0o755);

    await contract(new WhisperCppSpeechProvider(binary, model), audio);
  });

  it("preserves full-json word timestamps for forced alignment", async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "amf-whisper-words-"));
    const binary = path.join(directory, "whisper-cli");
    const model = path.join(directory, "model.bin");
    const audio = path.join(directory, "audio.wav");
    await Promise.all([writeFile(model, "model"), writeFile(audio, "audio")]);
    await writeFile(binary, `#!/bin/sh
while [ "$#" -gt 0 ]; do if [ "$1" = "-of" ]; then shift; output="$1"; fi; shift; done
printf '%s' '{"result":{"language":"en"},"transcription":[{"text":" Hello world","offsets":{"from":0,"to":1200},"tokens":[{"text":"[_BEG_]","offsets":{"from":0,"to":0}},{"text":" Hello","offsets":{"from":100,"to":500},"p":0.9},{"text":" world","offsets":{"from":600,"to":1100},"p":0.8}]}]}' > "$output.json"
`);
    await chmod(binary, 0o755);
    const result = await new WhisperCppSpeechProvider(binary, model).analyze(audio);
    expect(result.segments[0].words).toEqual([
      { text: "Hello", startSeconds: 0.1, endSeconds: 0.5, probability: 0.9 },
      { text: "world", startSeconds: 0.6, endSeconds: 1.1, probability: 0.8 },
    ]);
  });
});
