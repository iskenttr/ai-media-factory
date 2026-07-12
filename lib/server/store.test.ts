import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AnalysisStore } from "./store";

describe("AnalysisStore", () => {
  let directory: string;
  let store: AnalysisStore;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "amf-store-"));
    store = new AnalysisStore(path.join(directory, "events.sqlite"));
  });

  afterEach(async () => {
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
