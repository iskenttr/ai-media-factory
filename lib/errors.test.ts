import { describe, expect, it } from "vitest";

import {
  AppError,
  createAnalysisError,
  createProcessingError,
  createStorageError,
  createUploadError,
  ErrorCategory,
  ErrorCodes,
  ErrorSeverity,
  isAppError,
  isRecoverable,
  formatErrorForLog,
  getErrorCategory,
  ProcessingError,
  StorageError,
  UploadError,
} from "./errors";

describe("Structured Error System", () => {
  describe("ErrorCodes", () => {
    it("has all expected error codes defined", () => {
      expect(ErrorCodes.UPLOAD_SIZE_EXCEEDED).toBe("upload_size_exceeded");
      expect(ErrorCodes.ANALYSIS_JOB_NOT_FOUND).toBe("analysis_job_not_found");
      expect(ErrorCodes.PROVIDER_FAILURE).toBe("provider_failure");
      expect(ErrorCodes.GEMINI_RESPONSE_EMPTY).toBe("gemini_response_empty");
    });

    it("error codes are string literals", () => {
      const code: (typeof ErrorCodes)[keyof typeof ErrorCodes] = ErrorCodes.UPLOAD_SIZE_EXCEEDED;
      expect(typeof code).toBe("string");
    });
  });

  describe("AppError base class", () => {
    it("creates error with all properties", () => {
      const error = new AppError(
        ErrorCodes.ANALYSIS_JOB_NOT_FOUND,
        "Job not found",
        ErrorSeverity.ACTION_REQUIRED,
        ErrorCategory.STORAGE,
        { jobId: "123" },
      );

      expect(error.code).toBe("analysis_job_not_found");
      expect(error.message).toBe("Job not found");
      expect(error.severity).toBe(ErrorSeverity.ACTION_REQUIRED);
      expect(error.context).toEqual({ jobId: "123" });
      expect(error.name).toBe("AppError");
    });

    it("has sensible defaults", () => {
      const error = new AppError(ErrorCodes.PROVIDER_FAILURE, "Provider failed");

      expect(error.severity).toBe(ErrorSeverity.RECOVERABLE);
      expect(error.category).toBe(ErrorCategory.UNKNOWN);
      expect(error.context).toBeUndefined();
    });

    it("toJSON serializes correctly", () => {
      const error = new AppError(ErrorCodes.UPLOAD_SIZE_EXCEEDED, "Too large", ErrorSeverity.ACTION_REQUIRED, ErrorCategory.UPLOAD);
      const json = error.toJSON();

      expect(json.code).toBe("upload_size_exceeded");
      expect(json.severity).toBe("action_required");
      expect(json.context).toBeUndefined();
    });

    it("captures stack trace", () => {
      const error = new AppError(ErrorCodes.PROVIDER_FAILURE, "Internal");
      expect(error.stack).toBeDefined();
    });
  });

  describe("UploadError", () => {
    it("creates upload-specific error", () => {
      const error = new UploadError(ErrorCodes.UNSUPPORTED_MEDIA, "Format not supported", { format: "webp" });

      expect(error.code).toBe("unsupported_media");
      expect(error.category).toBe("upload");
      expect(error.severity).toBe(ErrorSeverity.ACTION_REQUIRED);
      expect(error.context).toEqual({ format: "webp" });
    });

    it("has correct name", () => {
      const error = new UploadError(ErrorCodes.MIME_TYPE_MISMATCH, "Wrong type");
      expect(error.name).toBe("UploadError");
    });
  });

  describe("StorageError", () => {
    it("creates storage-specific error", () => {
      const error = new StorageError(ErrorCodes.ANALYSIS_JOB_NOT_FOUND, "Job not found");

      expect(error.code).toBe("analysis_job_not_found");
      expect(error.category).toBe("storage");
      expect(error.severity).toBe(ErrorSeverity.INTERNAL);
    });
  });

  describe("ProcessingError", () => {
    it("creates processing error with custom severity", () => {
      const error = new ProcessingError(
        ErrorCodes.SUBTITLE_QUALITY_GATE_FAILED,
        "Quality too low",
        ErrorSeverity.CRITICAL,
        { score: 45 },
      );

      expect(error.code).toBe("subtitle_quality_gate_failed");
      expect(error.severity).toBe(ErrorSeverity.CRITICAL);
      expect(error.context).toEqual({ score: 45 });
    });
  });

  describe("createUploadError factory", () => {
    it("creates UploadError with predefined message", () => {
      const error = createUploadError(ErrorCodes.UPLOAD_SIZE_EXCEEDED);

      expect(error).toBeInstanceOf(UploadError);
      expect(error.message).toBe("Upload exceeds maximum allowed size");
    });

    it("preserves custom context", () => {
      const error = createUploadError(ErrorCodes.UPLOAD_SIZE_EXCEEDED, { maxSize: 100_000_000 });

      expect(error.context).toEqual({ maxSize: 100_000_000 });
    });
  });

  describe("createStorageError factory", () => {
    it("creates StorageError with predefined message", () => {
      const error = createStorageError(ErrorCodes.LOCALIZATION_RUN_NOT_FOUND);

      expect(error).toBeInstanceOf(StorageError);
      expect(error.message).toBe("Localization run not found");
    });
  });

  describe("createProcessingError factory", () => {
    it("creates ProcessingError with optional message override", () => {
      const error = createProcessingError(
        ErrorCodes.GEMINI_RESPONSE_EMPTY,
        "Gemini returned no content for frame 5",
        ErrorSeverity.RECOVERABLE,
      );

      expect(error).toBeInstanceOf(ProcessingError);
      expect(error.message).toBe("Gemini returned no content for frame 5");
    });

    it("defaults to recoverable severity", () => {
      const error = createProcessingError(ErrorCodes.SUBTITLE_PREFLIGHT_FAILED);

      expect(error.severity).toBe(ErrorSeverity.RECOVERABLE);
    });
  });

  describe("createAnalysisError factory", () => {
    it("creates AnalysisError", () => {
      const error = createAnalysisError(ErrorCodes.MISSING_TERMINAL_OBSERVATION, "Missing: speech_quality", {
        type: "speech_quality",
      });

      expect(error.code).toBe("missing_terminal_observation");
      expect(error.context).toEqual({ type: "speech_quality" });
    });
  });

  describe("Error Guard Functions", () => {
    it("isAppError returns true for AppError instances", () => {
      expect(isAppError(new AppError(ErrorCodes.PROVIDER_FAILURE, "Test"))).toBe(true);
      expect(isAppError(new UploadError(ErrorCodes.MIME_TYPE_MISMATCH, "Test"))).toBe(true);
    });

    it("isAppError returns false for plain errors", () => {
      expect(isAppError(new Error("test"))).toBe(false);
      expect(isAppError("not an error")).toBe(false);
      expect(isAppError(null)).toBe(false);
    });

    it("isRecoverable checks severity", () => {
      const recoverable = new ProcessingError(ErrorCodes.PROVIDER_FAILURE, "Retryable");
      const critical = new ProcessingError(ErrorCodes.SUBTITLE_QUALITY_GATE_FAILED, "Fatal", ErrorSeverity.CRITICAL);

      expect(isRecoverable(recoverable)).toBe(true);
      expect(isRecoverable(critical)).toBe(false);
    });

    it("isRecoverable defaults to true for unknown errors", () => {
      expect(isRecoverable(new Error("unknown"))).toBe(true);
      expect(isRecoverable("string error")).toBe(true);
    });

    it("getErrorCategory returns correct category", () => {
      expect(getErrorCategory(new UploadError(ErrorCodes.MIME_TYPE_MISMATCH, "Test"))).toBe("upload");
      expect(getErrorCategory(new StorageError(ErrorCodes.ANALYSIS_JOB_NOT_FOUND, "Test"))).toBe("storage");
    });

    it("getErrorCategory returns unknown for non-AppErrors", () => {
      expect(getErrorCategory(new Error("test"))).toBe("unknown");
    });
  });

  describe("formatErrorForLog", () => {
    it("formats AppError with category and context", () => {
      const error = new AppError(ErrorCodes.UPLOAD_SIZE_EXCEEDED, "Too large", ErrorSeverity.ACTION_REQUIRED, ErrorCategory.UPLOAD);
      const formatted = formatErrorForLog(error);

      expect(formatted).toContain("[upload]");
      expect(formatted).toContain("upload_size_exceeded");
      expect(formatted).toContain("Too large");
    });

    it("formats plain Error", () => {
      const error = new Error("Something went wrong");
      const formatted = formatErrorForLog(error);

      expect(formatted).toContain("Error");
      expect(formatted).toContain("Something went wrong");
    });

    it("formats string values", () => {
      const formatted = formatErrorForLog("simple string error");
      expect(formatted).toBe("simple string error");
    });
  });

  describe("Error inheritance", () => {
    it("UploadError is instance of AppError", () => {
      const error = new UploadError(ErrorCodes.UNSUPPORTED_MEDIA, "Not supported");
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(Error);
    });

    it("StorageError is instance of AppError", () => {
      const error = new StorageError(ErrorCodes.ANALYSIS_JOB_NOT_FOUND, "Not found");
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(Error);
    });

    it("ProcessingError is instance of AppError", () => {
      const error = new ProcessingError(ErrorCodes.SUBTITLE_QUALITY_GATE_FAILED, "Failed");
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(Error);
    });
  });
});
