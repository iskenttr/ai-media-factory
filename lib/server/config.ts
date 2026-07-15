import path from "node:path";

const projectRoot = process.cwd();

function positiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const serverConfig = {
  storageRoot: process.env.AMF_STORAGE_DIR ?? path.join(projectRoot, "storage"),
  databasePath:
    process.env.AMF_DATABASE_PATH ?? path.join(projectRoot, "storage", "ai-media-factory.sqlite"),
  maxUploadBytes: Number(process.env.AMF_MAX_UPLOAD_BYTES ?? 2 * 1024 * 1024 * 1024),
  uploadSessionTtlMs: 60 * 60 * 1000,
  workerLeaseMs: 5 * 60 * 1000,
  workerPollMs: 500,
  ssePollMs: 350,
  sseHeartbeatMs: 15_000,
  mediaProbeTimeoutMs: positiveNumber(process.env.AMF_MEDIA_PROBE_TIMEOUT_MS, 30_000),
  mediaFfmpegTimeoutMs: positiveNumber(process.env.AMF_MEDIA_FFMPEG_TIMEOUT_MS, 30 * 60_000),
  mediaFrameTimeoutMs: positiveNumber(process.env.AMF_MEDIA_FRAME_TIMEOUT_MS, 2 * 60_000),
  mediaProcessKillGraceMs: positiveNumber(process.env.AMF_MEDIA_PROCESS_KILL_GRACE_MS, 2_000),
  mediaProcessMaxOutputBytes: positiveNumber(process.env.AMF_MEDIA_PROCESS_MAX_OUTPUT_BYTES, 4 * 1024 * 1024),
  argosProcessTimeoutMs: positiveNumber(process.env.AMF_ARGOS_PROCESS_TIMEOUT_MS, 2 * 60_000),
  argosProcessKillGraceMs: positiveNumber(process.env.AMF_ARGOS_PROCESS_KILL_GRACE_MS, 2_000),
  argosProcessMaxOutputBytes: positiveNumber(process.env.AMF_ARGOS_PROCESS_MAX_OUTPUT_BYTES, 1024 * 1024),
  whisperProcessTimeoutMs: positiveNumber(process.env.AMF_WHISPER_PROCESS_TIMEOUT_MS, 60 * 60_000),
  whisperProcessKillGraceMs: positiveNumber(process.env.AMF_WHISPER_PROCESS_KILL_GRACE_MS, 2_000),
  whisperProcessMaxOutputBytes: positiveNumber(process.env.AMF_WHISPER_PROCESS_MAX_OUTPUT_BYTES, 4 * 1024 * 1024),
  whisperCppBinary: process.env.WHISPER_CPP_BIN,
  whisperModelPath: process.env.WHISPER_MODEL_PATH,
  pyannotePython: process.env.PYANNOTE_PYTHON,
  pyannoteModelPath: process.env.PYANNOTE_MODEL_PATH,
  argosTranslateCommand: process.env.ARGOS_TRANSLATE_COMMAND ?? path.join(projectRoot, "scripts", "argos-translate-docker"),
} as const;

export function uploadDirectory(uploadId: string) {
  return path.join(serverConfig.storageRoot, "uploads", uploadId);
}

const safeWorkPathSegment = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function workDirectory(jobId: string, attempt: number, executionToken: string) {
  if (!safeWorkPathSegment.test(jobId) || !safeWorkPathSegment.test(executionToken)) {
    throw new Error("invalid_work_directory_segment");
  }
  if (!Number.isSafeInteger(attempt) || attempt < 1) {
    throw new Error("invalid_work_directory_attempt");
  }
  return path.join(serverConfig.storageRoot, "work", `${jobId}-${attempt}`, executionToken);
}

export function renderDirectory(renderId: string) {
  return path.join(serverConfig.storageRoot, "renders", renderId);
}
