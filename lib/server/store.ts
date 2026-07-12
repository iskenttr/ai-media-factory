import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import {
  eventPayloadSchemas,
  parseAnalysisEvent,
  type AnalysisEvent,
  type AnalysisEventType,
  type EventPayload,
} from "@/lib/analysis/contracts";
import { localizationPlanSchema, type LocalizationPlan } from "@/lib/analysis/localization-plan";
import type { SpeechObservation } from "@/lib/analysis/observations";
import { alignSegmentToSpeakers } from "@/lib/subtitle-quality/alignment";
import { suggestionConfidenceSchema, suggestionStatusSchema, suggestionTypeSchema, targetLanguageSchema, transcriptPatchSchema, type StudioSuggestion, type TargetLanguage, type TranscriptPatch } from "@/lib/studio/contracts";
import { deriveStudioSuggestions } from "@/lib/studio/suggestions";
import { translationRunStatusSchema, type LocalizedSegmentData, type LocalizationEvent, type LocalizationRunData, type TranslationContextSegment, type TranslationMode, type TranslationProviderResult, type TranslationRevisionData } from "@/lib/localization/contracts";

import { serverConfig } from "./config";

export interface UploadSessionRecord {
  id: string;
  ownerHash: string;
  uploadTokenHash: string;
  fileName: string;
  declaredSize: number;
  declaredMime: string;
  status: "pending" | "verified" | "failed";
  sourcePath: string | null;
  actualSize: number | null;
  sha256: string | null;
  verifiedMime: string | null;
  jobId: string | null;
  createdAt: string;
  expiresAt: string;
  errorCode: string | null;
}

export interface AnalysisJobRecord {
  id: string;
  uploadId: string;
  ownerHash: string;
  status: "queued" | "running" | "completed" | "failed";
  attempt: number;
  readiness: "ready" | "limited" | "blocked" | null;
  sourcePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}

export interface StudioProjectRecord {
  id: string;
  jobId: string;
  attempt: number;
  sourcePath: string;
  fileName: string;
  mimeType: string;
  durationMs: number;
  width: number;
  height: number;
  sourceLanguage: TargetLanguage | null;
  targetLanguage: TargetLanguage | null;
  setupPrepared: boolean;
  speakerCount: number | null;
  contentStructure: string | null;
  limitations: string[];
  sourceEventIds: string[];
  segments: Array<{
    id: string;
    sourceSegmentId: string;
    sequence: number;
    speakerId: string;
    speakerAssigned: boolean;
    startMs: number;
    endMs: number;
    originalText: string;
    correctionVersion: number;
  }>;
  suggestions: StudioSuggestion[];
  localization: LocalizationRunData | null;
}

export interface TranslationRegenerationJobRecord {
  id: string;
  runId: string;
  sourceSegmentId: string;
  leaseOwner: string | null;
}

export interface LocalizationRunRecord {
  id: string;
  projectId: string;
  contextSnapshotId: string;
  status: "queued" | "running" | "completed" | "partial" | "failed";
  attempt: number;
}

export interface VideoRenderJobRecord {
  id: string;
  runId: string;
  sourcePath: string;
  outputPath: string;
  leaseOwner: string;
  segments: Array<{ startMs: number; endMs: number; text: string; speakerId?: string; words?: Array<{ text: string; startMs: number; endMs: number }> }>;
}

interface CreateUploadInput {
  id: string;
  ownerHash: string;
  uploadTokenHash: string;
  fileName: string;
  declaredSize: number;
  declaredMime: string;
  createdAt: string;
  expiresAt: string;
}

interface VerifyUploadInput {
  uploadId: string;
  sourcePath: string;
  actualSize: number;
  sha256: string;
  verifiedMime: string;
}

type DatabaseRow = Record<string, SQLInputValue>;
const currentVideoRendererVersion = "subtitle-quality-v1";

function mapUpload(row: DatabaseRow): UploadSessionRecord {
  return {
    id: String(row.id),
    ownerHash: String(row.owner_hash),
    uploadTokenHash: String(row.upload_token_hash),
    fileName: String(row.file_name),
    declaredSize: Number(row.declared_size),
    declaredMime: String(row.declared_mime),
    status: String(row.status) as UploadSessionRecord["status"],
    sourcePath: row.source_path ? String(row.source_path) : null,
    actualSize: row.actual_size === null ? null : Number(row.actual_size),
    sha256: row.sha256 ? String(row.sha256) : null,
    verifiedMime: row.verified_mime ? String(row.verified_mime) : null,
    jobId: row.job_id ? String(row.job_id) : null,
    createdAt: String(row.created_at),
    expiresAt: String(row.expires_at),
    errorCode: row.error_code ? String(row.error_code) : null,
  };
}

export class AnalysisStore {
  private readonly database: DatabaseSync;

  constructor(databasePath = serverConfig.databasePath) {
    mkdirSync(path.dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
    this.migrate();
  }

  close() {
    this.database.close();
  }

  healthcheck() {
    return Number((this.database.prepare("SELECT 1 AS healthy").get() as DatabaseRow).healthy) === 1;
  }

  recordServiceHeartbeat(service: string) {
    this.database.prepare(`
      INSERT INTO service_heartbeats (service, observed_at) VALUES (?, ?)
      ON CONFLICT(service) DO UPDATE SET observed_at = excluded.observed_at
    `).run(service, new Date().toISOString());
  }

  serviceHeartbeatIsFresh(service: string, maximumAgeMs: number) {
    const row = this.database.prepare("SELECT observed_at FROM service_heartbeats WHERE service = ?").get(service) as DatabaseRow | undefined;
    return Boolean(row && Date.now() - Date.parse(String(row.observed_at)) <= maximumAgeMs);
  }

  private migrate() {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS upload_sessions (
        id TEXT PRIMARY KEY,
        owner_hash TEXT NOT NULL,
        upload_token_hash TEXT NOT NULL,
        file_name TEXT NOT NULL,
        declared_size INTEGER NOT NULL,
        declared_mime TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'verified', 'failed')),
        source_path TEXT,
        actual_size INTEGER,
        sha256 TEXT,
        verified_mime TEXT,
        job_id TEXT,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        error_code TEXT
      );

      CREATE TABLE IF NOT EXISTS analysis_jobs (
        id TEXT PRIMARY KEY,
        upload_id TEXT NOT NULL UNIQUE REFERENCES upload_sessions(id),
        owner_hash TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
        attempt INTEGER NOT NULL DEFAULT 1,
        next_sequence INTEGER NOT NULL DEFAULT 1,
        readiness TEXT CHECK (readiness IN ('ready', 'limited', 'blocked')),
        lease_owner TEXT,
        lease_expires_at TEXT,
        last_error_code TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS analysis_events (
        event_id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES analysis_jobs(id),
        upload_id TEXT NOT NULL REFERENCES upload_sessions(id),
        attempt INTEGER NOT NULL,
        sequence INTEGER NOT NULL,
        type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE,
        occurred_at TEXT NOT NULL,
        UNIQUE(job_id, sequence)
      );

      CREATE TABLE IF NOT EXISTS analysis_observations (
        job_id TEXT NOT NULL REFERENCES analysis_jobs(id),
        attempt INTEGER NOT NULL,
        capability TEXT NOT NULL,
        result_json TEXT NOT NULL,
        provider_id TEXT,
        provider_version TEXT,
        source_event_id TEXT NOT NULL REFERENCES analysis_events(event_id),
        created_at TEXT NOT NULL,
        PRIMARY KEY (job_id, attempt, capability)
      );

      CREATE TABLE IF NOT EXISTS localization_plans (
        job_id TEXT NOT NULL REFERENCES analysis_jobs(id),
        attempt INTEGER NOT NULL,
        engine_version TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('ready', 'limited', 'blocked')),
        plan_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (job_id, attempt, engine_version)
      );

      CREATE TABLE IF NOT EXISTS source_transcripts (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES analysis_jobs(id),
        attempt INTEGER NOT NULL,
        language_json TEXT,
        provider_id TEXT NOT NULL,
        provider_version TEXT NOT NULL,
        source_event_id TEXT NOT NULL REFERENCES analysis_events(event_id),
        created_at TEXT NOT NULL,
        UNIQUE(job_id, attempt)
      );

      CREATE TABLE IF NOT EXISTS transcript_segments (
        id TEXT PRIMARY KEY,
        source_transcript_id TEXT NOT NULL REFERENCES source_transcripts(id),
        sequence INTEGER NOT NULL,
        speaker_id TEXT,
        start_ms INTEGER NOT NULL,
        end_ms INTEGER NOT NULL,
        original_text TEXT NOT NULL,
        word_timestamps_json TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(source_transcript_id, sequence)
      );

