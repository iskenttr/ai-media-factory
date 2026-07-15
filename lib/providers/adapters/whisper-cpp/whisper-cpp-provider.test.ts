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

  it("returns a stable failure without exposing stderr or input paths", async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "amf-whisper-failure-"));
    const binary = path.join(directory, "secret-whisper-cli");
    const model = path.join(directory, "secret-model.bin");
    const audio = path.join(directory, "secret-audio.wav");
    await Promise.all([writeFile(model, "model"), writeFile(audio, "audio")]);
    await writeFile(binary, "#!/bin/sh\nprintf '%s' 'secret-runtime-detail' >&2\nexit 7\n");
    await chmod(binary, 0o755);

    const error = await new WhisperCppSpeechProvider(binary, model).analyze(audio).catch((reason: unknown) => reason);
    expect(error).toEqual(expect.objectContaining({ code: "provider_failure", message: "speech_provider_failed" }));
    expect(String(error)).not.toContain("secret-runtime-detail");
    expect(String(error)).not.toContain(binary);
    expect(String(error)).not.toContain(model);
    expect(String(error)).not.toContain(audio);
  });

  it("bounds stderr output with a stable speech-provider code", async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "amf-whisper-output-"));
    const binary = path.join(directory, "whisper-cli");
    const model = path.join(directory, "model.bin");
    const audio = path.join(directory, "audio.wav");
    await Promise.all([writeFile(model, "model"), writeFile(audio, "audio")]);
    await writeFile(binary, "#!/bin/sh\nwhile true; do printf '0123456789' >&2; done\n");
    await chmod(binary, 0o755);

    const provider = new WhisperCppSpeechProvider(binary, model, false, {
      timeoutMs: 5_000, killGraceMs: 50, maxOutputBytes: 64,
    });
    await expect(provider.analyze(audio)).rejects.toEqual(expect.objectContaining({
      message: "speech_provider_output_limit_exceeded",
    }));
  });

  it("maps a bounded process timeout to a stable speech-provider error", async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "amf-whisper-timeout-"));
    const binary = path.join(directory, "whisper-cli");
    const model = path.join(directory, "model.bin");
    const audio = path.join(directory, "audio.wav");
    await Promise.all([writeFile(model, "model"), writeFile(audio, "audio")]);
    await writeFile(binary, `#!${process.execPath}
process.on("SIGTERM", () => {});
setInterval(() => {}, 1_000);
`);
    await chmod(binary, 0o755);
    const provider = new WhisperCppSpeechProvider(binary, model, false, {
      timeoutMs: 500, killGraceMs: 100, maxOutputBytes: 128,
    });

    await expect(provider.analyze(audio)).rejects.toEqual(expect.objectContaining({ message: "speech_provider_timeout" }));
  });
});
