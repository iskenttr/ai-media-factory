/**
 * Structured Error Classification System
 * Provides typed, classifiable errors for different system domains.
 */

// ============================================================================
// Error Code Definitions
// ============================================================================

export const ErrorCodes = {
  // Upload & Media errors (1xxx)
  UPLOAD_SIZE_EXCEEDED: "upload_size_exceeded",
  UPLOAD_SIZE_MISMATCH: "upload_size_mismatch",
  UNSUPPORTED_MEDIA: "unsupported_media",
  MIME_TYPE_MISMATCH: "mime_type_mismatch",
  VIDEO_DIMENSIONS_UNAVAILABLE: "video_dimensions_unavailable",
  AUDIO_SIGNAL_UNAVAILABLE: "audio_signal_unavailable",
  VIDEO_DURATION_UNAVAILABLE: "video_duration_unavailable",
  NO_READABLE_VIDEO_STREAM: "no_readable_video_stream",

  // Storage & Database errors (2xxx)
  UPLOAD_SESSION_NOT_FOUND: "upload_session_not_found",
  ANALYSIS_JOB_NOT_FOUND: "analysis_job_not_found",
  LOCALIZATION_RUN_NOT_FOUND: "localization_run_not_found",
  LOCALIZED_SEGMENT_NOT_FOUND: "localized_segment_not_found",
  REGENERATION_JOB_NOT_FOUND: "translation_regeneration_job_not_found",
  SOURCE_TRANSCRIPT_UNAVAILABLE: "source_transcript_unavailable",
  LOCALIZATION_INPUT_UNAVAILABLE: "localization_input_unavailable",

  // Provider errors (3xxx)
  PROVIDER_FAILURE: "provider_failure",
  MODEL_NOT_CONFIGURED: "model_not_configured",
  INSUFFICIENT_SPEECH: "insufficient_speech",
  EMPTY_TRANSLATION_RESULT: "empty_translation_result",
  GEMINI_FRAME_LIMIT_EXCEEDED: "gemini_frame_limit_exceeded",
  GEMINI_DAILY_BUDGET_EXCEEDED: "gemini_daily_budget_exceeded",
  GEMINI_REQUEST_FAILED: "gemini_request_failed",
  GEMINI_RESPONSE_EMPTY: "gemini_response_empty",

  // Processing errors (4xxx)
  LOCALIZATION_RUN_INPUT_UNAVAILABLE: "localization_run_input_unavailable",
  SUBTITLE_PREFLIGHT_FAILED: "subtitle_preflight_failed",
  SUBTITLE_QUALITY_GATE_FAILED: "subtitle_quality_gate_failed",
  SUBTITLE_AV_DURATION_MISMATCH: "subtitle_av_duration_mismatch",
  LOCALIZED_SUBTITLES_UNAVAILABLE: "localized_subtitles_unavailable",
  VISUAL_DIFF_SHAPE_MISMATCH: "visual_diff_shape_mismatch",

  // Analysis errors (5xxx)
  MISSING_TERMINAL_OBSERVATION: "missing_terminal_observation",
  SNAPSHOT_WITHOUT_EVENTS: "snapshot_without_events",
  ANALYSIS_JOB_INPUT_UNAVAILABLE: "analysis_job_input_unavailable",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

// ============================================================================
// Error Severity Levels
// ============================================================================

export enum ErrorSeverity {
  /** Recoverable with retry or fallback */
  RECOVERABLE = "recoverable",
  /** Requires user action or external fix */
  ACTION_REQUIRED = "action_required",
  /** System bug or invalid state */
  INTERNAL = "internal",
  /** Critical - may require shutdown or manual intervention */
  CRITICAL = "critical",
}

// ============================================================================
// Error Categories
// ============================================================================

export enum ErrorCategory {
  UPLOAD = "upload",
  STORAGE = "storage",
  PROVIDER = "provider",
  PROCESSING = "processing",
  ANALYSIS = "analysis",
  VALIDATION = "validation",
  UNKNOWN = "unknown",
}

// ============================================================================
// Base Application Error
// ============================================================================

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly severity: ErrorSeverity = ErrorSeverity.RECOVERABLE,
    public readonly category: ErrorCategory = ErrorCategory.UNKNOWN,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
    // Maintains proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      severity: this.severity,
      category: this.category,
      context: this.context,
    };
  }
}

// ============================================================================
// Domain-Specific Error Classes
// ============================================================================

