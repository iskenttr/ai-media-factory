import type { NotificationPayload } from "../types";

type NotificationCallback = (payload: NotificationPayload) => Promise<void>;

class NotificationService {
  private callbacks: NotificationCallback[] = [];
  private adminIds: Set<number> = new Set();

  setAdminIds(ids: number[]): void {
    this.adminIds = new Set(ids);
  }

  isAdmin(userId: number): boolean {
    return this.adminIds.has(userId);
  }

  onNotification(callback: NotificationCallback): () => void {
    this.callbacks.push(callback);
    return () => {
      this.callbacks = this.callbacks.filter((cb) => cb !== callback);
    };
  }

  async notify(payload: NotificationPayload): Promise<void> {
    for (const callback of this.callbacks) {
      try {
        await callback(payload);
      } catch (error) {
        console.error("Notification callback failed:", error);
      }
    }
  }

  async notifyJobCompleted(taskId: string, taskTitle: string): Promise<void> {
    await this.notify({
      type: "job_completed",
      message: `✅ Job completed: ${taskTitle} (${taskId})`,
      details: { taskId, taskTitle },
    });
  }

  async notifyJobFailed(taskId: string, taskTitle: string, error: string): Promise<void> {
    await this.notify({
      type: "job_failed",
      message: `❌ Job failed: ${taskTitle} (${taskId})\nError: ${error}`,
      details: { taskId, taskTitle, error },
    });
  }

  async notifyQueueBlocked(reason: string): Promise<void> {
    await this.notify({
      type: "queue_blocked",
      message: `🚫 Queue blocked: ${reason}`,
      details: { reason },
    });
  }

  async notifyAgentOffline(): Promise<void> {
    await this.notify({
      type: "agent_offline",
      message: "⚠️ Agent is offline",
      details: {},
    });
  }

  async notifyHighCpu(usage: number): Promise<void> {
    await this.notify({
      type: "high_cpu",
      message: `🔥 High CPU usage: ${usage.toFixed(1)}%`,
      details: { cpuUsage: usage },
    });
  }

  async notifyLowDisk(usage: number): Promise<void> {
    await this.notify({
      type: "low_disk",
      message: `💾 Low disk space: ${usage.toFixed(1)}% free`,
      details: { diskUsage: usage },
    });
  }

  async notifyDeploymentFinished(version: string): Promise<void> {
    await this.notify({
      type: "deployment_finished",
      message: `🚀 Deployment finished: v${version}`,
      details: { version },
    });
  }
}

export const notificationService = new NotificationService();
