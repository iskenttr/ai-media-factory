import path from "node:path";

const projectRoot = process.cwd();

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
  whisperCppBinary: process.env.WHISPER_CPP_BIN,
  whisperModelPath: process.env.WHISPER_MODEL_PATH,
  pyannotePython: process.env.PYANNOTE_PYTHON,
  pyannoteModelPath: process.env.PYANNOTE_MODEL_PATH,
  argosTranslateCommand: process.env.ARGOS_TRANSLATE_COMMAND ?? path.join(projectRoot, "scripts", "argos-translate-docker"),
} as const;

export function uploadDirectory(uploadId: string) {
  return path.join(serverConfig.storageRoot, "uploads", uploadId);
}

export function workDirectory(jobId: string, attempt: number) {
  return path.join(serverConfig.storageRoot, "work", `${jobId}-${attempt}`);
}

export function renderDirectory(renderId: string) {
  return path.join(serverConfig.storageRoot, "renders", renderId);
}
