import { spawn } from "node:child_process";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AnalysisStore } from "./store";

describe("AnalysisStore", () => {
  let directory: string;
  let store: AnalysisStore;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "amf-store-"));
    store = new AnalysisStore(path.join(directory, "events.sqlite"));
  });

  afterEach(async () => {
    vi.useRealTimers();
    store.close();
    await rm(directory, { recursive: true, force: true });
  });

  function createJob() {
    const createdAt = new Date().toISOString();
    store.createUploadSession({
      id: "upload-1",
      ownerHash: "owner-hash",
      uploadTokenHash: "upload-token-hash",
      fileName: "source.mp4",
      declaredSize: 1024,
      declaredMime: "video/mp4",
      createdAt,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    return store.verifyUploadAndCreateJob({
      uploadId: "upload-1",
      sourcePath: path.join(directory, "source.mp4"),
      actualSize: 1024,
      sha256: "a".repeat(64),
      verifiedMime: "video/mp4",
    });
  }

  function createPendingUpload(uploadId = "upload-1") {
    const createdAt = new Date().toISOString();
    store.createUploadSession({
      id: uploadId,
      ownerHash: "owner-hash",
      uploadTokenHash: "upload-token-hash",
      fileName: "source.mp4",
      declaredSize: 1024,
      declaredMime: "video/mp4",
      createdAt,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
  }

  const verification = (uploadId = "upload-1") => ({
    uploadId,
    sourcePath: path.join(directory, "source.mp4"),
    actualSize: 1024,
    sha256: "a".repeat(64),
    verifiedMime: "video/mp4",
  });

  async function waitForFile(filePath: string) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        await access(filePath);
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    throw new Error(`Timed out waiting for ${filePath}`);
  }

  function runVerificationProcess(
    runnerPath: string,
    databasePath: string,
    sourcePath: string,
    readyPath: string,
    gatePath: string,
  ) {
    return new Promise<string>((resolve, reject) => {
      const child = spawn(process.execPath, [
        "--import", "tsx", runnerPath, databasePath, "upload-1", sourcePath, readyPath, gatePath,
      ], { cwd: process.cwd() });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => { stdout += String(chunk); });
      child.stderr.on("data", (chunk) => { stderr += String(chunk); });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve(stdout.trim());
        else reject(new Error(`Verification process exited ${code}: ${stderr}`));
      });
    });
  }

  it("serializes racing verification attempts into one analysis job", async () => {
    createPendingUpload();
    const databasePath = path.join(directory, "events.sqlite");
    const runnerPath = path.join(directory, "verify-runner.ts");
    const gatePath = path.join(directory, "verification-gate");
    const readyPaths = [path.join(directory, "ready-1"), path.join(directory, "ready-2")];
    const storeModuleUrl = pathToFileURL(path.resolve("lib/server/store.ts")).href;
    await writeFile(runnerPath, `
      import { existsSync, writeFileSync } from "node:fs";
      import { AnalysisStore } from ${JSON.stringify(storeModuleUrl)};
      async function main() {
        const [databasePath, uploadId, sourcePath, readyPath, gatePath] = process.argv.slice(2);
        writeFileSync(readyPath, "ready");
        while (!existsSync(gatePath)) await new Promise((resolve) => setTimeout(resolve, 5));
        const store = new AnalysisStore(databasePath);
        try {
          console.log(store.verifyUploadAndCreateJob({
            uploadId, sourcePath, actualSize: 1024, sha256: "a".repeat(64), verifiedMime: "video/mp4",
          }));
        } finally {
          store.close();
        }
      }
      main().catch((error) => { console.error(error); process.exitCode = 1; });
    `);

    const attempts = readyPaths.map((readyPath, index) => runVerificationProcess(
      runnerPath,
      databasePath,
      path.join(directory, `source-${index + 1}.mp4`),
      readyPath,
      gatePath,
    ));
    await Promise.all(readyPaths.map(waitForFile));
    await writeFile(gatePath, "go");

    const [firstJobId, secondJobId] = await Promise.all(attempts);
    expect(firstJobId).toBe(secondJobId);
    expect(store.getUploadSession("upload-1")).toMatchObject({
      status: "verified",
      jobId: firstJobId,
    });
    expect(store.claimNextJob("worker-1", 30_000)?.id).toBe(firstJobId);
    expect(store.claimNextJob("worker-2", 30_000)).toBeNull();
  });

  it("returns the authoritative existing job when upload verification is retried", () => {
    createPendingUpload();
    const firstJobId = store.verifyUploadAndCreateJob(verification());

    const retryJobId = store.verifyUploadAndCreateJob({
      ...verification(),
      sourcePath: path.join(directory, "retry-source.mp4"),
      sha256: "b".repeat(64),
    });

    expect(retryJobId).toBe(firstJobId);
    expect(store.getUploadSession("upload-1")).toMatchObject({
      status: "verified",
      jobId: firstJobId,
      sourcePath: path.join(directory, "source.mp4"),
      sha256: "a".repeat(64),
    });
    expect(store.claimNextJob("worker-1", 30_000)?.id).toBe(firstJobId);
    expect(store.claimNextJob("worker-2", 30_000)).toBeNull();
  });

  it("does not create a job for a failed upload", () => {
    createPendingUpload();
    store.failUpload("upload-1", "unsupported_media");

    expect(() => store.verifyUploadAndCreateJob(verification())).toThrow(
      "Upload session is not pending",
    );
    expect(store.getUploadSession("upload-1")).toMatchObject({
      status: "failed",
      jobId: null,
      errorCode: "unsupported_media",
    });
    expect(store.claimNextJob("worker-1", 30_000)).toBeNull();
  });

  it("does not downgrade a verified upload when a late verification failure arrives", () => {
    createPendingUpload();
    const jobId = store.verifyUploadAndCreateJob(verification());

    store.failUpload("upload-1", "late_retry_failure");

    expect(store.getUploadSession("upload-1")).toMatchObject({
      status: "verified",
      jobId,
      errorCode: null,
    });
  });

  function createReadyVideoRender() {
    const jobId = createJob();
    const languageEvent = store.appendEvent(jobId, 1, "language_detected", {
      availability: "available", language: { code: "en", name: "English" },
    }, `${jobId}:1:language_detected`);
    const transcriptId = store.saveSourceTranscript({
      jobId,
      attempt: 1,
      sourceEventId: languageEvent.eventId,
      speech: {
        transcript: "Hello",
        segments: [{ startSeconds: 0, endSeconds: 2, text: "Hello" }],
        language: { code: "en", name: "English" },
        providerId: "test-provider",
        providerVersion: "1",
      },
    });
    const projectId = store.ensureLocalizationProject(jobId, transcriptId);
    store.completeJob(jobId, "ready");
    store.selectTargetLanguage(projectId, { code: "tr", name: "Turkish" });
    store.prepareLocalizationSetup(projectId);
    const runId = store.createLocalizationRun(projectId);
    const sourceSegmentId = store.getStudioProjectForOwner(jobId, "owner-hash")!.segments[0].id;
    store.saveTranslationProviderResult(runId, {
      availability: "available",
      translatedText: "Merhaba",
      providerVersion: "test-provider-v1",
      sourceSegmentId,
      targetLanguage: { code: "tr", name: "Turkish" },
      translationNotes: [],
      timingAssessment: {
        originalDurationMs: 2000,
        translatedCharacterCount: 7,
        translatedWordCount: 1,
        estimatedSpeakingDurationMs: 430,
        status: "fits",
        methodVersion: "test",
        reason: "Fits",
      },
      failureReason: null,
      provenance: { contextSnapshotId: "snapshot", inputFingerprint: "input", resultFingerprint: "result" },
    });
    store.finishLocalizationRun(runId, "completed");
    return store.queueVideoRender(runId, "owner-hash")!;
  }

  it("persists ordered events idempotently", () => {
    const jobId = createJob();
    const first = store.appendEvent(
      jobId,
      1,
      "upload_received",
      {
        fileName: "source.mp4",
        sizeBytes: 1024,
        mimeType: "video/mp4",
        sha256: "a".repeat(64),
      },
      `${jobId}:1:upload_received`,
    );
    const duplicate = store.appendEvent(
      jobId,
      1,
      "upload_received",
      {
        fileName: "source.mp4",
        sizeBytes: 1024,
        mimeType: "video/mp4",
        sha256: "a".repeat(64),
      },
      `${jobId}:1:upload_received`,
    );
    const second = store.appendEvent(
      jobId,
      1,
      "language_detected",
      { availability: "unavailable", reason: "model_not_configured" },
      `${jobId}:1:language_detected`,
    );

    expect(duplicate.eventId).toBe(first.eventId);
    expect(second.sequence).toBe(first.sequence + 1);
    expect(store.listEvents(jobId).map((event) => event.type)).toEqual([
      "upload_received",
      "language_detected",
    ]);
    expect(store.listEvents(jobId, first.eventId).map((event) => event.eventId)).toEqual([
      second.eventId,
    ]);
  });

  it("creates an isolated new attempt when a job is retried", () => {
    const jobId = createJob();
    store.failJob(jobId, "provider_unavailable");

    expect(store.retryJob(jobId, "owner-hash")).toBe(true);
    const claimed = store.claimNextJob("worker-2", 30_000);
    expect(claimed).toMatchObject({ id: jobId, attempt: 2, status: "running" });
  });

  it("recovers a running job after its worker lease expires", async () => {
    const jobId = createJob();
    expect(store.claimNextJob("worker-1", 1)).toMatchObject({ id: jobId });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(store.claimNextJob("worker-2", 30_000)).toMatchObject({
      id: jobId,
      status: "running",
    });
  });

  it("renews and completes a video render only for its lease owner", () => {
    const renderId = createReadyVideoRender();
    expect(store.claimNextVideoRender("render-worker-1", 30_000)).toMatchObject({ id: renderId });
    expect(store.renewVideoRenderLease(renderId, "render-worker-1", 30_000)).toBe(true);
    expect(store.finishVideoRender(renderId, "render-worker-2")).toBe(false);
    expect(store.finishVideoRender(renderId, "render-worker-1")).toBe(true);
    expect(store.renewVideoRenderLease(renderId, "render-worker-1", 30_000)).toBe(false);
    expect(store.getVideoRenderForOwner(renderId, "owner-hash")).toMatchObject({ status: "completed" });
  });

  it("fails a video render only for its lease owner", () => {
    const renderId = createReadyVideoRender();
    expect(store.claimNextVideoRender("render-worker-1", 30_000)).toMatchObject({ id: renderId });
    expect(store.failVideoRender(renderId, "render-worker-2", "foreign_failure")).toBe(false);
    expect(store.failVideoRender(renderId, "render-worker-1", "render_failed")).toBe(true);
    expect(store.finishVideoRender(renderId, "render-worker-1")).toBe(false);
    expect(store.getVideoRenderForOwner(renderId, "owner-hash")).toMatchObject({ status: "failed", failureReason: "render_failed" });
  });

  it("rejects stale video render ownership after the lease is reclaimed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const renderId = createReadyVideoRender();
    expect(store.claimNextVideoRender("stale-worker", 1)).toMatchObject({ id: renderId });
    vi.setSystemTime(new Date("2026-01-01T00:00:00.002Z"));
    expect(store.claimNextVideoRender("current-worker", 30_000)).toMatchObject({ id: renderId });
    expect(store.renewVideoRenderLease(renderId, "stale-worker", 30_000)).toBe(false);
    expect(store.finishVideoRender(renderId, "stale-worker")).toBe(false);
    expect(store.failVideoRender(renderId, "stale-worker", "stale_failure")).toBe(false);
    expect(store.finishVideoRender(renderId, "current-worker")).toBe(true);
  });

  it("returns no video render when the queue is empty", () => {
    expect(store.claimNextVideoRender("render-worker", 30_000)).toBeNull();
  });

  it("keeps the source transcript immutable while applying versioned user corrections", () => {
    const jobId = createJob();
    const languageEvent = store.appendEvent(jobId, 1, "language_detected", {
      availability: "available", language: { code: "en", name: "English" },
    }, `${jobId}:1:language_detected`);
    const transcriptId = store.saveSourceTranscript({
      jobId,
      attempt: 1,
      sourceEventId: languageEvent.eventId,
      speech: {
        transcript: "Original line",
        segments: [{ startSeconds: 1, endSeconds: 3, text: "Original line" }],
        language: { code: "en", name: "English" },
        providerId: "test-provider",
        providerVersion: "1",
      },
      speakerSegments: [{ speakerId: "speaker_2", start: 0, end: 4 }],
    });
    const projectId = store.ensureLocalizationProject(jobId, transcriptId);
    store.completeJob(jobId, "ready");
    const initial = store.getStudioProjectForOwner(jobId, "owner-hash");
    expect(initial?.segments[0]).toMatchObject({ originalText: "Original line", speakerId: "speaker_2", correctionVersion: 0 });

    const segmentId = initial!.segments[0].id;
    expect(store.saveTranscriptCorrection(projectId, segmentId, { text: "Corrected line" })).toBe(1);
    expect(store.saveTranscriptCorrection(projectId, segmentId, { startMs: 1200 })).toBe(2);
    store.selectTargetLanguage(projectId, { code: "es", name: "Spanish" });

    const corrected = store.getStudioProjectForOwner(jobId, "owner-hash");
    expect(corrected?.segments[0]).toMatchObject({ originalText: "Corrected line", startMs: 1200, speakerId: "speaker_2", correctionVersion: 2 });
    expect(corrected?.targetLanguage).toEqual({ code: "es", name: "Spanish" });
  });

  it("keeps user localized edits active when a segment is regenerated", () => {
    const jobId = createJob();
    const languageEvent = store.appendEvent(jobId, 1, "language_detected", {
      availability: "available", language: { code: "en", name: "English" },
    }, `${jobId}:1:language_detected`);
    const transcriptId = store.saveSourceTranscript({
      jobId,
      attempt: 1,
      sourceEventId: languageEvent.eventId,
      speech: {
        transcript: "Hello there",
        segments: [{ startSeconds: 0, endSeconds: 2, text: "Hello there" }],
        language: { code: "en", name: "English" },
        providerId: "test-provider",
        providerVersion: "1",
      },
      speakerSegments: [{ speakerId: "speaker_1", start: 0, end: 2 }],
    });
    const projectId = store.ensureLocalizationProject(jobId, transcriptId);
    store.completeJob(jobId, "ready");
    store.selectTargetLanguage(projectId, { code: "tr", name: "Turkish" });
    store.prepareLocalizationSetup(projectId);
    const runId = store.createLocalizationRun(projectId);
    const sourceSegmentId = store.getStudioProjectForOwner(jobId, "owner-hash")!.segments[0].id;
    const providerResult = {
      availability: "available" as const,
      translatedText: "Merhaba",
      providerVersion: "test-provider-v1",
      sourceSegmentId,
      targetLanguage: { code: "tr", name: "Turkish" },
      translationNotes: [],
      timingAssessment: {
        originalDurationMs: 2000,
        translatedCharacterCount: 7,
        translatedWordCount: 1,
        estimatedSpeakingDurationMs: 430,
        status: "fits" as const,
        methodVersion: "test",
        reason: "Fits",
      },
      failureReason: null,
      provenance: { contextSnapshotId: "snapshot", inputFingerprint: "input", resultFingerprint: "result" },
    };
    expect(store.saveTranslationProviderResult(runId, providerResult)).toMatchObject({ status: "translated", revision: 1 });
    expect(store.saveLocalizedSegmentUserRevision(runId, sourceSegmentId, "owner-hash", "Kullanıcı metni")).toMatchObject({ revision: 2 });
    const job = store.queueTranslationRegeneration(runId, sourceSegmentId, "owner-hash");
    expect(job).toEqual(expect.any(String));
    expect(store.claimNextTranslationRegenerationJob("worker", 30_000)).toMatchObject({ id: job, runId, sourceSegmentId });
    expect(store.saveTranslationRegenerationResult(job!, { ...providerResult, translatedText: "Merhaba orada" })).toMatchObject({
      status: "completed",
      revision: 3,
      activeRevisionPreserved: true,
    });
    const run = store.getLocalizationRunForOwner(runId, "owner-hash");
    expect(run?.segments[0]).toMatchObject({ translatedText: "Kullanıcı metni", revision: 2, revisionOrigin: "user", revisionCount: 3 });
    const revisions = store.listTranslationRevisionsForOwner(runId, sourceSegmentId, "owner-hash");
    expect(revisions?.map((revision) => revision.version)).toEqual([3, 2, 1]);
    expect(revisions?.find((revision) => revision.isActive)).toMatchObject({ version: 2, translatedText: "Kullanıcı metni" });
  });
});
