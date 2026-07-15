import { describe, it, expect, vi, beforeEach } from "vitest";
import { notificationService } from "./notification";

describe("notification service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("admin management", () => {
    it("sets admin IDs correctly", () => {
      notificationService.setAdminIds([123, 456, 789]);
      expect(notificationService.isAdmin(123)).toBe(true);
      expect(notificationService.isAdmin(456)).toBe(true);
      expect(notificationService.isAdmin(789)).toBe(true);
      expect(notificationService.isAdmin(999)).toBe(false);
    });

    it("returns false for non-admin when no admins set", () => {
      notificationService.setAdminIds([]);
      expect(notificationService.isAdmin(123)).toBe(false);
    });
  });

  describe("notification callbacks", () => {
    it("registers and unregisters callbacks", async () => {
      const callback = vi.fn();
      const unsubscribe = notificationService.onNotification(callback);

      await notificationService.notify({
        type: "job_completed",
        message: "Test",
      });

      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribe();

      await notificationService.notify({
        type: "job_completed",
        message: "Test 2",
      });

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("calls all registered callbacks", async () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      notificationService.onNotification(callback1);
      notificationService.onNotification(callback2);

      await notificationService.notify({
        type: "job_completed",
        message: "Test",
      });

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it("continues calling other callbacks if one fails", async () => {
      const failingCallback = vi.fn().mockRejectedValue(new Error("Fail"));
      const successCallback = vi.fn();

      notificationService.onNotification(failingCallback);
      notificationService.onNotification(successCallback);

      await notificationService.notify({
        type: "job_completed",
        message: "Test",
      });

      expect(failingCallback).toHaveBeenCalledTimes(1);
      expect(successCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe("convenience methods", () => {
    it("notifies job completed", async () => {
      const callback = vi.fn();
      notificationService.onNotification(callback);

      await notificationService.notifyJobCompleted("TEST-001", "Test Task");

      expect(callback).toHaveBeenCalledWith({
        type: "job_completed",
        message: "✅ Job completed: Test Task (TEST-001)",
        details: {
          taskId: "TEST-001",
          taskTitle: "Test Task",
        },
      });
    });

    it("notifies job failed", async () => {
      const callback = vi.fn();
      notificationService.onNotification(callback);

      await notificationService.notifyJobFailed("TEST-002", "Failing Task", "File not found");

      expect(callback).toHaveBeenCalledWith({
        type: "job_failed",
        message: "❌ Job failed: Failing Task (TEST-002)\nError: File not found",
        details: {
          taskId: "TEST-002",
          taskTitle: "Failing Task",
          error: "File not found",
        },
      });
    });

    it("notifies queue blocked", async () => {
      const callback = vi.fn();
      notificationService.onNotification(callback);

      await notificationService.notifyQueueBlocked("Rate limit exceeded");

      expect(callback).toHaveBeenCalledWith({
        type: "queue_blocked",
        message: "🚫 Queue blocked: Rate limit exceeded",
        details: { reason: "Rate limit exceeded" },
      });
    });

    it("notifies agent offline", async () => {
      const callback = vi.fn();
      notificationService.onNotification(callback);

      await notificationService.notifyAgentOffline();

      expect(callback).toHaveBeenCalledWith({
        type: "agent_offline",
        message: "⚠️ Agent is offline",
        details: {},
      });
    });

    it("notifies high CPU", async () => {
      const callback = vi.fn();
      notificationService.onNotification(callback);

      await notificationService.notifyHighCpu(95.5);

      expect(callback).toHaveBeenCalledWith({
        type: "high_cpu",
        message: "🔥 High CPU usage: 95.5%",
        details: { cpuUsage: 95.5 },
      });
    });

    it("notifies low disk", async () => {
      const callback = vi.fn();
      notificationService.onNotification(callback);

      await notificationService.notifyLowDisk(8.2);

      expect(callback).toHaveBeenCalledWith({
        type: "low_disk",
        message: "💾 Low disk space: 8.2% free",
        details: { diskUsage: 8.2 },
      });
    });

    it("notifies deployment finished", async () => {
      const callback = vi.fn();
      notificationService.onNotification(callback);

      await notificationService.notifyDeploymentFinished("1.2.3");

      expect(callback).toHaveBeenCalledWith({
        type: "deployment_finished",
        message: "🚀 Deployment finished: v1.2.3",
        details: { version: "1.2.3" },
      });
    });
  });
});
