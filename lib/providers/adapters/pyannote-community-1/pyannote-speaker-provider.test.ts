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

  it("returns a stable failure without exposing stderr or command paths", async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "amf-pyannote-failure-"));
    const runner = path.join(directory, "secret-runner.sh");
    const model = path.join(directory, "secret-model");
    const audio = path.join(directory, "secret-audio.wav");
    await Promise.all([writeFile(model, "model"), writeFile(audio, "audio")]);
    await writeFile(runner, "#!/bin/sh\nprintf '%s' 'secret-runtime-detail' >&2\nexit 8\n");
    await chmod(runner, 0o755);

    const error = await new PyannoteCommunitySpeakerProvider("/bin/sh", model, runner).analyze(audio).catch((reason: unknown) => reason);
    expect(error).toEqual(expect.objectContaining({ code: "provider_failure", message: "speaker_provider_failed" }));
    expect(String(error)).not.toContain("secret-runtime-detail");
    expect(String(error)).not.toContain(runner);
    expect(String(error)).not.toContain(model);
    expect(String(error)).not.toContain(audio);
  });

  it("bounds provider output with a stable speaker-provider code", async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "amf-pyannote-output-"));
    const runner = path.join(directory, "runner.sh");
    const model = path.join(directory, "model");
    const audio = path.join(directory, "audio.wav");
    await Promise.all([writeFile(model, "model"), writeFile(audio, "audio")]);
    await writeFile(runner, "#!/bin/sh\nwhile true; do printf '0123456789' >&2; done\n");
    await chmod(runner, 0o755);
    const provider = new PyannoteCommunitySpeakerProvider("/bin/sh", model, runner, {
      timeoutMs: 5_000, killGraceMs: 50, maxOutputBytes: 64,
    });

    await expect(provider.analyze(audio)).rejects.toEqual(expect.objectContaining({
      message: "speaker_provider_output_limit_exceeded",
    }));
  });

  it("maps a bounded timeout to a stable speaker-provider error", async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "amf-pyannote-timeout-"));
    const runner = path.join(directory, "runner.js");
    const model = path.join(directory, "model");
    const audio = path.join(directory, "audio.wav");
    await Promise.all([writeFile(model, "model"), writeFile(audio, "audio")]);
    await writeFile(runner, "process.on('SIGTERM',()=>{}); setInterval(()=>{},1000);\n");
    const provider = new PyannoteCommunitySpeakerProvider(process.execPath, model, runner, {
      timeoutMs: 500, killGraceMs: 100, maxOutputBytes: 128,
    });

    await expect(provider.analyze(audio)).rejects.toEqual(expect.objectContaining({
      message: "speaker_provider_timeout",
    }));
  });

  it("does not expose runner-supplied error text from an invalid response", async () => {
    const { provider, audio } = await providerFor({ error: "secret-model-detail" });
    const error = await provider.analyze(audio).catch((reason: unknown) => reason);

    expect(error).toEqual(expect.objectContaining({ message: "speaker_provider_invalid_response" }));
    expect(String(error)).not.toContain("secret-model-detail");
  });
});
