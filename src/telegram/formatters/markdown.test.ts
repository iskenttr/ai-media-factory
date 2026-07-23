import { describe, it, expect } from "vitest";
import {
  formatStart,
  formatHelp,
  formatStatus,
  formatSystem,
  formatQueue,
  formatToday,
  formatErrors,
  formatCost,
  formatLogs,
  formatVersion,
  formatUnauthorized,
} from "./markdown";

describe("markdown formatters", () => {
  describe("formatStart", () => {
    it("returns welcome message with markdown", () => {
      const result = formatStart();
      expect(result).toContain("AI Media Factory Bot");
      expect(result).toContain("/help");
    });
  });

  describe("formatHelp", () => {
    it("returns all available commands", () => {
      const result = formatHelp();
      expect(result).toContain("/start");
      expect(result).toContain("/help");
      expect(result).toContain("/status");
      expect(result).toContain("/today");
      expect(result).toContain("/queue");
      expect(result).toContain("/errors");
      expect(result).toContain("/cost");
      expect(result).toContain("/system");
      expect(result).toContain("/logs");
      expect(result).toContain("/version");
    });
  });

  describe("formatStatus", () => {
    it("formats system status correctly", () => {
      const status = {
        agentStatus: "running" as const,
        queueSize: 5,
        processingJobs: 2,
        completedJobs: 100,
        failedJobs: 3,
        lastHeartbeat: "2024-01-15T10:30:00.000Z",
        uptime: 86400,
      };

      const result = formatStatus(status);

      expect(result).toContain("Running");
      expect(result).toContain("5");
      expect(result).toContain("2");
      expect(result).toContain("100");
      expect(result).toContain("3");
      expect(result).toContain("1d");
    });

    it("handles null heartbeat", () => {
      const status = {
        agentStatus: "stopped" as const,
        queueSize: 0,
        processingJobs: 0,
        completedJobs: 0,
        failedJobs: 0,
        lastHeartbeat: null,
        uptime: 0,
      };

      const result = formatStatus(status);
      expect(result).toContain("Never");
      expect(result).toContain("Stopped");
    });
  });

  describe("formatSystem", () => {
    it("formats server metrics correctly", () => {
      const metrics = {
        cpuUsage: 45.5,
        ramUsage: 62.3,
        diskUsage: 78.1,
        loadAverage: [1.5, 1.2, 1.0],
        os: "Linux 5.15.0",
        nodeVersion: "v20.10.0",
        hostname: "server-01",
      };

      const result = formatSystem(metrics);

      expect(result).toContain("45.5");
      expect(result).toContain("62.3");
      expect(result).toContain("78.1");
      expect(result).toContain("1.50, 1.20, 1.00");
      expect(result).toContain("Linux");
      expect(result).toContain("v20.10.0");
      expect(result).toContain("server-01");
    });
  });

  describe("formatQueue", () => {
    it("formats queue statistics correctly", () => {
      const stats = {
        queued: 10,
        running: 3,
        completedToday: 25,
        failedToday: 2,
        averageWaitingTime: 45000,
      };

      const result = formatQueue(stats);

      expect(result).toContain("10");
      expect(result).toContain("3");
      expect(result).toContain("25");
      expect(result).toContain("2");
      expect(result).toContain("45.0s");
    });

    it("handles zero values", () => {
      const stats = {
        queued: 0,
        running: 0,
        completedToday: 0,
        failedToday: 0,
        averageWaitingTime: 0,
      };

      const result = formatQueue(stats);
      expect(result).toContain("0");
      expect(result).toContain("0ms");
    });
  });

  describe("formatToday", () => {
    it("formats daily report correctly", () => {
      const report = {
        date: "2024-01-15",
        videosProcessed: 62,
        successfulJobs: 61,
        failedJobs: 1,
        averageProcessingTime: 300000,
        translationCount: 30,
        subtitleCount: 32,
        costSummary: { vertexAI: 0.33, total: 0.33 },
        queueSummary: {
          queued: 5,
          running: 2,
          completedToday: 61,
          failedToday: 1,
          averageWaitingTime: 45000,
        },
        warnings: ["None"],
      };

      const result = formatToday(report);

      expect(result).toContain("62");
      expect(result).toContain("61");
      expect(result).toContain("1");
      expect(result).toContain("$0.33");
      expect(result).toContain("None");
    });

    it("includes warnings when present", () => {
      const report = {
        date: "2024-01-15",
        videosProcessed: 10,
        successfulJobs: 8,
        failedJobs: 2,
        averageProcessingTime: 300000,
        translationCount: 5,
        subtitleCount: 5,
        costSummary: { vertexAI: 5.0, total: 5.0 },
        queueSummary: {
          queued: 100,
          running: 0,
          completedToday: 8,
          failedToday: 2,
          averageWaitingTime: 0,
        },
        warnings: ["High queue: 100 tasks pending", "High cost: Vertex AI $5.00"],
      };

      const result = formatToday(report);

      expect(result).toContain("High queue");
      expect(result).toContain("High cost");
    });
  });

  describe("formatErrors", () => {
    it("formats error report correctly", () => {
      const report = {
        errors: [
          {
            taskId: "TEST-001",
            errorMessage: "File not found",
            timestamp: "2024-01-15T10:30:00.000Z",
            retryCount: 1,
          },
          {
            taskId: "TEST-002",
            errorMessage: "Timeout exceeded",
            timestamp: "2024-01-15T10:25:00.000Z",
            retryCount: 0,
          },
        ],
        total: 2,
      };

      const result = formatErrors(report);

      expect(result).toContain("TEST-001");
      expect(result).toContain("TEST-002");
      expect(result).toContain("File not found");
      expect(result).toContain("Timeout exceeded");
      expect(result).toContain("1 retries");
      expect(result).toContain("2 of 2");
    });

    it("handles empty errors", () => {
      const report = { errors: [], total: 0 };
      const result = formatErrors(report);
      expect(result).toContain("No errors");
    });

    it("truncates long error messages", () => {
      const longMessage = "A".repeat(200);
      const report = {
        errors: [
          {
            taskId: "TEST-001",
            errorMessage: longMessage,
            timestamp: "2024-01-15T10:30:00.000Z",
            retryCount: 0,
          },
        ],
        total: 1,
      };

      const result = formatErrors(report);
      expect(result).toContain("...");
    });
  });

  describe("formatCost", () => {
    it("formats cost summary correctly", () => {
      const summary = {
        vertexAI: 3.5,
        total: 3.5,
        modelCommittedUsd: 3.25,
        modelReservedUsd: 0.25,
        modelLimitUsd: 4,
        modelCalls: 24,
        modelRequestLimit: 30,
      };

      const result = formatCost(summary);

      expect(result).toContain("$3.50 / $4.00");
      expect(result).toContain("24 / 30");
      expect(result).toContain("VM, disk, network, TTS");
      expect(result).not.toContain("*Total:*");
    });
  });

  describe("formatLogs", () => {
    it("formats logs correctly", () => {
      const logs = [
        "[10:30:00] user1: /status (150ms)",
        "[10:25:00] user2: /help (50ms)",
      ];

      const result = formatLogs(logs);

      expect(result).toContain("user1");
      expect(result).toContain("/status");
      expect(result).toContain("user2");
      expect(result).toContain("/help");
    });

    it("shows count when logs exceed limit", () => {
      const logs = Array.from({ length: 15 }, (_, i) => `[10:${i.toString().padStart(2, "0")}:00] user: /cmd (100ms)`);

      const result = formatLogs(logs);

      expect(result).toContain("... and 5 more");
    });

    it("handles empty logs", () => {
      const result = formatLogs([]);
      expect(result).toContain("No recent logs");
    });
  });

  describe("formatVersion", () => {
    it("formats version info correctly", () => {
      const info = {
        version: "1.2.3",
        commit: "abc123def456",
        buildDate: "2024-01-15T10:00:00.000Z",
      };

      const result = formatVersion(info);

      expect(result).toContain("1.2.3");
      expect(result).toContain("abc123d");
      expect(result).toContain("2024-01-15");
    });
  });

  describe("formatUnauthorized", () => {
    it("returns unauthorized message", () => {
      const result = formatUnauthorized();
      expect(result).toContain("Unauthorized");
    });
  });
});
