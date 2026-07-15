import { spawn } from "node:child_process";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProviderRegistry } from "@/lib/providers/provider-registry";

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
    for (let attempt = 0; attempt < 1_000; attempt += 1) {
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

  function runTranslationProcess(
    runnerPath: string,
    databasePath: string,
    runId: string,
    inputPath: string,
    readyPath: string,
    gatePath: string,
  ) {
    return new Promise<string>((resolve, reject) => {
      const child = spawn(process.execPath, [
        "--import", "tsx", runnerPath, databasePath, runId, inputPath, readyPath, gatePath,
      ], { cwd: process.cwd() });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => { stdout += String(chunk); });
      child.stderr.on("data", (chunk) => { stderr += String(chunk); });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve(stdout.trim());
        else reject(new Error(`Translation process exited ${code}: ${stderr}`));
      });
    });
  }

  function runRegenerationQueueProcess(
    runnerPath: string,
    databasePath: string,
    runId: string,
    sourceSegmentId: string,
    readyPath: string,
    gatePath: string,
  ) {
    return new Promise<string>((resolve, reject) => {
      const child = spawn(process.execPath, [
        "--import", "tsx", runnerPath, databasePath, runId, sourceSegmentId, readyPath, gatePath,
      ], { cwd: process.cwd() });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => { stdout += String(chunk); });
      child.stderr.on("data", (chunk) => { stderr += String(chunk); });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve(stdout.trim());
        else reject(new Error(`Regeneration queue process exited ${code}: ${stderr}`));
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
    expect(store.claimNextJob("analysis-worker", 30_000)).toMatchObject({ id: jobId });
    expect(store.completeJob(jobId, "analysis-worker", "ready")).toBe(true);
    store.selectTargetLanguage(projectId, { code: "tr", name: "Turkish" });
    store.prepareLocalizationSetup(projectId);
    const runId = store.createLocalizationRun(projectId);
    expect(store.claimNextLocalizationRun("localization-worker", 30_000)).toMatchObject({ id: runId });
    const sourceSegmentId = store.getStudioProjectForOwner(jobId, "owner-hash")!.segments[0].id;
    store.saveTranslationProviderResult(runId, "localization-worker", {
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
    store.finishLocalizationRun(runId, "localization-worker", "completed");
    return store.queueVideoRender(runId, "owner-hash")!;
  }

  function createPendingLocalization() {
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
    expect(store.claimNextJob("analysis-worker", 30_000)).toMatchObject({ id: jobId });
    expect(store.completeJob(jobId, "analysis-worker", "ready")).toBe(true);
    store.selectTargetLanguage(projectId, { code: "tr", name: "Turkish" });
    store.prepareLocalizationSetup(projectId);
    const runId = store.createLocalizationRun(projectId);
    expect(store.claimNextLocalizationRun("localization-worker", 30_000)).toMatchObject({ id: runId });
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
    return { jobId, runId, sourceSegmentId, providerResult };
  }

  it("uses bounded sequence cursors for analysis and localization event streams", () => {
    const { jobId, runId } = createPendingLocalization();
    store.appendEvent(jobId, 1, "pacing_analysis_completed", {
      availability: "unavailable", reason: "model_not_configured",
    }, `${jobId}:1:test-pacing`);
    const analysisEvents = store.listEvents(jobId);
    const analysisCursor = analysisEvents[0].sequence;
    expect(store.analysisEventSequence(jobId, analysisEvents[0].eventId)).toBe(analysisCursor);
    expect(store.listEventsAfterSequence(jobId, analysisCursor, 1, 1)).toHaveLength(1);
    expect(store.analysisEventSequence(jobId, "unknown-event")).toBe(0);

    const created = store.listLocalizationEvents(runId)[0];
    store.appendLocalizationEvent(runId, "translation_segment_completed", { sourceSegmentId: "segment-1" }, `${runId}:test-completed`);
    store.appendLocalizationEvent(runId, "localization_run_completed", { translatedCount: 1 }, `${runId}:test-run-completed`);
    expect(store.localizationRunBelongsToOwner(runId, "owner-hash")).toBe(true);
    expect(store.localizationRunBelongsToOwner(runId, "another-owner")).toBe(false);
    expect(store.localizationEventSequence(runId, created.eventId)).toBe(created.sequence);
    const firstBatch = store.listLocalizationEventsAfterSequence(runId, created.sequence, 1);
    expect(firstBatch).toHaveLength(1);
    expect(firstBatch[0].sequence).toBe(created.sequence + 1);
    expect(store.listLocalizationEventsAfterSequence(runId, firstBatch[0].sequence, 1)[0].sequence)
      .toBe(created.sequence + 2);
    expect(store.localizationEventSequence(runId, "unknown-event")).toBe(0);
  });

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
    expect(store.claimNextJob("worker-1", 30_000)).toMatchObject({ id: jobId });
    expect(store.failJob(jobId, "worker-1", "provider_unavailable")).toBe(true);

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

  it("completes and fails an analysis job only for its lease owner", () => {
    const jobId = createJob();
    expect(store.claimNextJob("worker-1", 30_000)).toMatchObject({ id: jobId });
    expect(store.completeJob(jobId, "worker-2", "ready")).toBe(false);
    expect(store.failJob(jobId, "worker-2", "foreign_failure")).toBe(false);
    expect(store.completeJob(jobId, "worker-1", "ready")).toBe(true);
    expect(store.failJob(jobId, "worker-1", "late_failure")).toBe(false);
    expect(store.getJobForOwner(jobId, "owner-hash")).toMatchObject({
      status: "completed",
      readiness: "ready",
    });
  });

  it("rejects stale analysis ownership after the lease is reclaimed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const jobId = createJob();
    expect(store.claimNextJob("stale-worker", 1)).toMatchObject({ id: jobId });
    vi.setSystemTime(new Date("2026-01-01T00:00:00.002Z"));
    expect(store.claimNextJob("current-worker", 30_000)).toMatchObject({ id: jobId });
    expect(store.renewLease(jobId, "stale-worker", 30_000)).toBe(false);
    expect(store.completeJob(jobId, "stale-worker", "ready")).toBe(false);
    expect(store.failJob(jobId, "stale-worker", "stale_failure")).toBe(false);
    expect(store.failJob(jobId, "current-worker", "current_failure")).toBe(true);
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

  it("heals a legacy provider result whose segment activation was interrupted", () => {
    const { runId, sourceSegmentId, providerResult } = createPendingLocalization();
    const database = new DatabaseSync(path.join(directory, "events.sqlite"));
    database.prepare(`
      INSERT INTO translation_provider_results (id, run_id, source_segment_id, availability, result_json, created_at)
      VALUES ('legacy-result', ?, ?, 'available', ?, ?)
    `).run(runId, sourceSegmentId, JSON.stringify(providerResult), new Date().toISOString());
    database.close();

    expect(store.saveTranslationProviderResult(runId, "localization-worker", providerResult)).toEqual({ status: "translated", revision: 1 });
    expect(store.getLocalizationRunForOwner(runId, "owner-hash")?.segments[0]).toMatchObject({
      status: "translated",
      translatedText: "Merhaba",
      revision: 1,
      revisionOrigin: "provider",
    });
  });

  it("serializes two-store provider result attempts into one result and one provider revision", async () => {
    const { runId, providerResult } = createPendingLocalization();
    const databasePath = path.join(directory, "events.sqlite");
    const runnerPath = path.join(directory, "translation-runner.ts");
    const inputPath = path.join(directory, "translation-result.json");
    const gatePath = path.join(directory, "translation-gate");
    const readyPaths = [path.join(directory, "translation-ready-1"), path.join(directory, "translation-ready-2")];
    const storeModuleUrl = pathToFileURL(path.resolve("lib/server/store.ts")).href;
    await writeFile(inputPath, JSON.stringify(providerResult));
    await writeFile(runnerPath, `
      import { existsSync, readFileSync, writeFileSync } from "node:fs";
      import { AnalysisStore } from ${JSON.stringify(storeModuleUrl)};
      async function main() {
        const [databasePath, runId, inputPath, readyPath, gatePath] = process.argv.slice(2);
        writeFileSync(readyPath, "ready");
        while (!existsSync(gatePath)) await new Promise((resolve) => setTimeout(resolve, 5));
        const store = new AnalysisStore(databasePath);
        try {
          console.log(JSON.stringify(store.saveTranslationProviderResult(runId, "localization-worker", JSON.parse(readFileSync(inputPath, "utf8")))));
        } finally {
          store.close();
        }
      }
      main().catch((error) => { console.error(error); process.exitCode = 1; });
    `);
    const attempts = readyPaths.map((readyPath) => runTranslationProcess(
      runnerPath, databasePath, runId, inputPath, readyPath, gatePath,
    ));
    await Promise.all(readyPaths.map(waitForFile));
    await writeFile(gatePath, "go");

    expect(await Promise.all(attempts)).toEqual([
      JSON.stringify({ status: "translated", revision: 1 }),
      JSON.stringify({ status: "translated", revision: 1 }),
    ]);
    const database = new DatabaseSync(databasePath);
    expect(database.prepare(`SELECT COUNT(*) AS count FROM translation_provider_results WHERE run_id = ?`).get(runId)).toMatchObject({ count: 1 });
    expect(database.prepare(`SELECT COUNT(*) AS count FROM translation_revisions WHERE origin = 'provider'`).get()).toMatchObject({ count: 1 });
    expect(database.prepare(`
      SELECT COUNT(*) AS count FROM localized_segments ls
      JOIN localized_transcripts lt ON lt.id = ls.localized_transcript_id
      JOIN translation_revisions tr ON tr.id = ls.active_revision_id
      WHERE lt.run_id = ? AND tr.origin = 'provider'
    `).get(runId)).toMatchObject({ count: 1 });
    database.close();
  });

  it("rolls back the provider result and revision when segment activation fails", () => {
    const { runId, providerResult } = createPendingLocalization();
    const databasePath = path.join(directory, "events.sqlite");
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TRIGGER inject_translation_activation_failure
      BEFORE UPDATE ON localized_segments
      WHEN NEW.status = 'translated'
      BEGIN
        SELECT RAISE(ABORT, 'injected_translation_activation_failure');
      END;
    `);
    database.close();

    expect(() => store.saveTranslationProviderResult(runId, "localization-worker", providerResult)).toThrow("injected_translation_activation_failure");
    const inspection = new DatabaseSync(databasePath);
    expect(inspection.prepare(`SELECT COUNT(*) AS count FROM translation_provider_results WHERE run_id = ?`).get(runId)).toMatchObject({ count: 0 });
    expect(inspection.prepare(`SELECT COUNT(*) AS count FROM translation_revisions WHERE origin = 'provider'`).get()).toMatchObject({ count: 0 });
    expect(inspection.prepare(`
      SELECT ls.status, ls.active_revision_id FROM localized_segments ls
      JOIN localized_transcripts lt ON lt.id = ls.localized_transcript_id WHERE lt.run_id = ?
    `).get(runId)).toMatchObject({ status: "pending", active_revision_id: null });
    inspection.close();
  });

  it("keeps an active user revision when a provider result arrives", () => {
    const { runId, sourceSegmentId, providerResult } = createPendingLocalization();
    expect(store.saveLocalizedSegmentUserRevision(runId, sourceSegmentId, "owner-hash", "Kullanıcı metni"))
      .toMatchObject({ revision: 1 });

    expect(store.saveTranslationProviderResult(runId, "localization-worker", providerResult)).toEqual({ status: "translated", revision: 1 });
    expect(store.getLocalizationRunForOwner(runId, "owner-hash")?.segments[0]).toMatchObject({
      translatedText: "Kullanıcı metni",
      revision: 1,
      revisionOrigin: "user",
      revisionCount: 2,
    });
  });

  it("rejects stale localization writes after the run lease is reclaimed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const { runId, sourceSegmentId, providerResult } = createPendingLocalization();
    expect(store.saveLocalizedSegmentUserRevision(runId, sourceSegmentId, "owner-hash", "Kullanıcı metni"))
      .toMatchObject({ revision: 1 });

    vi.setSystemTime(new Date("2026-01-01T00:00:30.001Z"));
    expect(store.claimNextLocalizationRun("current-worker", 30_000)).toMatchObject({ id: runId });
    expect(store.saveTranslationProviderResult(runId, "localization-worker", providerResult)).toBeNull();
    expect(store.finishLocalizationRun(runId, "localization-worker", "completed")).toBe(false);
    expect(store.getLocalizationRunForOwner(runId, "owner-hash")?.segments[0]).toMatchObject({
      translatedText: "Kullanıcı metni",
      revision: 1,
      revisionOrigin: "user",
      revisionCount: 1,
    });

    expect(store.saveTranslationProviderResult(runId, "current-worker", providerResult)).toMatchObject({
      status: "translated",
      revision: 1,
    });
    expect(store.finishLocalizationRun(runId, "current-worker", "completed")).toBe(true);
    expect(store.getLocalizationRunForOwner(runId, "owner-hash")?.segments[0]).toMatchObject({
      translatedText: "Kullanıcı metni",
      revision: 1,
      revisionOrigin: "user",
      revisionCount: 2,
    });
  });

  it("rejects stale regeneration writes after the job lease is reclaimed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const { runId, sourceSegmentId, providerResult } = createPendingLocalization();
    expect(store.saveTranslationProviderResult(runId, "localization-worker", providerResult)).toMatchObject({ revision: 1 });
    expect(store.saveLocalizedSegmentUserRevision(runId, sourceSegmentId, "owner-hash", "Kullanıcı metni"))
      .toMatchObject({ revision: 2 });
    const regenerationId = store.queueTranslationRegeneration(runId, sourceSegmentId, "owner-hash")!;
    expect(store.claimNextTranslationRegenerationJob("stale-worker", 1)).toMatchObject({ id: regenerationId });

    vi.setSystemTime(new Date("2026-01-01T00:00:00.002Z"));
    expect(store.claimNextTranslationRegenerationJob("current-worker", 30_000)).toMatchObject({ id: regenerationId });
    expect(store.saveTranslationRegenerationResult(regenerationId, "stale-worker", {
      ...providerResult,
      translatedText: "Eski worker metni",
    })).toBeNull();
    expect(store.failTranslationRegenerationJob(regenerationId, "stale-worker", "stale_failure")).toBe(false);
    expect(store.getLocalizationRunForOwner(runId, "owner-hash")?.segments[0]).toMatchObject({
      translatedText: "Kullanıcı metni",
      revision: 2,
      revisionCount: 2,
    });

    expect(store.saveTranslationRegenerationResult(regenerationId, "current-worker", {
      ...providerResult,
      translatedText: "Güncel worker metni",
    })).toMatchObject({ status: "completed", revision: 3, activeRevisionPreserved: true });
    expect(store.getLocalizationRunForOwner(runId, "owner-hash")?.segments[0]).toMatchObject({
      translatedText: "Kullanıcı metni",
      revision: 2,
      revisionOrigin: "user",
      revisionCount: 3,
    });
  });

  it("coalesces concurrent regeneration requests and allows retries after terminal history", async () => {
    const { runId, sourceSegmentId, providerResult } = createPendingLocalization();
    expect(store.queueTranslationRegeneration(runId, sourceSegmentId, "another-owner")).toBeNull();
    const databasePath = path.join(directory, "events.sqlite");
    const runnerPath = path.join(directory, "regeneration-queue-runner.ts");
    const gatePath = path.join(directory, "regeneration-queue-gate");
    const readyPaths = [path.join(directory, "regeneration-ready-1"), path.join(directory, "regeneration-ready-2")];
    const storeModuleUrl = pathToFileURL(path.resolve("lib/server/store.ts")).href;
    await writeFile(runnerPath, `
      import { existsSync, writeFileSync } from "node:fs";
      import { AnalysisStore } from ${JSON.stringify(storeModuleUrl)};
      async function main() {
        const [databasePath, runId, sourceSegmentId, readyPath, gatePath] = process.argv.slice(2);
        writeFileSync(readyPath, "ready");
        while (!existsSync(gatePath)) await new Promise((resolve) => setTimeout(resolve, 5));
        const store = new AnalysisStore(databasePath);
        try {
          console.log(store.queueTranslationRegeneration(runId, sourceSegmentId, "owner-hash"));
        } finally {
          store.close();
        }
      }
      main().catch((error) => { console.error(error); process.exitCode = 1; });
    `);
    const attempts = readyPaths.map((readyPath) => runRegenerationQueueProcess(
      runnerPath, databasePath, runId, sourceSegmentId, readyPath, gatePath,
    ));
    await Promise.all(readyPaths.map(waitForFile));
    await writeFile(gatePath, "go");

    const [firstJobId, secondJobId] = await Promise.all(attempts);
    expect(secondJobId).toBe(firstJobId);
    const inspection = new DatabaseSync(databasePath);
    expect(inspection.prepare(`
      SELECT COUNT(*) AS count FROM translation_regeneration_jobs
      WHERE run_id = ? AND source_segment_id = ? AND status IN ('queued', 'running')
    `).get(runId, sourceSegmentId)).toMatchObject({ count: 1 });
    inspection.close();
    expect(store.listLocalizationEvents(runId).filter((event) => event.type === "translation_segment_regeneration_queued"))
      .toHaveLength(1);

    const translate = vi.fn(async () => ({ ...providerResult, timingAssessment: null }));
    const providers = {
      translation: vi.fn(async () => ({ translate })),
    } as unknown as ProviderRegistry;
    const { runLocalizationWorkerOnce } = await import("./localization-worker");
    await expect(runLocalizationWorkerOnce(store, "regeneration-worker", providers)).resolves.toBe(true);
    await expect(runLocalizationWorkerOnce(store, "regeneration-worker", providers)).resolves.toBe(false);
    expect(translate).toHaveBeenCalledOnce();

    const completedRetryId = store.queueTranslationRegeneration(runId, sourceSegmentId, "owner-hash");
    expect(completedRetryId).not.toBe(firstJobId);
    expect(store.claimNextTranslationRegenerationJob("retry-worker", 30_000)).toMatchObject({ id: completedRetryId });
    expect(store.failTranslationRegenerationJob(completedRetryId!, "retry-worker", "provider_unavailable")).toBe(true);
    const failedRetryId = store.queueTranslationRegeneration(runId, sourceSegmentId, "owner-hash");
    expect(failedRetryId).not.toBe(completedRetryId);

    const history = new DatabaseSync(databasePath);
    expect(history.prepare(`SELECT status, COUNT(*) AS count FROM translation_regeneration_jobs GROUP BY status ORDER BY status`).all())
      .toEqual([
        { status: "completed", count: 1 },
        { status: "failed", count: 1 },
        { status: "queued", count: 1 },
      ]);
    history.close();
    expect(store.listLocalizationEvents(runId).filter((event) => event.type === "translation_segment_regeneration_queued"))
      .toHaveLength(3);
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
    expect(store.claimNextJob("analysis-worker", 30_000)).toMatchObject({ id: jobId });
    expect(store.completeJob(jobId, "analysis-worker", "ready")).toBe(true);
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
    expect(store.claimNextJob("analysis-worker", 30_000)).toMatchObject({ id: jobId });
    expect(store.completeJob(jobId, "analysis-worker", "ready")).toBe(true);
    store.selectTargetLanguage(projectId, { code: "tr", name: "Turkish" });
    store.prepareLocalizationSetup(projectId);
    const runId = store.createLocalizationRun(projectId);
    expect(store.claimNextLocalizationRun("localization-worker", 30_000)).toMatchObject({ id: runId });
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
    expect(store.saveTranslationProviderResult(runId, "localization-worker", providerResult)).toMatchObject({ status: "translated", revision: 1 });
    expect(store.saveLocalizedSegmentUserRevision(runId, sourceSegmentId, "owner-hash", "Kullanıcı metni")).toMatchObject({ revision: 2 });
    const job = store.queueTranslationRegeneration(runId, sourceSegmentId, "owner-hash");
    expect(job).toEqual(expect.any(String));
    expect(store.claimNextTranslationRegenerationJob("worker", 30_000)).toMatchObject({ id: job, runId, sourceSegmentId });
    expect(store.saveTranslationRegenerationResult(job!, "worker", { ...providerResult, translatedText: "Merhaba orada" })).toMatchObject({
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
