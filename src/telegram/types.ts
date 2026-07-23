import type { EngineeringTask } from "../../agent/tasks/schema";

export interface SystemStatus {
  agentStatus: "running" | "stopped" | "error";
  queueSize: number;
  processingJobs: number;
  completedJobs: number;
  failedJobs: number;
  lastHeartbeat: string | null;
  uptime: number;
}

export interface ServerMetrics {
  cpuUsage: number;
  ramUsage: number;
  diskUsage: number;
  loadAverage: number[];
  os: string;
  nodeVersion: string;
  hostname: string;
}

export interface QueueStats {
  queued: number;
  running: number;
  completedToday: number;
  failedToday: number;
  averageWaitingTime: number;
}

export interface DailyReport {
  date: string;
  videosProcessed: number;
  successfulJobs: number;
  failedJobs: number;
  averageProcessingTime: number;
  translationCount: number;
  subtitleCount: number;
  costSummary: CostSummary;
  queueSummary: QueueStats;
  warnings: string[];
}

export interface CostSummary {
  /** Autonomous Vertex model estimate only; this is not the Cloud invoice. */
  vertexAI: number;
  /** Deprecated compatibility alias for vertexAI; never present it as total Cloud cost. */
  total: number;
  modelCommittedUsd?: number;
  modelReservedUsd?: number;
  modelLimitUsd?: number;
  modelCalls?: number;
  modelRequestLimit?: number;
}

export interface ErrorReport {
  errors: ErrorEntry[];
  total: number;
}

export interface ErrorEntry {
  taskId: string;
  errorMessage: string;
  timestamp: string;
  retryCount: number;
}

export interface TelegramCommand {
  command: string;
  userId: number;
  username: string | undefined;
  chatId: number;
  timestamp: Date;
  executionTime: number;
}

export interface NotificationPayload {
  type: "job_completed" | "job_failed" | "queue_blocked" | "agent_offline" | "high_cpu" | "low_disk" | "deployment_finished";
  message: string;
  details?: Record<string, unknown>;
}

export interface JobEvent {
  taskId: string;
  taskTitle: string;
  status: EngineeringTask["priority"];
  completedAt: string;
  duration: number;
}
