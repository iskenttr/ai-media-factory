import { spawn } from "node:child_process";

export type ProviderProcessErrorPrefix = "speech_provider" | "translation_provider";
type ProviderProcessErrorSuffix = "failed" | "input_failed" | "output_limit_exceeded" | "spawn_failed" | "timeout";
export type ProviderProcessErrorCode = `${ProviderProcessErrorPrefix}_${ProviderProcessErrorSuffix}`;

export class ProviderProcessError extends Error {
  constructor(readonly code: ProviderProcessErrorCode) {
    super(code);
    this.name = "ProviderProcessError";
  }
}

export interface ProviderProcessOptions {
  timeoutMs: number;
  killGraceMs: number;
  maxOutputBytes: number;
  errorPrefix?: ProviderProcessErrorPrefix;
  inputMode?: "ignore" | "json";
}

function appendBounded(chunks: Buffer[], chunk: Buffer | string, currentBytes: number, maximumBytes: number) {
  const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  const remaining = Math.max(0, maximumBytes - currentBytes);
  if (remaining > 0) chunks.push(bytes.subarray(0, remaining));
  return { bytes: currentBytes + Math.min(bytes.length, remaining), exceeded: bytes.length > remaining };
}

export function runBoundedProviderProcess(
  command: string,
  args: string[],
  input: unknown,
  options: ProviderProcessOptions,
) {
  const errorPrefix = options.errorPrefix ?? "translation_provider";
  const inputMode = options.inputMode ?? "json";
  const errorCode = (suffix: ProviderProcessErrorSuffix): ProviderProcessErrorCode => `${errorPrefix}_${suffix}`;
  let serializedInput: string | undefined;
  if (inputMode === "json") {
    try {
      const encoded = JSON.stringify(input);
      if (typeof encoded !== "string") throw new Error("input_not_serializable");
      serializedInput = encoded;
    } catch {
      return Promise.reject(new ProviderProcessError(errorCode("input_failed")));
    }
  }

  return new Promise<string>((resolve, reject) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(command, args, { stdio: [inputMode === "json" ? "pipe" : "ignore", "pipe", "pipe"] });
    } catch {
      reject(new ProviderProcessError(errorCode("spawn_failed")));
      return;
    }
    const stdin = child.stdin;
    const stdout = child.stdout;
    const stderr = child.stderr;
    if ((inputMode === "json" && !stdin) || !stdout || !stderr) {
      child.kill("SIGKILL");
      reject(new ProviderProcessError(errorCode("spawn_failed")));
      return;
    }
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let failureCode: ProviderProcessErrorCode | null = null;
    let settled = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);
      stdin?.off("error", onInputError);
      stdout.off("data", onStdout);
      stderr.off("data", onStderr);
      child.off("error", onError);
      child.off("close", onClose);
    };
    const finish = (error?: ProviderProcessError) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(Buffer.concat(stdoutChunks).toString("utf8"));
    };
    const stop = (code: ProviderProcessErrorCode) => {
      if (failureCode || settled) return;
      failureCode = code;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        if (!settled) child.kill("SIGKILL");
      }, options.killGraceMs);
      killTimer.unref();
    };
    function onInputError() {
      stop(errorCode("input_failed"));
    }
    function onStdout(chunk: Buffer) {
      const result = appendBounded(stdoutChunks, chunk, stdoutBytes, options.maxOutputBytes);
      stdoutBytes = result.bytes;
      if (result.exceeded) stop(errorCode("output_limit_exceeded"));
    }
    function onStderr(chunk: Buffer) {
      const result = appendBounded(stderrChunks, chunk, stderrBytes, options.maxOutputBytes);
      stderrBytes = result.bytes;
      if (result.exceeded) stop(errorCode("output_limit_exceeded"));
    }
    function onError() {
      finish(new ProviderProcessError(errorCode("spawn_failed")));
    }
    function onClose(code: number | null) {
      if (failureCode) finish(new ProviderProcessError(failureCode));
      else if (code !== 0) finish(new ProviderProcessError(errorCode("failed")));
      else finish();
    }

    stdin?.on("error", onInputError);
    stdout.on("data", onStdout);
    stderr.on("data", onStderr);
    child.on("error", onError);
    child.on("close", onClose);
    const timeoutTimer = setTimeout(() => stop(errorCode("timeout")), options.timeoutMs);
    timeoutTimer.unref();
    if (inputMode === "json") stdin?.end(serializedInput);
  });
}