      CREATE TABLE IF NOT EXISTS localization_projects (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL UNIQUE REFERENCES analysis_jobs(id),
        source_transcript_id TEXT NOT NULL REFERENCES source_transcripts(id),
        target_language_json TEXT,
        setup_prepared_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS transcript_corrections (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES localization_projects(id),
        segment_id TEXT NOT NULL REFERENCES transcript_segments(id),
        version INTEGER NOT NULL,
        patch_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(project_id, segment_id, version)
      );

      CREATE TABLE IF NOT EXISTS target_language_selections (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES localization_projects(id),
        language_json TEXT NOT NULL,
        selected_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS studio_suggestions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES localization_projects(id),
        segment_id TEXT REFERENCES transcript_segments(id),
        type TEXT NOT NULL,
        confidence TEXT NOT NULL,
        title TEXT NOT NULL,
        explanation TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(project_id, fingerprint)
      );

      CREATE TABLE IF NOT EXISTS localization_context_snapshots (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES localization_projects(id),
        fingerprint TEXT NOT NULL,
        snapshot_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(project_id, fingerprint)
      );

      CREATE TABLE IF NOT EXISTS localization_runs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES localization_projects(id),
        context_snapshot_id TEXT NOT NULL REFERENCES localization_context_snapshots(id),
        target_language_json TEXT NOT NULL,
        translation_mode TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'partial', 'failed')),
        attempt INTEGER NOT NULL DEFAULT 1,
        next_sequence INTEGER NOT NULL DEFAULT 1,
        lease_owner TEXT,
        lease_expires_at TEXT,
        last_error_code TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS localized_transcripts (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL UNIQUE REFERENCES localization_runs(id),
        context_snapshot_id TEXT NOT NULL REFERENCES localization_context_snapshots(id),
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS localized_segments (
        id TEXT PRIMARY KEY,
        localized_transcript_id TEXT NOT NULL REFERENCES localized_transcripts(id),
        source_segment_id TEXT NOT NULL REFERENCES transcript_segments(id),
        sequence INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'translated', 'failed', 'stale')),
        active_revision_id TEXT,
        timing_json TEXT,
        failure_reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(localized_transcript_id, source_segment_id)
      );

      CREATE TABLE IF NOT EXISTS translation_provider_results (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES localization_runs(id),
        source_segment_id TEXT NOT NULL REFERENCES transcript_segments(id),
        availability TEXT NOT NULL CHECK (availability IN ('available', 'unavailable')),
        result_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(run_id, source_segment_id)
      );

      CREATE TABLE IF NOT EXISTS translation_revisions (
        id TEXT PRIMARY KEY,
        localized_segment_id TEXT NOT NULL REFERENCES localized_segments(id),
        version INTEGER NOT NULL,
        translated_text TEXT NOT NULL,
        origin TEXT NOT NULL CHECK (origin IN ('provider', 'user', 'restore')),
        provider_result_id TEXT REFERENCES translation_provider_results(id),
        parent_revision_id TEXT REFERENCES translation_revisions(id),
        created_at TEXT NOT NULL,
        UNIQUE(localized_segment_id, version)
      );

      CREATE TABLE IF NOT EXISTS translation_issues (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES localization_runs(id),
        source_segment_id TEXT REFERENCES transcript_segments(id),
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS translation_regeneration_jobs (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES localization_runs(id),
        source_segment_id TEXT NOT NULL REFERENCES transcript_segments(id),
        status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
        result_json TEXT,
        lease_owner TEXT,
        lease_expires_at TEXT,
        last_error_code TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS localization_events (
        event_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES localization_runs(id),
        sequence INTEGER NOT NULL,
        type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE,
        occurred_at TEXT NOT NULL,
        UNIQUE(run_id, sequence)
      );

      CREATE TABLE IF NOT EXISTS video_render_jobs (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES localization_runs(id),
        status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
        output_path TEXT NOT NULL,
        renderer_version TEXT NOT NULL DEFAULT 'legacy',
        lease_owner TEXT,
        lease_expires_at TEXT,
        last_error_code TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS service_heartbeats (
        service TEXT PRIMARY KEY,
        observed_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS analysis_events_job_sequence
        ON analysis_events(job_id, sequence);
      CREATE INDEX IF NOT EXISTS analysis_jobs_queue
        ON analysis_jobs(status, lease_expires_at, created_at);
      CREATE INDEX IF NOT EXISTS transcript_corrections_project_segment
        ON transcript_corrections(project_id, segment_id, version DESC);
      CREATE INDEX IF NOT EXISTS studio_suggestions_project_status
        ON studio_suggestions(project_id, status, created_at);
      CREATE INDEX IF NOT EXISTS localization_runs_queue
        ON localization_runs(status, lease_expires_at, created_at);
      CREATE INDEX IF NOT EXISTS translation_regeneration_jobs_queue
        ON translation_regeneration_jobs(status, lease_expires_at, created_at);
      CREATE INDEX IF NOT EXISTS localization_events_run_sequence
        ON localization_events(run_id, sequence);
      CREATE INDEX IF NOT EXISTS video_render_jobs_queue
        ON video_render_jobs(status, lease_expires_at, created_at);
    `);
    try {
      this.database.exec("ALTER TABLE localization_projects ADD COLUMN setup_prepared_at TEXT");
    } catch {
      // Existing databases already have this additive migration.
    }
    try {
      this.database.exec("ALTER TABLE video_render_jobs ADD COLUMN renderer_version TEXT NOT NULL DEFAULT 'legacy'");
    } catch {
      // Existing databases already have this additive migration.
    }
    try {
      this.database.exec("ALTER TABLE transcript_segments ADD COLUMN word_timestamps_json TEXT");
    } catch {
      // Existing databases already have this additive migration.
    }
  }

  createUploadSession(input: CreateUploadInput) {
    this.database
      .prepare(`
        INSERT INTO upload_sessions (
          id, owner_hash, upload_token_hash, file_name, declared_size, declared_mime,
          status, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
      `)
      .run(
        input.id,
        input.ownerHash,
        input.uploadTokenHash,
        input.fileName,
        input.declaredSize,
        input.declaredMime,
        input.createdAt,
        input.expiresAt,
      );
  }

  getUploadSession(uploadId: string) {
    const row = this.database
      .prepare("SELECT * FROM upload_sessions WHERE id = ?")
      .get(uploadId) as DatabaseRow | undefined;
    return row ? mapUpload(row) : null;
  }

  failUpload(uploadId: string, errorCode: string) {
    this.database
      .prepare("UPDATE upload_sessions SET status = 'failed', error_code = ? WHERE id = ?")
      .run(errorCode, uploadId);
  }

  verifyUploadAndCreateJob(input: VerifyUploadInput) {
    const upload = this.getUploadSession(input.uploadId);
    if (!upload) {
      throw new Error("Upload session not found");
    }

    if (upload.status === "verified" && upload.jobId) {
      return upload.jobId;
    }

    const jobId = randomUUID();
    const now = new Date().toISOString();
    this.database.exec("BEGIN IMMEDIATE");

    try {
      this.database
        .prepare(`
          UPDATE upload_sessions
          SET status = 'verified', source_path = ?, actual_size = ?, sha256 = ?,
              verified_mime = ?, job_id = ?, error_code = NULL
          WHERE id = ? AND status = 'pending'
        `)
        .run(
          input.sourcePath,
          input.actualSize,
          input.sha256,
          input.verifiedMime,
          jobId,
          input.uploadId,
        );

      this.database
        .prepare(`
          INSERT INTO analysis_jobs (
            id, upload_id, owner_hash, status, attempt, next_sequence, created_at, updated_at
          ) VALUES (?, ?, ?, 'queued', 1, 1, ?, ?)
        `)
        .run(jobId, input.uploadId, upload.ownerHash, now, now);

      this.database.exec("COMMIT");
      return jobId;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  getJobForOwner(jobId: string, ownerHash: string) {
    const row = this.database
      .prepare(`
        SELECT j.*, u.source_path, u.file_name, u.verified_mime, u.actual_size, u.sha256
        FROM analysis_jobs j
        JOIN upload_sessions u ON u.id = j.upload_id
        WHERE j.id = ? AND j.owner_hash = ? AND u.status = 'verified'
      `)
      .get(jobId, ownerHash) as DatabaseRow | undefined;
    return row ? this.mapJob(row) : null;
  }

  claimNextJob(workerId: string, leaseMs: number) {
    const now = new Date();
    const nowIso = now.toISOString();
    const leaseExpiresAt = new Date(now.getTime() + leaseMs).toISOString();
    this.database.exec("BEGIN IMMEDIATE");

    try {
      const row = this.database
        .prepare(`
          SELECT j.id
          FROM analysis_jobs j
          WHERE j.status = 'queued'
             OR (j.status = 'running' AND j.lease_expires_at < ?)
          ORDER BY j.created_at ASC
          LIMIT 1
        `)
        .get(nowIso) as DatabaseRow | undefined;

      if (!row) {
        this.database.exec("COMMIT");
        return null;
      }

      this.database
        .prepare(`
          UPDATE analysis_jobs
          SET status = 'running', lease_owner = ?, lease_expires_at = ?, updated_at = ?
          WHERE id = ?
        `)
        .run(workerId, leaseExpiresAt, nowIso, String(row.id));

      const jobRow = this.database
        .prepare(`
          SELECT j.*, u.source_path, u.file_name, u.verified_mime, u.actual_size, u.sha256
          FROM analysis_jobs j
          JOIN upload_sessions u ON u.id = j.upload_id
          WHERE j.id = ?
        `)
        .get(String(row.id)) as DatabaseRow;

      this.database.exec("COMMIT");
      return this.mapJob(jobRow);
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  renewLease(jobId: string, workerId: string, leaseMs: number) {
    const now = new Date();
    const result = this.database
      .prepare(`
        UPDATE analysis_jobs
        SET lease_expires_at = ?, updated_at = ?
        WHERE id = ? AND status = 'running' AND lease_owner = ?
      `)
      .run(
        new Date(now.getTime() + leaseMs).toISOString(),
        now.toISOString(),
        jobId,
        workerId,
      );
    return result.changes === 1;
  }

  appendEvent<T extends AnalysisEventType>(
    jobId: string,
    attempt: number,
    type: T,
    payload: EventPayload<T>,
    idempotencyKey: string,
  ): AnalysisEvent<T> {
    const validPayload = eventPayloadSchemas[type].parse(payload) as EventPayload<T>;
    const existing = this.database
      .prepare("SELECT * FROM analysis_events WHERE idempotency_key = ?")
      .get(idempotencyKey) as DatabaseRow | undefined;
    if (existing) {
      return this.mapEvent(existing) as AnalysisEvent<T>;
    }

    this.database.exec("BEGIN IMMEDIATE");
    try {
      const job = this.database
        .prepare("SELECT upload_id, next_sequence FROM analysis_jobs WHERE id = ?")
        .get(jobId) as DatabaseRow | undefined;
      if (!job) {
        throw new Error("Analysis job not found");
      }

      const eventId = randomUUID();
      const occurredAt = new Date().toISOString();
      const sequence = Number(job.next_sequence);
      this.database
        .prepare(`
          INSERT INTO analysis_events (
            event_id, job_id, upload_id, attempt, sequence, type, payload_json,
            idempotency_key, occurred_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          eventId,
          jobId,
          String(job.upload_id),
          attempt,
          sequence,
          type,
          JSON.stringify(validPayload),
          idempotencyKey,
          occurredAt,
        );
      this.database
        .prepare("UPDATE analysis_jobs SET next_sequence = ?, updated_at = ? WHERE id = ?")
        .run(sequence + 1, occurredAt, jobId);
      this.database.exec("COMMIT");

      return {
        schemaVersion: 1,
        eventId,
        jobId,
        uploadId: String(job.upload_id),
        attempt,
        sequence,
        type,
        occurredAt,
        payload: validPayload,
      };
    } catch (error) {
      this.database.exec("ROLLBACK");
      const duplicate = this.database
        .prepare("SELECT * FROM analysis_events WHERE idempotency_key = ?")
        .get(idempotencyKey) as DatabaseRow | undefined;
      if (duplicate) {
        return this.mapEvent(duplicate) as AnalysisEvent<T>;
      }
      throw error;
    }
  }

  listEvents(jobId: string, afterEventId?: string | null, attempt?: number) {
    let afterSequence = 0;
    if (afterEventId) {
      const row = this.database
        .prepare("SELECT sequence FROM analysis_events WHERE event_id = ? AND job_id = ?")
        .get(afterEventId, jobId) as DatabaseRow | undefined;
      afterSequence = row ? Number(row.sequence) : 0;
    }

    const rows = attempt
      ? (this.database
          .prepare(
            "SELECT * FROM analysis_events WHERE job_id = ? AND attempt = ? AND sequence > ? ORDER BY sequence ASC",
          )
          .all(jobId, attempt, afterSequence) as DatabaseRow[])
      : (this.database
          .prepare(
            "SELECT * FROM analysis_events WHERE job_id = ? AND sequence > ? ORDER BY sequence ASC",
          )
          .all(jobId, afterSequence) as DatabaseRow[]);
    return rows.map((row) => this.mapEvent(row));
  }

  getCurrentAttemptEvents(jobId: string) {
    const job = this.database
      .prepare("SELECT attempt FROM analysis_jobs WHERE id = ?")
      .get(jobId) as DatabaseRow | undefined;
    if (!job) {
      return [];
    }
    const rows = this.database
      .prepare("SELECT * FROM analysis_events WHERE job_id = ? AND attempt = ? ORDER BY sequence ASC")
      .all(jobId, Number(job.attempt)) as DatabaseRow[];
    return rows.map((row) => this.mapEvent(row));
  }

  saveObservation(input: {
    jobId: string;
    attempt: number;
    capability: string;
    result: unknown;
    sourceEventId: string;
    providerId?: string;
    providerVersion?: string;
  }) {
    this.database.prepare(`
      INSERT INTO analysis_observations (
        job_id, attempt, capability, result_json, provider_id, provider_version,
        source_event_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(job_id, attempt, capability) DO NOTHING
    `).run(
      input.jobId,
      input.attempt,
      input.capability,
      JSON.stringify(input.result),
      input.providerId ?? null,
      input.providerVersion ?? null,
      input.sourceEventId,
      new Date().toISOString(),
    );
  }

  saveLocalizationPlan(jobId: string, attempt: number, plan: LocalizationPlan) {
    const validPlan = localizationPlanSchema.parse(plan);
    this.database.prepare(`
      INSERT INTO localization_plans (
        job_id, attempt, engine_version, status, plan_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(job_id, attempt, engine_version) DO NOTHING
    `).run(
      jobId,
      attempt,
      validPlan.engineVersion,
      validPlan.status,
      JSON.stringify(validPlan),
      new Date().toISOString(),
    );
    return validPlan;
  }

  saveSourceTranscript(input: {
    jobId: string;
    attempt: number;
    speech: SpeechObservation;
    sourceEventId: string;
    speakerSegments?: Array<{ speakerId: string; start: number; end: number }>;
  }) {
    const existing = this.database.prepare(
      "SELECT id FROM source_transcripts WHERE job_id = ? AND attempt = ?",
    ).get(input.jobId, input.attempt) as DatabaseRow | undefined;
    if (existing) return String(existing.id);
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare(`
        INSERT INTO source_transcripts (id, job_id, attempt, language_json, provider_id, provider_version, source_event_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, input.jobId, input.attempt, input.speech.language ? JSON.stringify(input.speech.language) : null,
        input.speech.providerId, input.speech.providerVersion, input.sourceEventId, createdAt);
      const insert = this.database.prepare(`
        INSERT INTO transcript_segments (id, source_transcript_id, sequence, speaker_id, start_ms, end_ms, original_text, word_timestamps_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      let sequence = 1;
      input.speech.segments.forEach((segment) => {
        const parts = alignSegmentToSpeakers(segment, (input.speakerSegments ?? []).map((turn) => ({
          speakerId: turn.speakerId, startMs: Math.round(turn.start * 1000), endMs: Math.round(turn.end * 1000),
        })));
        parts.forEach((part) => insert.run(randomUUID(), id, sequence++, part.speakerId,
          Math.round(part.startSeconds * 1000), Math.round(part.endSeconds * 1000), part.text,
          part.words?.length ? JSON.stringify(part.words) : null, createdAt));
      });
      this.database.exec("COMMIT");
      return id;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  ensureLocalizationProject(jobId: string, sourceTranscriptId: string) {
    const existing = this.database.prepare("SELECT id FROM localization_projects WHERE job_id = ?").get(jobId) as DatabaseRow | undefined;
    if (existing) return String(existing.id);
    const id = randomUUID();
    const now = new Date().toISOString();
    this.database.prepare(`
      INSERT INTO localization_projects (id, job_id, source_transcript_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, jobId, sourceTranscriptId, now, now);
    return id;
  }

  getStudioProjectForOwner(jobId: string, ownerHash: string): StudioProjectRecord | null {
    const base = this.database.prepare(`
      SELECT p.id, p.job_id, j.attempt, u.source_path, u.file_name, u.verified_mime, p.target_language_json, p.setup_prepared_at, st.language_json
      FROM localization_projects p
      JOIN analysis_jobs j ON j.id = p.job_id
      JOIN upload_sessions u ON u.id = j.upload_id
      JOIN source_transcripts st ON st.id = p.source_transcript_id
      WHERE p.job_id = ? AND j.owner_hash = ? AND j.status = 'completed'
    `).get(jobId, ownerHash) as DatabaseRow | undefined;
    if (!base) return null;
    const metadata = this.database.prepare(`
      SELECT result_json FROM analysis_observations WHERE job_id = ? AND attempt = ? AND capability = 'media_metadata_ready'
      UNION ALL
      SELECT payload_json AS result_json FROM analysis_events WHERE job_id = ? AND attempt = ? AND type = 'media_metadata_ready'
      LIMIT 1
    `).get(jobId, Number(base.attempt), jobId, Number(base.attempt)) as DatabaseRow | undefined;
    const speakers = this.database.prepare(`SELECT result_json FROM analysis_observations WHERE job_id = ? AND attempt = ? AND capability = 'speaker_analysis_completed'`).get(jobId, Number(base.attempt)) as DatabaseRow | undefined;
    const content = this.database.prepare(`SELECT result_json FROM analysis_observations WHERE job_id = ? AND attempt = ? AND capability = 'content_profile_completed'`).get(jobId, Number(base.attempt)) as DatabaseRow | undefined;
    const plan = this.database.prepare(`SELECT plan_json FROM localization_plans WHERE job_id = ? AND attempt = ? ORDER BY created_at DESC LIMIT 1`).get(jobId, Number(base.attempt)) as DatabaseRow | undefined;
    const metadataValue = metadata ? JSON.parse(String(metadata.result_json)) as { durationMs: number; width: number; height: number } : null;
    const speakerValue = speakers ? JSON.parse(String(speakers.result_json)) as { availability: string; speakerCount?: number } : null;
    const contentValue = content ? JSON.parse(String(content.result_json)) as { availability: string; profile?: { primaryType: string } } : null;
    const planValue = plan ? localizationPlanSchema.parse(JSON.parse(String(plan.plan_json))) : null;
    const rows = this.database.prepare(`
      SELECT s.*, c.version AS correction_version, c.patch_json
      FROM transcript_segments s
      JOIN localization_projects p ON p.source_transcript_id = s.source_transcript_id
      LEFT JOIN transcript_corrections c ON c.id = (
        SELECT latest.id FROM transcript_corrections latest WHERE latest.project_id = p.id AND latest.segment_id = s.id ORDER BY latest.version DESC LIMIT 1
      )
      WHERE p.id = ? ORDER BY s.sequence ASC
    `).all(String(base.id)) as DatabaseRow[];
    const record: StudioProjectRecord = {
      id: String(base.id), jobId: String(base.job_id), attempt: Number(base.attempt), sourcePath: String(base.source_path), fileName: String(base.file_name), mimeType: String(base.verified_mime),
      durationMs: metadataValue?.durationMs ?? 0, width: metadataValue?.width ?? 0, height: metadataValue?.height ?? 0,
      sourceLanguage: base.language_json ? targetLanguageSchema.parse(JSON.parse(String(base.language_json))) : null,
      targetLanguage: base.target_language_json ? targetLanguageSchema.parse(JSON.parse(String(base.target_language_json))) : null,
      setupPrepared: Boolean(base.setup_prepared_at),
      speakerCount: speakerValue?.availability === "available" ? speakerValue.speakerCount ?? null : null,
      contentStructure: contentValue?.availability === "available" ? contentValue.profile?.primaryType ?? null : null,
      limitations: planValue?.limitations ?? [], sourceEventIds: planValue?.sourceEventIds ?? [],
      segments: rows.map((row) => {
        const patch = row.patch_json ? transcriptPatchSchema.parse(JSON.parse(String(row.patch_json))) : null;
        return { id: String(row.id), sourceSegmentId: String(row.id), sequence: Number(row.sequence),
          speakerId: patch?.speakerId ?? String(row.speaker_id ?? "speaker_1"), speakerAssigned: Boolean(patch?.speakerId ?? row.speaker_id), startMs: patch?.startMs ?? Number(row.start_ms),
          endMs: patch?.endMs ?? Number(row.end_ms), originalText: patch?.text ?? String(row.original_text), correctionVersion: Number(row.correction_version ?? 0) };
      }),
      suggestions: [],
      localization: null,
    };
    this.ensureStudioSuggestions(record);
    return {
      ...record,
      suggestions: this.listStudioSuggestions(record.id),
      localization: this.getLatestLocalizationForProject(record.id),
    };
  }

  private ensureStudioSuggestions(project: Omit<StudioProjectRecord, "suggestions">) {
    const now = new Date().toISOString();
    const candidates = deriveStudioSuggestions(project.segments);
    if (candidates.length === 0) {
      this.database.prepare(`UPDATE studio_suggestions SET status = 'superseded', updated_at = ? WHERE project_id = ? AND status = 'open'`)
        .run(now, project.id);
    } else {
      const placeholders = candidates.map(() => "?").join(", ");
      this.database.prepare(`
        UPDATE studio_suggestions SET status = 'superseded', updated_at = ?
        WHERE project_id = ? AND status = 'open' AND fingerprint NOT IN (${placeholders})
      `).run(now, project.id, ...candidates.map((candidate) => candidate.fingerprint));
    }
    const insert = this.database.prepare(`
      INSERT INTO studio_suggestions (id, project_id, segment_id, type, confidence, title, explanation, fingerprint, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
      ON CONFLICT(project_id, fingerprint) DO UPDATE SET
        status = CASE WHEN studio_suggestions.status = 'superseded' THEN 'open' ELSE studio_suggestions.status END,
        updated_at = excluded.updated_at
    `);
    for (const suggestion of candidates) {
      insert.run(randomUUID(), project.id, suggestion.segmentId, suggestion.type, suggestion.confidence, suggestion.title, suggestion.explanation, suggestion.fingerprint, now, now);
    }
  }

  listStudioSuggestions(projectId: string) {
    const rows = this.database.prepare(`
      SELECT id, segment_id, type, confidence, title, explanation, status FROM studio_suggestions
      WHERE project_id = ? AND status = 'open' ORDER BY CASE confidence WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at ASC
    `).all(projectId) as DatabaseRow[];
    return rows.map((row) => ({ id: String(row.id), segmentId: row.segment_id ? String(row.segment_id) : null,
      type: suggestionTypeSchema.parse(String(row.type)), confidence: suggestionConfidenceSchema.parse(String(row.confidence)),
      title: String(row.title), explanation: String(row.explanation), status: suggestionStatusSchema.parse(String(row.status)) }));
  }

  setStudioSuggestionStatus(projectId: string, suggestionId: string, status: "accepted" | "ignored") {
    const result = this.database.prepare(`UPDATE studio_suggestions SET status = ?, updated_at = ? WHERE id = ? AND project_id = ? AND status = 'open'`)
      .run(status, new Date().toISOString(), suggestionId, projectId);
    return result.changes === 1;
  }

  saveTranscriptCorrection(projectId: string, segmentId: string, patch: TranscriptPatch) {
    const validPatch = transcriptPatchSchema.parse(patch);
    const previous = this.database.prepare(`SELECT version, patch_json FROM transcript_corrections WHERE project_id = ? AND segment_id = ? ORDER BY version DESC LIMIT 1`).get(projectId, segmentId) as DatabaseRow | undefined;
    const previousPatch = previous?.patch_json ? transcriptPatchSchema.parse(JSON.parse(String(previous.patch_json))) : {};
    const row = this.database.prepare(`SELECT COALESCE(MAX(version), 0) AS version FROM transcript_corrections WHERE project_id = ? AND segment_id = ?`).get(projectId, segmentId) as DatabaseRow;
    const version = Number(row.version) + 1;
    this.database.prepare(`INSERT INTO transcript_corrections (id, project_id, segment_id, version, patch_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(randomUUID(), projectId, segmentId, version, JSON.stringify({ ...previousPatch, ...validPatch }), new Date().toISOString());
    this.database.prepare(`UPDATE studio_suggestions SET status = 'superseded', updated_at = ? WHERE project_id = ? AND segment_id = ? AND status = 'open'`)
      .run(new Date().toISOString(), projectId, segmentId);
    this.database.prepare(`
      UPDATE localized_segments SET status = 'stale', updated_at = ?
      WHERE source_segment_id = ? AND localized_transcript_id IN (
        SELECT lt.id FROM localized_transcripts lt JOIN localization_runs r ON r.id = lt.run_id WHERE r.project_id = ?
      ) AND status = 'translated'
    `).run(new Date().toISOString(), segmentId, projectId);
    return version;
  }

  selectTargetLanguage(projectId: string, language: TargetLanguage) {
    const validLanguage = targetLanguageSchema.parse(language);
    const now = new Date().toISOString();
    this.database.prepare(`INSERT INTO target_language_selections (id, project_id, language_json, selected_at) VALUES (?, ?, ?, ?)`)
      .run(randomUUID(), projectId, JSON.stringify(validLanguage), now);
    this.database.prepare(`UPDATE localization_projects SET target_language_json = ?, setup_prepared_at = NULL, updated_at = ? WHERE id = ?`)
      .run(JSON.stringify(validLanguage), now, projectId);
  }

  prepareLocalizationSetup(projectId: string) {
    const now = new Date().toISOString();
    const result = this.database.prepare(`
      UPDATE localization_projects SET setup_prepared_at = ?, updated_at = ?
      WHERE id = ? AND target_language_json IS NOT NULL
    `).run(now, now, projectId);
    return result.changes === 1;
  }

  createLocalizationRun(projectId: string, translationMode: TranslationMode = "natural") {
    const base = this.database.prepare(`
      SELECT p.id, p.target_language_json, st.language_json, j.attempt
      FROM localization_projects p
      JOIN source_transcripts st ON st.id = p.source_transcript_id
      JOIN analysis_jobs j ON j.id = p.job_id
      WHERE p.id = ? AND j.status = 'completed'
    `).get(projectId) as DatabaseRow | undefined;
    if (!base?.target_language_json || !base.language_json) throw new Error("localization_input_unavailable");
    const sourceLanguage = targetLanguageSchema.parse(JSON.parse(String(base.language_json)));
    const targetLanguage = targetLanguageSchema.parse(JSON.parse(String(base.target_language_json)));
    const segments = this.effectiveSegments(projectId);
    if (segments.length === 0) throw new Error("source_transcript_unavailable");
    const content = this.database.prepare(`
      SELECT result_json FROM analysis_observations
      WHERE job_id = (SELECT job_id FROM localization_projects WHERE id = ?) AND attempt = ? AND capability = 'content_profile_completed'
    `).get(projectId, Number(base.attempt)) as DatabaseRow | undefined;
    const contentValue = content ? JSON.parse(String(content.result_json)) as { availability?: string; profile?: { primaryType?: string } } : null;
    const snapshot = {
      projectId,
      sourceLanguage,
      targetLanguage,
      contentProfile: contentValue?.availability === "available" ? contentValue.profile?.primaryType ?? null : null,
      segments,
      glossaryTerms: [] as Array<{ source: string; target: string }>,
    };
    const fingerprint = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
    const active = this.database.prepare(`
      SELECT id FROM localization_runs WHERE project_id = ? AND status IN ('queued', 'running') ORDER BY created_at DESC LIMIT 1
    `).get(projectId) as DatabaseRow | undefined;
    if (active) return String(active.id);

    const snapshotRow = this.database.prepare(`SELECT id FROM localization_context_snapshots WHERE project_id = ? AND fingerprint = ?`)
      .get(projectId, fingerprint) as DatabaseRow | undefined;
    const snapshotId = snapshotRow ? String(snapshotRow.id) : randomUUID();
    const runId = randomUUID();
    const transcriptId = randomUUID();
    const now = new Date().toISOString();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      if (!snapshotRow) {
        this.database.prepare(`INSERT INTO localization_context_snapshots (id, project_id, fingerprint, snapshot_json, created_at) VALUES (?, ?, ?, ?, ?)`)
          .run(snapshotId, projectId, fingerprint, JSON.stringify(snapshot), now);
      }
      this.database.prepare(`
        INSERT INTO localization_runs (id, project_id, context_snapshot_id, target_language_json, translation_mode, status, attempt, next_sequence, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'queued', 1, 1, ?, ?)
      `).run(runId, projectId, snapshotId, JSON.stringify(targetLanguage), translationMode, now, now);
      this.database.prepare(`INSERT INTO localized_transcripts (id, run_id, context_snapshot_id, created_at) VALUES (?, ?, ?, ?)`)
        .run(transcriptId, runId, snapshotId, now);
      const insert = this.database.prepare(`
        INSERT INTO localized_segments (id, localized_transcript_id, source_segment_id, sequence, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'pending', ?, ?)
      `);
      for (const segment of segments) insert.run(randomUUID(), transcriptId, segment.id, segment.sequence, now, now);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
    this.appendLocalizationEvent(runId, "localization_run_created", { totalSegments: segments.length }, `${runId}:created`);
    return runId;
  }

  private effectiveSegments(projectId: string): TranslationContextSegment[] {
    const rows = this.database.prepare(`
      SELECT s.*, c.patch_json
      FROM transcript_segments s
      JOIN localization_projects p ON p.source_transcript_id = s.source_transcript_id
      LEFT JOIN transcript_corrections c ON c.id = (
        SELECT latest.id FROM transcript_corrections latest WHERE latest.project_id = p.id AND latest.segment_id = s.id ORDER BY latest.version DESC LIMIT 1
      )
      WHERE p.id = ? ORDER BY s.sequence ASC
    `).all(projectId) as DatabaseRow[];
    return rows.map((row) => {
      const patch = row.patch_json ? transcriptPatchSchema.parse(JSON.parse(String(row.patch_json))) : null;
      return {
        id: String(row.id), sequence: Number(row.sequence), speakerId: patch?.speakerId ?? String(row.speaker_id ?? "speaker_1"),
        text: patch?.text ?? String(row.original_text), startMs: patch?.startMs ?? Number(row.start_ms), endMs: patch?.endMs ?? Number(row.end_ms),
      };
    });
  }

  claimNextLocalizationRun(workerId: string, leaseMs: number): LocalizationRunRecord | null {
    const now = new Date();
    const nowIso = now.toISOString();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const row = this.database.prepare(`
        SELECT id FROM localization_runs WHERE status = 'queued' OR (status = 'running' AND lease_expires_at < ?)
        ORDER BY created_at ASC LIMIT 1
      `).get(nowIso) as DatabaseRow | undefined;
      if (!row) { this.database.exec("COMMIT"); return null; }
      this.database.prepare(`UPDATE localization_runs SET status = 'running', lease_owner = ?, lease_expires_at = ?, updated_at = ? WHERE id = ?`)
        .run(workerId, new Date(now.getTime() + leaseMs).toISOString(), nowIso, String(row.id));
      const run = this.database.prepare(`SELECT * FROM localization_runs WHERE id = ?`).get(String(row.id)) as DatabaseRow;
      this.database.exec("COMMIT");
      return this.mapLocalizationRun(run);
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  renewLocalizationLease(runId: string, workerId: string, leaseMs: number) {
    const now = new Date();
    return this.database.prepare(`UPDATE localization_runs SET lease_expires_at = ?, updated_at = ? WHERE id = ? AND status = 'running' AND lease_owner = ?`)
      .run(new Date(now.getTime() + leaseMs).toISOString(), now.toISOString(), runId, workerId).changes === 1;
  }

  getLocalizationRunInput(runId: string) {
    const run = this.database.prepare(`SELECT * FROM localization_runs WHERE id = ?`).get(runId) as DatabaseRow | undefined;
    if (!run) return null;
    const snapshot = this.database.prepare(`SELECT snapshot_json FROM localization_context_snapshots WHERE id = ?`).get(String(run.context_snapshot_id)) as DatabaseRow | undefined;
    if (!snapshot) return null;
    return { run: this.mapLocalizationRun(run), snapshot: JSON.parse(String(snapshot.snapshot_json)) as {
      projectId: string; sourceLanguage: TargetLanguage; targetLanguage: TargetLanguage; contentProfile: string | null;
      segments: TranslationContextSegment[]; glossaryTerms: Array<{ source: string; target: string }>;
    }, translationMode: String(run.translation_mode) as TranslationMode };
  }

  appendLocalizationEvent(runId: string, type: LocalizationEvent["type"], payload: Record<string, unknown>, idempotencyKey: string): LocalizationEvent {
    const existing = this.database.prepare(`SELECT * FROM localization_events WHERE idempotency_key = ?`).get(idempotencyKey) as DatabaseRow | undefined;
    if (existing) return this.mapLocalizationEvent(existing);
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const run = this.database.prepare(`SELECT next_sequence FROM localization_runs WHERE id = ?`).get(runId) as DatabaseRow | undefined;
      if (!run) throw new Error("localization_run_not_found");
      const eventId = randomUUID();
      const occurredAt = new Date().toISOString();
      const sequence = Number(run.next_sequence);
      this.database.prepare(`INSERT INTO localization_events (event_id, run_id, sequence, type, payload_json, idempotency_key, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(eventId, runId, sequence, type, JSON.stringify(payload), idempotencyKey, occurredAt);
      this.database.prepare(`UPDATE localization_runs SET next_sequence = ?, updated_at = ? WHERE id = ?`).run(sequence + 1, occurredAt, runId);
      this.database.exec("COMMIT");
      return { eventId, runId, sequence, type, payload, occurredAt };
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  listLocalizationEvents(runId: string, afterEventId?: string | null) {
    const after = afterEventId
      ? Number((this.database.prepare(`SELECT sequence FROM localization_events WHERE event_id = ? AND run_id = ?`).get(afterEventId, runId) as DatabaseRow | undefined)?.sequence ?? 0)
      : 0;
    return (this.database.prepare(`SELECT * FROM localization_events WHERE run_id = ? AND sequence > ? ORDER BY sequence ASC`).all(runId, after) as DatabaseRow[])
      .map((row) => this.mapLocalizationEvent(row));
  }

  saveTranslationProviderResult(runId: string, result: TranslationProviderResult) {
    const localized = this.database.prepare(`
      SELECT ls.id FROM localized_segments ls JOIN localized_transcripts lt ON lt.id = ls.localized_transcript_id
      WHERE lt.run_id = ? AND ls.source_segment_id = ?
    `).get(runId, result.sourceSegmentId) as DatabaseRow | undefined;
    if (!localized) throw new Error("localized_segment_not_found");
    const now = new Date().toISOString();
    const existing = this.database.prepare(`SELECT id FROM translation_provider_results WHERE run_id = ? AND source_segment_id = ?`)
      .get(runId, result.sourceSegmentId) as DatabaseRow | undefined;
    if (existing) {
      const current = this.database.prepare(`
        SELECT ls.status, tr.version FROM localized_segments ls
        LEFT JOIN translation_revisions tr ON tr.id = ls.active_revision_id WHERE ls.id = ?
      `).get(String(localized.id)) as DatabaseRow;
      return { status: String(current.status) as "translated" | "failed", revision: current.version === null ? null : Number(current.version) };
    }
    const providerResultId = randomUUID();
    this.database.prepare(`INSERT INTO translation_provider_results (id, run_id, source_segment_id, availability, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(providerResultId, runId, result.sourceSegmentId, result.availability, JSON.stringify(result), now);
    if (result.availability === "available" && result.translatedText && result.timingAssessment) {
      const version = Number((this.database.prepare(`SELECT COALESCE(MAX(version), 0) AS version FROM translation_revisions WHERE localized_segment_id = ?`).get(String(localized.id)) as DatabaseRow).version) + 1;
      const revisionId = randomUUID();
      this.database.prepare(`INSERT INTO translation_revisions (id, localized_segment_id, version, translated_text, origin, provider_result_id, created_at) VALUES (?, ?, ?, ?, 'provider', ?, ?)`)
        .run(revisionId, String(localized.id), version, result.translatedText, providerResultId, now);
      this.database.prepare(`UPDATE localized_segments SET status = 'translated', active_revision_id = ?, timing_json = ?, failure_reason = NULL, updated_at = ? WHERE id = ?`)
        .run(revisionId, JSON.stringify(result.timingAssessment), now, String(localized.id));
      return { status: "translated" as const, revision: version };
    }
    this.database.prepare(`UPDATE localized_segments SET status = 'failed', failure_reason = ?, updated_at = ? WHERE id = ?`)
      .run(result.failureReason ?? "translation_unavailable", now, String(localized.id));
    return { status: "failed" as const, revision: null };
  }

  saveLocalizedSegmentUserRevision(runId: string, sourceSegmentId: string, ownerHash: string, translatedText: string) {
    const text = translatedText.trim();
    if (!text) return null;
    const localized = this.database.prepare(`
      SELECT ls.id, ls.active_revision_id
      FROM localized_segments ls
      JOIN localized_transcripts lt ON lt.id = ls.localized_transcript_id
      JOIN localization_runs r ON r.id = lt.run_id
      JOIN localization_projects p ON p.id = r.project_id
      JOIN analysis_jobs j ON j.id = p.job_id
      WHERE r.id = ? AND ls.source_segment_id = ? AND j.owner_hash = ?
    `).get(runId, sourceSegmentId, ownerHash) as DatabaseRow | undefined;
    if (!localized) return null;
    const now = new Date().toISOString();
    const version = Number((this.database.prepare(`SELECT COALESCE(MAX(version), 0) AS version FROM translation_revisions WHERE localized_segment_id = ?`).get(String(localized.id)) as DatabaseRow).version) + 1;
    const revisionId = randomUUID();
    this.database.prepare(`
      INSERT INTO translation_revisions (id, localized_segment_id, version, translated_text, origin, parent_revision_id, created_at)
      VALUES (?, ?, ?, ?, 'user', ?, ?)
    `).run(revisionId, String(localized.id), version, text, localized.active_revision_id ? String(localized.active_revision_id) : null, now);
    this.database.prepare(`
      UPDATE localized_segments
      SET status = 'translated', active_revision_id = ?, timing_json = NULL, failure_reason = NULL, updated_at = ?
      WHERE id = ?
    `).run(revisionId, now, String(localized.id));
    this.appendLocalizationEvent(runId, "translation_segment_edited", { sourceSegmentId, revision: version }, `${runId}:${sourceSegmentId}:user:${version}`);
    return { sourceSegmentId, revision: version, translatedText: text };
  }

  listTranslationRevisionsForOwner(runId: string, sourceSegmentId: string, ownerHash: string): TranslationRevisionData[] | null {
    const localized = this.database.prepare(`
      SELECT ls.id, ls.active_revision_id
      FROM localized_segments ls
      JOIN localized_transcripts lt ON lt.id = ls.localized_transcript_id
      JOIN localization_runs r ON r.id = lt.run_id
      JOIN localization_projects p ON p.id = r.project_id
      JOIN analysis_jobs j ON j.id = p.job_id
      WHERE r.id = ? AND ls.source_segment_id = ? AND j.owner_hash = ?
    `).get(runId, sourceSegmentId, ownerHash) as DatabaseRow | undefined;
    if (!localized) return null;
    return (this.database.prepare(`
      SELECT id, version, translated_text, origin, created_at
      FROM translation_revisions
      WHERE localized_segment_id = ?
      ORDER BY version DESC
    `).all(String(localized.id)) as DatabaseRow[]).map((row) => ({
      id: String(row.id),
      version: Number(row.version),
      translatedText: String(row.translated_text),
      origin: String(row.origin) as TranslationRevisionData["origin"],
      isActive: String(row.id) === String(localized.active_revision_id),
      createdAt: String(row.created_at),
    }));
  }

  queueTranslationRegeneration(runId: string, sourceSegmentId: string, ownerHash: string) {
    const row = this.database.prepare(`
      SELECT ls.id
      FROM localized_segments ls
      JOIN localized_transcripts lt ON lt.id = ls.localized_transcript_id
      JOIN localization_runs r ON r.id = lt.run_id
      JOIN localization_projects p ON p.id = r.project_id
      JOIN analysis_jobs j ON j.id = p.job_id
      WHERE r.id = ? AND ls.source_segment_id = ? AND j.owner_hash = ?
    `).get(runId, sourceSegmentId, ownerHash) as DatabaseRow | undefined;
    if (!row) return null;
    const now = new Date().toISOString();
    const jobId = randomUUID();
    this.database.prepare(`
      INSERT INTO translation_regeneration_jobs (id, run_id, source_segment_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'queued', ?, ?)
    `).run(jobId, runId, sourceSegmentId, now, now);
    this.appendLocalizationEvent(runId, "translation_segment_regeneration_queued", { sourceSegmentId, jobId }, `${jobId}:queued`);
    return jobId;
  }

  claimNextTranslationRegenerationJob(workerId: string, leaseMs: number): TranslationRegenerationJobRecord | null {
    const now = new Date();
    const nowIso = now.toISOString();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const row = this.database.prepare(`
        SELECT * FROM translation_regeneration_jobs
        WHERE status = 'queued' OR (status = 'running' AND lease_expires_at < ?)
        ORDER BY created_at ASC LIMIT 1
      `).get(nowIso) as DatabaseRow | undefined;
      if (!row) { this.database.exec("COMMIT"); return null; }
      this.database.prepare(`
        UPDATE translation_regeneration_jobs SET status = 'running', lease_owner = ?, lease_expires_at = ?, updated_at = ? WHERE id = ?
      `).run(workerId, new Date(now.getTime() + leaseMs).toISOString(), nowIso, String(row.id));
      this.database.exec("COMMIT");
      return { id: String(row.id), runId: String(row.run_id), sourceSegmentId: String(row.source_segment_id), leaseOwner: workerId };
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  renewTranslationRegenerationLease(jobId: string, workerId: string, leaseMs: number) {
    const now = new Date();
    return this.database.prepare(`
      UPDATE translation_regeneration_jobs SET lease_expires_at = ?, updated_at = ?
      WHERE id = ? AND status = 'running' AND lease_owner = ?
    `).run(new Date(now.getTime() + leaseMs).toISOString(), now.toISOString(), jobId, workerId).changes === 1;
  }

  saveTranslationRegenerationResult(jobId: string, result: TranslationProviderResult) {
    const job = this.database.prepare(`SELECT * FROM translation_regeneration_jobs WHERE id = ?`).get(jobId) as DatabaseRow | undefined;
    if (!job) throw new Error("translation_regeneration_job_not_found");
    if (String(job.status) === "completed") return { status: "completed" as const };
    const localized = this.database.prepare(`
      SELECT ls.id, ls.active_revision_id, active.origin AS active_origin
      FROM localized_segments ls
      JOIN localized_transcripts lt ON lt.id = ls.localized_transcript_id
      LEFT JOIN translation_revisions active ON active.id = ls.active_revision_id
      WHERE lt.run_id = ? AND ls.source_segment_id = ?
    `).get(String(job.run_id), String(job.source_segment_id)) as DatabaseRow | undefined;
    if (!localized) throw new Error("localized_segment_not_found");
    const now = new Date().toISOString();
    if (result.availability === "available" && result.translatedText && result.timingAssessment) {
      const version = Number((this.database.prepare(`SELECT COALESCE(MAX(version), 0) AS version FROM translation_revisions WHERE localized_segment_id = ?`).get(String(localized.id)) as DatabaseRow).version) + 1;
      const revisionId = randomUUID();
      this.database.prepare(`
        INSERT INTO translation_revisions (id, localized_segment_id, version, translated_text, origin, parent_revision_id, created_at)
        VALUES (?, ?, ?, ?, 'provider', ?, ?)
      `).run(revisionId, String(localized.id), version, result.translatedText, localized.active_revision_id ? String(localized.active_revision_id) : null, now);
      const activeOrigin = localized.active_origin ? String(localized.active_origin) : null;
      if (activeOrigin !== "user") {
        this.database.prepare(`
          UPDATE localized_segments SET status = 'translated', active_revision_id = ?, timing_json = ?, failure_reason = NULL, updated_at = ?
          WHERE id = ?
        `).run(revisionId, JSON.stringify(result.timingAssessment), now, String(localized.id));
      }
      this.database.prepare(`
        UPDATE translation_regeneration_jobs
        SET status = 'completed', result_json = ?, lease_owner = NULL, lease_expires_at = NULL, updated_at = ?
        WHERE id = ?
      `).run(JSON.stringify(result), now, jobId);
      this.appendLocalizationEvent(String(job.run_id), "translation_segment_regenerated", {
        sourceSegmentId: String(job.source_segment_id),
        jobId,
        revision: version,
        activeRevisionPreserved: activeOrigin === "user",
      }, `${jobId}:completed`);
      return { status: "completed" as const, revision: version, activeRevisionPreserved: activeOrigin === "user" };
    }
    this.database.prepare(`
      UPDATE translation_regeneration_jobs
      SET status = 'failed', result_json = ?, last_error_code = ?, lease_owner = NULL, lease_expires_at = NULL, updated_at = ?
      WHERE id = ?
    `).run(JSON.stringify(result), result.failureReason ?? "translation_unavailable", now, jobId);
    this.appendLocalizationEvent(String(job.run_id), "translation_segment_regeneration_failed", {
      sourceSegmentId: String(job.source_segment_id),
      jobId,
      reason: result.failureReason ?? "translation_unavailable",
    }, `${jobId}:failed`);
    return { status: "failed" as const };
  }

  failTranslationRegenerationJob(jobId: string, errorCode: string) {
    const job = this.database.prepare(`SELECT run_id, source_segment_id FROM translation_regeneration_jobs WHERE id = ?`).get(jobId) as DatabaseRow | undefined;
    const now = new Date().toISOString();
    this.database.prepare(`
      UPDATE translation_regeneration_jobs
      SET status = 'failed', last_error_code = ?, lease_owner = NULL, lease_expires_at = NULL, updated_at = ?
      WHERE id = ?
    `).run(errorCode, now, jobId);
    if (job) this.appendLocalizationEvent(String(job.run_id), "translation_segment_regeneration_failed", {
      sourceSegmentId: String(job.source_segment_id), jobId, reason: errorCode,
    }, `${jobId}:failed`);
  }

  finishLocalizationRun(runId: string, status: "completed" | "partial" | "failed", errorCode?: string) {
    this.database.prepare(`UPDATE localization_runs SET status = ?, last_error_code = ?, lease_owner = NULL, lease_expires_at = NULL, updated_at = ? WHERE id = ?`)
      .run(status, errorCode ?? null, new Date().toISOString(), runId);
  }

  getLatestLocalizationForProject(projectId: string): LocalizationRunData | null {
    const run = this.database.prepare(`SELECT * FROM localization_runs WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`).get(projectId) as DatabaseRow | undefined;
    return run ? this.getLocalizationRunData(String(run.id)) : null;
  }

  getLocalizationRunForOwner(runId: string, ownerHash: string) {
    const row = this.database.prepare(`
      SELECT r.id FROM localization_runs r JOIN localization_projects p ON p.id = r.project_id
      JOIN analysis_jobs j ON j.id = p.job_id WHERE r.id = ? AND j.owner_hash = ?
    `).get(runId, ownerHash) as DatabaseRow | undefined;
    return row ? this.getLocalizationRunData(runId) : null;
  }

  queueVideoRender(runId: string, ownerHash: string) {
    const run = this.database.prepare(`
      SELECT r.id FROM localization_runs r
      JOIN localization_projects p ON p.id = r.project_id
      JOIN analysis_jobs j ON j.id = p.job_id
      WHERE r.id = ? AND j.owner_hash = ? AND r.status = 'completed'
      AND NOT EXISTS (
        SELECT 1 FROM localized_segments ls JOIN localized_transcripts lt ON lt.id = ls.localized_transcript_id
        WHERE lt.run_id = r.id AND (ls.status != 'translated' OR ls.active_revision_id IS NULL)
      )
    `).get(runId, ownerHash) as DatabaseRow | undefined;
    if (!run) return null;
    const existing = this.database.prepare(`SELECT id, status FROM video_render_jobs WHERE run_id = ? AND renderer_version = ? ORDER BY created_at DESC LIMIT 1`).get(runId, currentVideoRendererVersion) as DatabaseRow | undefined;
    if (existing && ["queued", "running", "completed"].includes(String(existing.status))) return String(existing.id);
    const id = randomUUID();
    const outputPath = path.join(serverConfig.storageRoot, "renders", id, "localized.mp4");
    const now = new Date().toISOString();
    this.database.prepare(`INSERT INTO video_render_jobs (id, run_id, status, output_path, renderer_version, created_at, updated_at) VALUES (?, ?, 'queued', ?, ?, ?, ?)`)
      .run(id, runId, outputPath, currentVideoRendererVersion, now, now);
    return id;
  }

  claimNextVideoRender(workerId: string, leaseMs: number): VideoRenderJobRecord | null {
    const now = new Date();
    const nowIso = now.toISOString();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const row = this.database.prepare(`
        SELECT vr.*, u.source_path FROM video_render_jobs vr
        JOIN localization_runs r ON r.id = vr.run_id
        JOIN localization_projects p ON p.id = r.project_id
        JOIN analysis_jobs j ON j.id = p.job_id
        JOIN upload_sessions u ON u.id = j.upload_id
        WHERE vr.status = 'queued' OR (vr.status = 'running' AND vr.lease_expires_at < ?)
        ORDER BY vr.created_at ASC LIMIT 1
      `).get(nowIso) as DatabaseRow | undefined;
      if (!row) { this.database.exec("COMMIT"); return null; }
      this.database.prepare(`UPDATE video_render_jobs SET status = 'running', lease_owner = ?, lease_expires_at = ?, updated_at = ? WHERE id = ?`)
        .run(workerId, new Date(now.getTime() + leaseMs).toISOString(), nowIso, String(row.id));
      const segments = (this.database.prepare(`
        SELECT ts.start_ms, ts.end_ms, ts.speaker_id, ts.word_timestamps_json, tr.translated_text, c.patch_json FROM localized_segments ls
        JOIN localized_transcripts lt ON lt.id = ls.localized_transcript_id
        JOIN transcript_segments ts ON ts.id = ls.source_segment_id
        JOIN translation_revisions tr ON tr.id = ls.active_revision_id
        JOIN localization_runs r ON r.id = lt.run_id
        LEFT JOIN transcript_corrections c ON c.id = (
          SELECT latest.id FROM transcript_corrections latest
          WHERE latest.project_id = r.project_id AND latest.segment_id = ts.id
          ORDER BY latest.version DESC LIMIT 1
        )
        WHERE lt.run_id = ? ORDER BY ls.sequence ASC
      `).all(String(row.run_id)) as DatabaseRow[]).map((segment) => {
        const patch = segment.patch_json ? transcriptPatchSchema.parse(JSON.parse(String(segment.patch_json))) : null;
        return {
          startMs: patch?.startMs ?? Number(segment.start_ms),
          endMs: patch?.endMs ?? Number(segment.end_ms),
          speakerId: patch?.speakerId ?? (segment.speaker_id ? String(segment.speaker_id) : undefined),
          words: segment.word_timestamps_json ? (JSON.parse(String(segment.word_timestamps_json)) as Array<{ text: string; startSeconds: number; endSeconds: number }>).map((word) => ({
            text: word.text, startMs: Math.round(word.startSeconds * 1000), endMs: Math.round(word.endSeconds * 1000),
          })) : undefined,
          text: String(segment.translated_text),
        };
      });
      this.database.exec("COMMIT");
      return { id: String(row.id), runId: String(row.run_id), sourcePath: String(row.source_path), outputPath: String(row.output_path), leaseOwner: workerId, segments };
    } catch (error) { this.database.exec("ROLLBACK"); throw error; }
  }

  finishVideoRender(renderId: string, workerId: string) {
    return this.database.prepare(`UPDATE video_render_jobs SET status = 'completed', lease_owner = NULL, lease_expires_at = NULL, last_error_code = NULL, updated_at = ? WHERE id = ? AND lease_owner = ?`)
      .run(new Date().toISOString(), renderId, workerId).changes === 1;
  }

  failVideoRender(renderId: string, workerId: string, errorCode: string) {
    this.database.prepare(`UPDATE video_render_jobs SET status = 'failed', lease_owner = NULL, lease_expires_at = NULL, last_error_code = ?, updated_at = ? WHERE id = ? AND lease_owner = ?`)
      .run(errorCode, new Date().toISOString(), renderId, workerId);
  }

  getVideoRenderForOwner(renderId: string, ownerHash: string) {
    const row = this.database.prepare(`
      SELECT vr.* FROM video_render_jobs vr JOIN localization_runs r ON r.id = vr.run_id
      JOIN localization_projects p ON p.id = r.project_id JOIN analysis_jobs j ON j.id = p.job_id
      WHERE vr.id = ? AND j.owner_hash = ?
    `).get(renderId, ownerHash) as DatabaseRow | undefined;
    return row ? { id: String(row.id), runId: String(row.run_id), status: String(row.status) as "queued" | "running" | "completed" | "failed", outputPath: String(row.output_path), failureReason: row.last_error_code ? String(row.last_error_code) : null } : null;
  }

  private getLocalizationRunData(runId: string): LocalizationRunData {
    const run = this.database.prepare(`SELECT * FROM localization_runs WHERE id = ?`).get(runId) as DatabaseRow;
    const rows = this.database.prepare(`
      SELECT ls.source_segment_id, ls.status, ls.timing_json, ls.failure_reason, tr.translated_text, tr.version, tr.origin,
        (SELECT COUNT(*) FROM translation_revisions all_revisions WHERE all_revisions.localized_segment_id = ls.id) AS revision_count
      FROM localized_segments ls JOIN localized_transcripts lt ON lt.id = ls.localized_transcript_id
      LEFT JOIN translation_revisions tr ON tr.id = ls.active_revision_id
      WHERE lt.run_id = ? ORDER BY ls.sequence ASC
    `).all(runId) as DatabaseRow[];
    const render = this.database.prepare(`SELECT id, status, last_error_code FROM video_render_jobs WHERE run_id = ? AND renderer_version = ? ORDER BY created_at DESC LIMIT 1`).get(runId, currentVideoRendererVersion) as DatabaseRow | undefined;
    return {
      id: runId, status: translationRunStatusSchema.parse(String(run.status)), targetLanguage: targetLanguageSchema.parse(JSON.parse(String(run.target_language_json))),
      translatedCount: rows.filter((row) => String(row.status) === "translated").length, totalCount: rows.length,
      segments: rows.map((row): LocalizedSegmentData => ({ sourceSegmentId: String(row.source_segment_id), translatedText: row.translated_text ? String(row.translated_text) : null,
        status: String(row.status) as LocalizedSegmentData["status"], revision: row.version === null ? null : Number(row.version),
        revisionOrigin: row.origin ? String(row.origin) as LocalizedSegmentData["revisionOrigin"] : null,
        revisionCount: Number(row.revision_count ?? 0),
        timing: row.timing_json ? JSON.parse(String(row.timing_json)) : null, failureReason: row.failure_reason ? String(row.failure_reason) : null })),
      render: render ? { id: String(render.id), status: String(render.status) as "queued" | "running" | "completed" | "failed", failureReason: render.last_error_code ? String(render.last_error_code) : null,
        previewUrl: String(render.status) === "completed" ? `/api/video-renders/${String(render.id)}/content` : null,
        downloadUrl: String(render.status) === "completed" ? `/api/video-renders/${String(render.id)}/content?download=1` : null } : null,
    };
  }

  getLocalizationPlan(jobId: string, attempt: number, engineVersion: string) {
    const row = this.database.prepare(`
      SELECT plan_json FROM localization_plans
      WHERE job_id = ? AND attempt = ? AND engine_version = ?
    `).get(jobId, attempt, engineVersion) as DatabaseRow | undefined;
    return row ? localizationPlanSchema.parse(JSON.parse(String(row.plan_json))) : null;
  }

  completeJob(jobId: string, readiness: "ready" | "limited" | "blocked") {
    const now = new Date().toISOString();
    this.database
      .prepare(`
        UPDATE analysis_jobs
        SET status = 'completed', readiness = ?, lease_owner = NULL,
            lease_expires_at = NULL, updated_at = ?
        WHERE id = ?
      `)
      .run(readiness, now, jobId);
  }

  failJob(jobId: string, errorCode: string) {
    const now = new Date().toISOString();
    this.database
      .prepare(`
        UPDATE analysis_jobs
        SET status = 'failed', last_error_code = ?, lease_owner = NULL,
            lease_expires_at = NULL, updated_at = ?
        WHERE id = ?
      `)
      .run(errorCode, now, jobId);
  }

  retryJob(jobId: string, ownerHash: string) {
    const now = new Date().toISOString();
    const result = this.database
      .prepare(`
        UPDATE analysis_jobs
        SET status = 'queued', attempt = attempt + 1, readiness = NULL,
            lease_owner = NULL, lease_expires_at = NULL, last_error_code = NULL, updated_at = ?
        WHERE id = ? AND owner_hash = ? AND status IN ('failed', 'completed')
      `)
      .run(now, jobId, ownerHash);
    return result.changes === 1;
  }

  private mapJob(row: DatabaseRow): AnalysisJobRecord {
    return {
      id: String(row.id),
      uploadId: String(row.upload_id),
      ownerHash: String(row.owner_hash),
      status: String(row.status) as AnalysisJobRecord["status"],
      attempt: Number(row.attempt),
      readiness: row.readiness ? (String(row.readiness) as AnalysisJobRecord["readiness"]) : null,
      sourcePath: String(row.source_path),
      fileName: String(row.file_name),
      mimeType: String(row.verified_mime),
      sizeBytes: Number(row.actual_size),
      sha256: String(row.sha256),
    };
  }

  private mapLocalizationRun(row: DatabaseRow): LocalizationRunRecord {
    return {
      id: String(row.id),
      projectId: String(row.project_id),
      contextSnapshotId: String(row.context_snapshot_id),
      status: translationRunStatusSchema.parse(String(row.status)),
      attempt: Number(row.attempt),
    };
  }

  private mapLocalizationEvent(row: DatabaseRow): LocalizationEvent {
    return {
      eventId: String(row.event_id), runId: String(row.run_id), sequence: Number(row.sequence),
      type: String(row.type) as LocalizationEvent["type"],
      payload: JSON.parse(String(row.payload_json)) as Record<string, unknown>, occurredAt: String(row.occurred_at),
    };
  }

  private mapEvent(row: DatabaseRow) {
    return parseAnalysisEvent({
      schemaVersion: 1,
      eventId: String(row.event_id),
      jobId: String(row.job_id),
      uploadId: String(row.upload_id),
      attempt: Number(row.attempt),
      sequence: Number(row.sequence),
      type: String(row.type),
      occurredAt: String(row.occurred_at),
      payload: JSON.parse(String(row.payload_json)) as unknown,
    });
  }
}

let store: AnalysisStore | undefined;

export function getAnalysisStore() {
  store ??= new AnalysisStore();
  return store;
}

export function closeAnalysisStore() {
  store?.close();
  store = undefined;
}