export class UploadError extends AppError {
  constructor(code: ErrorCode, message: string, context?: Record<string, unknown>) {
    super(code, message, ErrorSeverity.ACTION_REQUIRED, ErrorCategory.UPLOAD, context);
    this.name = "UploadError";
  }
}

export class StorageError extends AppError {
  constructor(code: ErrorCode, message: string, context?: Record<string, unknown>) {
    super(code, message, ErrorSeverity.INTERNAL, ErrorCategory.STORAGE, context);
    this.name = "StorageError";
  }
}

export class ProcessingError extends AppError {
  constructor(code: ErrorCode, message: string, severity: ErrorSeverity = ErrorSeverity.RECOVERABLE, context?: Record<string, unknown>) {
    super(code, message, severity, ErrorCategory.PROCESSING, context);
    this.name = "ProcessingError";
  }
}

export class AnalysisError extends AppError {
  constructor(code: ErrorCode, message: string, context?: Record<string, unknown>) {
    super(code, message, ErrorSeverity.INTERNAL, ErrorCategory.ANALYSIS, context);
    this.name = "AnalysisError";
  }
}

// ============================================================================
// Error Factory Functions
// ============================================================================

export function createUploadError(code: ErrorCode, context?: Record<string, unknown>): UploadError {
  const messages: Record<string, string> = {
    [ErrorCodes.UPLOAD_SIZE_EXCEEDED]: "Upload exceeds maximum allowed size",
    [ErrorCodes.UPLOAD_SIZE_MISMATCH]: "Upload actual size does not match declared size",
    [ErrorCodes.UNSUPPORTED_MEDIA]: "Media format is not supported",
    [ErrorCodes.MIME_TYPE_MISMATCH]: "File MIME type does not match expected type",
    [ErrorCodes.VIDEO_DIMENSIONS_UNAVAILABLE]: "Could not determine video dimensions",
    [ErrorCodes.AUDIO_SIGNAL_UNAVAILABLE]: "Could not measure audio signal",
    [ErrorCodes.VIDEO_DURATION_UNAVAILABLE]: "Could not verify video duration",
    [ErrorCodes.NO_READABLE_VIDEO_STREAM]: "Video does not contain a readable stream",
  };
  return new UploadError(code, messages[code] ?? code, context);
}

export function createStorageError(code: ErrorCode, context?: Record<string, unknown>): StorageError {
  const messages: Record<string, string> = {
    [ErrorCodes.UPLOAD_SESSION_NOT_FOUND]: "Upload session not found",
    [ErrorCodes.ANALYSIS_JOB_NOT_FOUND]: "Analysis job not found",
    [ErrorCodes.LOCALIZATION_RUN_NOT_FOUND]: "Localization run not found",
    [ErrorCodes.LOCALIZED_SEGMENT_NOT_FOUND]: "Localized segment not found",
    [ErrorCodes.REGENERATION_JOB_NOT_FOUND]: "Regeneration job not found",
    [ErrorCodes.SOURCE_TRANSCRIPT_UNAVAILABLE]: "Source transcript is not available",
    [ErrorCodes.LOCALIZATION_INPUT_UNAVAILABLE]: "Localization input is not available",
  };
  return new StorageError(code, messages[code] ?? code, context);
}

export function createProcessingError(
  code: ErrorCode,
  message?: string,
  severity: ErrorSeverity = ErrorSeverity.RECOVERABLE,
  context?: Record<string, unknown>,
): ProcessingError {
  return new ProcessingError(code, message ?? code, severity, context);
}

export function createAnalysisError(code: ErrorCode, message: string, context?: Record<string, unknown>): AnalysisError {
  return new AnalysisError(code, message, context);
}

// ============================================================================
// Error Guard Functions
// ============================================================================

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function isRecoverable(error: unknown): boolean {
  if (error instanceof AppError) {
    return error.severity === ErrorSeverity.RECOVERABLE;
  }
  return true; // Unknown errors are assumed recoverable
}

export function getErrorCategory(error: unknown): ErrorCategory {
  if (error instanceof AppError) {
    return error.category;
  }
  return ErrorCategory.UNKNOWN;
}

// ============================================================================
// Error Logging Helpers
// ============================================================================

export function formatErrorForLog(error: unknown): string {
  if (error instanceof AppError) {
    return `[${error.category}] ${error.code}: ${error.message}${error.context ? ` (${JSON.stringify(error.context)})` : ""}`;
  }
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}
