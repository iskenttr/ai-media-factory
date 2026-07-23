import { createHash } from "node:crypto";
import { appendFile, mkdir, open, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { appendAudit } from "../orchestrator/audit-log";
import { numericSetting } from "../policies/limits";

export interface ModelResponse {
  plan: string[];
  patch: string;
  rationale: string;
  reportedUsage?: Record<string, number>;
  requestedModel: string;
  actualModel: string;
}

interface ModelUsageEntry {
  taskId: string;
  timestamp: string;
  entryType?: "reservation" | "settlement";
  reservationId?: string;
  estimatedPromptTokens?: number;
  maximumOutputTokens?: number;
  reservedCostUsd?: number;
  reportedUsage?: Record<string, number> | null;
  estimatedCostUsd?: number;
}

export interface DailyModelBudgetStatus {
  date: string;
  calls: number;
  requestLimit: number;
  estimatedCostUsd: number;
  committedCostUsd: number;
  reservedCostUsd: number;
  remainingCostUsd: number;
  costLimitUsd: number;
  exhausted: boolean;
  reason: "daily_model_request_limit_exhausted" | "daily_model_cost_limit_exhausted" | null;
}

async function readModelUsageEntries(usageFile: string): Promise<ModelUsageEntry[]> {
  let content: string;
  try {
    content = await readFile(usageFile, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  return content
    .split("\n")
    .filter(Boolean)
    .map((line, index) => {
      try {
        const entry = JSON.parse(line) as ModelUsageEntry;
        if (typeof entry.taskId !== "string" || typeof entry.timestamp !== "string") {
          throw new Error("required_fields_missing");
        }
        return entry;
      } catch {
        throw new Error(`model_usage_ledger_invalid:line_${index + 1}`);
      }
    });
}

function summarizeDailyModelBudget(
  entries: ModelUsageEntry[],
  now: Date,
): DailyModelBudgetStatus {
  const date = now.toISOString().slice(0, 10);
  const requestLimit = numericSetting(
    process.env.AMF_AGENT_DAILY_REQUEST_LIMIT,
    50,
  );
  const costLimitUsd = numericSetting(
    process.env.AMF_AGENT_DAILY_COST_LIMIT_USD,
    5,
  );
  const dailyEntries = entries.filter((entry) => entry.timestamp.startsWith(date));
  const legacy = dailyEntries.filter((entry) => entry.entryType === undefined);
  const reservations = dailyEntries.filter((entry) => entry.entryType === "reservation");
  const settlements = new Map(
    dailyEntries
      .filter((entry) => entry.entryType === "settlement" && entry.reservationId)
      .map((entry) => [entry.reservationId as string, entry]),
  );
  const legacyCostUsd = legacy.reduce((sum, entry) => sum + (entry.estimatedCostUsd ?? 0), 0);
  let committedCostUsd = legacyCostUsd;
  let reservedCostUsd = 0;
  for (const reservation of reservations) {
    const settlement = reservation.reservationId
      ? settlements.get(reservation.reservationId)
      : undefined;
    if (settlement) committedCostUsd += settlement.estimatedCostUsd ?? reservation.reservedCostUsd ?? 0;
    else reservedCostUsd += reservation.reservedCostUsd ?? 0;
  }
  const estimatedCostUsd = committedCostUsd + reservedCostUsd;
  const calls = legacy.length + reservations.length;
  const reason =
    calls >= requestLimit
      ? "daily_model_request_limit_exhausted"
      : estimatedCostUsd >= costLimitUsd
        ? "daily_model_cost_limit_exhausted"
        : null;

  return {
    date,
    calls,
    requestLimit,
    estimatedCostUsd,
    committedCostUsd,
    reservedCostUsd,
    remainingCostUsd: Math.max(0, costLimitUsd - estimatedCostUsd),
    costLimitUsd,
    exhausted: reason !== null,
    reason,
  };
}

function maximumModelCallCostUsd(estimatedPromptTokens: number, maximumOutputTokens: number) {
  const inputPrice = numericSetting(
    process.env.AMF_AGENT_INPUT_USD_PER_MILLION_TOKENS,
    1.5,
  );
  const outputPrice = numericSetting(
    process.env.AMF_AGENT_OUTPUT_USD_PER_MILLION_TOKENS,
    9,
  );
  return (
    estimatedPromptTokens * inputPrice +
    maximumOutputTokens * outputPrice
  ) / 1_000_000;
}

function summarizeTaskModelUsage(entries: ModelUsageEntry[], taskId: string) {
  const taskEntries = entries.filter((entry) => entry.taskId === taskId);
  const legacy = taskEntries.filter((entry) => entry.entryType === undefined);
  const reservations = taskEntries.filter((entry) => entry.entryType === "reservation");
  const settlements = new Map(
    taskEntries
      .filter((entry) => entry.entryType === "settlement" && entry.reservationId)
      .map((entry) => [entry.reservationId as string, entry]),
  );
  const legacyTokens = legacy.reduce(
    (sum, entry) =>
      sum + (entry.reportedUsage?.total ?? entry.reportedUsage?.totalTokenCount ?? entry.estimatedPromptTokens ?? 0),
    0,
  );
  const reservedTokens = reservations.reduce((sum, reservation) => {
    const settlement = reservation.reservationId
      ? settlements.get(reservation.reservationId)
      : undefined;
    return sum + (
      settlement?.reportedUsage?.total
      ?? settlement?.reportedUsage?.totalTokenCount
      ?? (reservation.estimatedPromptTokens ?? 0) + (reservation.maximumOutputTokens ?? 0)
    );
  }, 0);
  return {
    calls: legacy.length + reservations.length,
    estimatedTokens: legacyTokens + reservedTokens,
  };
}

export async function reserveDailyModelCall(
  root: string,
  input: {
    taskId: string;
    estimatedPromptTokens: number;
    maximumOutputTokens: number;
  },
  now = new Date(),
) {
  const usageFile = path.join(root, "agent/state/model-usage.jsonl");
  await mkdir(path.dirname(usageFile), { recursive: true });
  const entries = await readModelUsageEntries(usageFile);
  const status = summarizeDailyModelBudget(entries, now);
  if (status.reason) throw new Error(status.reason);
  const reservedCostUsd = maximumModelCallCostUsd(
    input.estimatedPromptTokens,
    input.maximumOutputTokens,
  );
  if (status.estimatedCostUsd + reservedCostUsd > status.costLimitUsd + Number.EPSILON) {
    throw new Error("daily_model_cost_limit_exhausted");
  }
  const reservationId = createHash("sha256")
    .update(`${input.taskId}:${now.toISOString()}:${status.calls + 1}:${input.estimatedPromptTokens}:${input.maximumOutputTokens}`)
    .digest("hex");
  const entry: ModelUsageEntry = {
    entryType: "reservation",
    reservationId,
    timestamp: now.toISOString(),
    taskId: input.taskId,
    estimatedPromptTokens: input.estimatedPromptTokens,
    maximumOutputTokens: input.maximumOutputTokens,
    reservedCostUsd,
  };
  await appendFile(usageFile, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
  return { reservationId, reservedCostUsd, call: status.calls + 1 };
}

async function settleDailyModelCall(
  usageFile: string,
  input: {
    reservationId: string;
    taskId: string;
    timestamp: string;
    reservedCostUsd: number;
    reportedUsage?: Record<string, number>;
    detail: Record<string, unknown>;
  },
) {
  const entry: ModelUsageEntry & Record<string, unknown> = {
    entryType: "settlement",
    reservationId: input.reservationId,
    timestamp: input.timestamp,
    taskId: input.taskId,
    reportedUsage: input.reportedUsage ?? null,
    estimatedCostUsd: input.reportedUsage
      ? estimateCostUsd(input.reportedUsage)
      : input.reservedCostUsd,
    ...input.detail,
  };
  await appendFile(usageFile, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
  return entry;
}

export async function getDailyModelBudgetStatus(
  root: string,
  now = new Date(),
): Promise<DailyModelBudgetStatus> {
  const usageFile = path.join(root, "agent/state/model-usage.jsonl");
  return summarizeDailyModelBudget(
    await readModelUsageEntries(usageFile),
    now,
  );
}

// ---------------------------------------------------------------------------
// Concurrency guard — only one Gemini CLI process at a time per process.
// ---------------------------------------------------------------------------
let _geminiRunning = false;

// ---------------------------------------------------------------------------
// Allowed model family policy
// ---------------------------------------------------------------------------
export function allowedModelFamilies(): string[] {
  const env = process.env.AMF_AGENT_ALLOWED_MODEL_FAMILIES;
  if (env && env.trim().length > 0) {
    return env.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return ["gemini-2.5-flash", "gemini-3.5-flash"];
}

export function isModelAllowed(model: string, families: string[]): boolean {
  return families.some(
    (family) => model === family || model.startsWith(`${family}-`),
  );
}

// ---------------------------------------------------------------------------
// Response parsing — never throws; returns error string instead
// ---------------------------------------------------------------------------
export function extractResponse(
  text: string,
): { parsed: ModelResponse | null; error: string | null } {
  try {
    const direct = JSON.parse(text) as Record<string, unknown>;
    const candidate =
      typeof direct.response === "string"
        ? (JSON.parse(direct.response) as Record<string, unknown>)
        : direct;
    if (
      !Array.isArray(candidate.plan) ||
      typeof candidate.patch !== "string" ||
      typeof candidate.rationale !== "string"
    ) {
      return { parsed: null, error: "gemini_response_contract_invalid" };
    }
    const stats =
      typeof direct.stats === "object" && direct.stats
        ? (direct.stats as Record<string, unknown>)
        : undefined;
    const models =
      stats && typeof stats.models === "object" && stats.models
        ? Object.keys(stats.models as Record<string, unknown>)
        : [];
    const aggregateUsage = models.reduce<Record<string, number>>(
      (usage, model) => {
        const modelStats = (stats?.models as Record<string, unknown>)[model];
        if (!modelStats || typeof modelStats !== "object") return usage;
        const tokens = (modelStats as Record<string, unknown>).tokens;
        if (!tokens || typeof tokens !== "object") return usage;
        const record = tokens as Record<string, unknown>;
        for (const [key, value] of Object.entries(record)) {
          if (typeof value === "number" && Number.isFinite(value)) {
            usage[key] = (usage[key] ?? 0) + value;
          }
        }
        return usage;
      },
      {},
    );
    const actualModel =
      typeof direct.model === "string"
        ? direct.model
        : models.length === 1
          ? models[0]
          : "unknown";
    return {
      parsed: {
        plan: candidate.plan.map(String),
        patch: candidate.patch,
        rationale: candidate.rationale,
        reportedUsage:
          Object.keys(aggregateUsage).length > 0 ? aggregateUsage : undefined,
        requestedModel: "", // filled by caller
        actualModel,
      },
      error: null,
    };
  } catch (e) {
    return {
      parsed: null,
      error: `gemini_response_parse_failed:${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

function is429(text: string): boolean {
  return /429|RESOURCE_EXHAUSTED|quota.*exceeded|rate.?limit/i.test(text);
}

export function isTransientVertexFailure(status: number, text: string) {
  return status >= 500 || /vertex_non_json_response|temporar(?:y|ily)|backend.*(?:error|unavailable)|bad gateway|service unavailable/i.test(text);
}

// ---------------------------------------------------------------------------
// Core request — calls Vertex AI directly with a metadata-server access token,
// a strict response schema, no tools, and a hard timeout. Both artifacts are
// written before returning or throwing.
// ---------------------------------------------------------------------------
async function callVertexOnce(
  root: string,
  taskId: string,
  requestedModel: string,
  location: string,
  project: string,
  prompt: string,
  callIndex: number,
  hardTimeoutMs: number,
  maximumOutputTokens: number,
): Promise<{
  status: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  stdoutArtifact: string;
  stderrArtifact: string;
}> {
  const artifactDir = path.join(root, "artifacts", taskId);
  await mkdir(artifactDir, { recursive: true });

  const stdoutArtifact = path.join(artifactDir, `gemini-stdout-${callIndex}.txt`);
  const stderrArtifact = path.join(artifactDir, `gemini-stderr-${callIndex}.txt`);

  // Open files before the request so every attempt has durable evidence.
  const stdoutFh = await open(stdoutArtifact, "w", 0o600);
  const stderrFh = await open(stderrArtifact, "w", 0o600);
  const started = Date.now();
  let stdout = "";
  let stderr = "";
  let timedOut = false;
  let status = 1;
  const controller = new AbortController();
  const watchdog = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, hardTimeoutMs);

  try {
    const tokenResponse = await fetch(
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
      { headers: { "Metadata-Flavor": "Google" }, signal: controller.signal },
    );
    if (!tokenResponse.ok) throw new Error(`vertex_metadata_token_failed:${tokenResponse.status}`);
    const tokenPayload = await tokenResponse.json() as { access_token?: string };
    if (!tokenPayload.access_token) throw new Error("vertex_metadata_token_missing");

    const endpoint = `https://aiplatform.googleapis.com/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(requestedModel)}:generateContent`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenPayload.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: maximumOutputTokens,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              plan: { type: "ARRAY", items: { type: "STRING" } },
              patch: { type: "STRING" },
              rationale: { type: "STRING" },
            },
            required: ["plan", "patch", "rationale"],
          },
        },
      }),
      signal: controller.signal,
    });
    const responseBody = await response.text();
    let payload: Record<string, unknown> | undefined;
    try {
      payload = JSON.parse(responseBody) as Record<string, unknown>;
    } catch {
      status = response.status || 1;
      stderr = `vertex_non_json_response:${response.status}:${responseBody.replace(/\s+/g, " ").slice(0, 200)}`;
    }
    if (!payload) {
      // A proxy or transient backend may return HTML. Keep only a bounded,
      // sanitized prefix as evidence; the caller may retry once.
    } else if (!response.ok) {
      status = response.status;
      stderr = JSON.stringify(payload);
    } else {
      const candidates = payload.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined;
      const responseText = candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof responseText !== "string") throw new Error("vertex_response_text_missing");
      const usage = (payload.usageMetadata ?? {}) as Record<string, unknown>;
      const modelVersion = typeof payload.modelVersion === "string" ? payload.modelVersion : requestedModel;
      const tokens = {
        input: Number(usage.promptTokenCount ?? 0),
        prompt: Number(usage.promptTokenCount ?? 0),
        candidates: Number(usage.candidatesTokenCount ?? 0),
        total: Number(usage.totalTokenCount ?? 0),
        cached: Number(usage.cachedContentTokenCount ?? 0),
        thoughts: Number(usage.thoughtsTokenCount ?? 0),
        tool: Number(usage.toolUsePromptTokenCount ?? 0),
      };
      stdout = JSON.stringify({
        response: responseText,
        model: modelVersion,
        stats: { models: { [modelVersion]: { tokens } }, tools: { totalCalls: 0 } },
      });
      status = 0;
    }
  } catch (error) {
    if (timedOut || (error instanceof Error && error.name === "AbortError")) timedOut = true;
    stderr = error instanceof Error ? error.message : String(error);
  } finally {
    clearTimeout(watchdog);
  }

  await stdoutFh.write(stdout).catch(() => {});
  await stderrFh.write(stderr).catch(() => {});

  // Always close and flush artifact files
  await stdoutFh.close().catch(() => {});
  await stderrFh.close().catch(() => {});

  const durationMs = Date.now() - started;

  return {
    status,
    stdout,
    stderr,
    durationMs,
    timedOut,
    stdoutArtifact,
    stderrArtifact,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export async function requestGeminiPatch(
  root: string,
  taskId: string,
  prompt: string,
  maximumCalls: number,
  maximumTokens: number,
): Promise<ModelResponse> {
  // Concurrency guard
  if (_geminiRunning) {
    throw new Error("gemini_already_running:another_call_is_in_progress");
  }
  _geminiRunning = true;

  try {
    return await _requestGeminiPatch(root, taskId, prompt, maximumCalls, maximumTokens);
  } finally {
    _geminiRunning = false;
  }
}

async function _requestGeminiPatch(
  root: string,
  taskId: string,
  prompt: string,
  maximumCalls: number,
  maximumTokens: number,
): Promise<ModelResponse> {
  const usageFile = path.join(root, "agent/state/model-usage.jsonl");
  await mkdir(path.dirname(usageFile), { recursive: true });

  // Budget accounting
  const entries = await readModelUsageEntries(usageFile);
  const dailyBudget = summarizeDailyModelBudget(entries, new Date());
  const taskUsage = summarizeTaskModelUsage(entries, taskId);

  const effectiveMaximumCalls = Math.min(
    maximumCalls,
    numericSetting(process.env.AMF_AGENT_MAX_MODEL_CALLS, 8),
  );
  const effectiveMaximumTokens = Math.min(
    maximumTokens,
    numericSetting(process.env.AMF_AGENT_MAX_MODEL_TOKENS, 200_000),
  );

  if (taskUsage.calls >= effectiveMaximumCalls) throw new Error("model_call_budget_exhausted");
  if (dailyBudget.reason) throw new Error(dailyBudget.reason);

  // UTF-8 byte length is a conservative tokenizer-independent ceiling: a
  // tokenizer cannot emit more non-empty tokens than the encoded byte stream.
  const estimatedPromptTokens = Buffer.byteLength(prompt, "utf8");
  const remainingTaskTokens = effectiveMaximumTokens - taskUsage.estimatedTokens - estimatedPromptTokens;
  if (remainingTaskTokens <= 0) {
    throw new Error("model_token_budget_exhausted");
  }
  const maximumOutputTokens = Math.min(
    remainingTaskTokens,
    Math.floor(numericSetting(process.env.AMF_AGENT_MAX_OUTPUT_TOKENS, 8_192)),
  );

  const requestedModel = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";
  const families = allowedModelFamilies();
  if (!isModelAllowed(requestedModel, families)) {
    throw new Error(`requested_model_not_allowed:${requestedModel}`);
  }
  const location = process.env.GOOGLE_CLOUD_LOCATION ?? "global";
  const project = process.env.GOOGLE_CLOUD_PROJECT ?? "open-claw-502114";

  // Hard timeout per call: task-level maximum_execution_ms capped at 10 min
  const hardTimeoutMs = Math.min(
    numericSetting(process.env.AMF_AGENT_MAX_EXECUTION_MS, 600_000),
    10 * 60_000,
  );

  const maxRetries = 1; // per task requirement for AUTONOMOUS-SMOKE-002
  let lastError: Error = new Error("gemini_never_attempted");
  let retryDelayMs = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (attempt > 0) {
      await appendAudit(root, {
        timestamp: new Date().toISOString(),
        taskId,
        category: "model",
        event: "gemini_cooldown_before_retry",
        detail: { attempt, requestedModel, retryDelayMs },
      });
      await new Promise<void>((resolve) => setTimeout(resolve, retryDelayMs));
    }

    const currentTaskUsage = summarizeTaskModelUsage(
      await readModelUsageEntries(usageFile),
      taskId,
    );
    if (currentTaskUsage.calls >= effectiveMaximumCalls) {
      throw new Error("model_call_budget_exhausted");
    }
    const callIndex = currentTaskUsage.calls + 1;
    const reservation = await reserveDailyModelCall(root, {
      taskId,
      estimatedPromptTokens,
      maximumOutputTokens,
    });
    await appendAudit(root, {
      timestamp: new Date().toISOString(),
      taskId,
      category: "model",
      event: "gemini_cost_reserved",
      detail: {
        reservationId: reservation.reservationId,
        reservedCostUsd: reservation.reservedCostUsd,
        estimatedPromptTokens,
        maximumOutputTokens,
        call: callIndex,
      },
    });

    const callResult = await callVertexOnce(
      root, taskId, requestedModel, location, project,
      prompt, callIndex, hardTimeoutMs, maximumOutputTokens,
    );

    const { status, stdout, stderr, durationMs, timedOut, stdoutArtifact, stderrArtifact } =
      callResult;
    const extracted = status === 0
      ? extractResponse(stdout)
      : { parsed: null, error: null };
    const settlementTimestamp = new Date().toISOString();
    const settlement = await settleDailyModelCall(usageFile, {
      reservationId: reservation.reservationId,
      taskId,
      timestamp: settlementTimestamp,
      reservedCostUsd: reservation.reservedCostUsd,
      reportedUsage: extracted.parsed?.reportedUsage,
      detail: {
        requestedModel,
        actualModel: extracted.parsed?.actualModel ?? "unreported",
        location,
        project,
        call: callIndex,
        durationMs,
        estimatedPromptTokens,
        maximumOutputTokens,
        status,
        timedOut,
        stdoutArtifact,
        stderrArtifact,
      },
    });

    // Artifacts are already written incrementally; log their paths
    await appendAudit(root, {
      timestamp: new Date().toISOString(),
      taskId,
      category: "model",
      event: "gemini_subprocess_finished",
      detail: {
        requestedModel, attempt, status, durationMs, timedOut,
        stdoutArtifact, stderrArtifact,
        stdoutBytes: stdout.length, stderrBytes: stderr.length,
      },
    });

    if (timedOut) {
      lastError = new Error(
        `gemini_subprocess_timeout:hard_limit_${hardTimeoutMs}ms_exceeded`,
      );
      // Don't retry on timeout — kill was already sent
      break;
    }

    if (status !== 0) {
      const redactedStderr = stderr
        .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
        .slice(0, 500);

      if (is429(stderr) || is429(stdout)) {
        if (attempt < maxRetries) {
          retryDelayMs = 60_000;
          lastError = new Error(
            `gemini_rate_limited:attempt_${attempt + 1}_of_${maxRetries + 1}`,
          );
          await appendAudit(root, {
            timestamp: new Date().toISOString(),
            taskId,
            category: "model",
            event: "gemini_rate_limited",
            detail: { attempt, durationMs, requestedModel },
          });
          continue;
        }
      }

      if (isTransientVertexFailure(status, stderr || stdout) && attempt < maxRetries) {
        retryDelayMs = 5_000;
        lastError = new Error(`gemini_transient_failure:attempt_${attempt + 1}_of_${maxRetries + 1}`);
        await appendAudit(root, {
          timestamp: new Date().toISOString(), taskId, category: "model", event: "gemini_transient_failure",
          detail: { attempt, status, durationMs, requestedModel },
        });
        continue;
      }

      // Non-retryable failure
      throw new Error(`gemini_request_failed:${status}:${redactedStderr}`);
    }

    // Parse response
    const { parsed, error: parseError } = extracted;
    if (parseError || !parsed) {
      throw new Error(parseError ?? "gemini_response_parse_failed:unknown");
    }
    parsed.requestedModel = requestedModel;

    // Credential leak guard
    if (
      /(?:api[_-]?key|password|secret|token)\s*[:=]\s*["']?[A-Za-z0-9_\-]{16,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i.test(
        stdout,
      )
    ) {
      throw new Error("possible_secret_in_model_response");
    }

    // Model routing check — log both names; only block if outside allowlist
    const actualModel = parsed.actualModel;
    if (actualModel && actualModel !== "unknown") {
      if (!isModelAllowed(actualModel, families)) {
        throw new Error(
          `model_routing_mismatch:requested=${requestedModel}:actual=${actualModel}:not_in_allowlist`,
        );
      }
      if (actualModel !== requestedModel) {
        await appendAudit(root, {
          timestamp: new Date().toISOString(),
          taskId,
          category: "model",
          event: "MODEL_ROUTED",
          detail: { requestedModel, actualModel, families },
        });
      }
    }

    // Persist validated response
    const outputFile = path.join(root, "artifacts", taskId, `gemini-response-${callIndex}.json`);
    await writeFile(outputFile, stdout, { mode: 0o600 });

    await appendAudit(root, {
      timestamp: settlementTimestamp,
      taskId,
      category: "model",
      event: "gemini_patch_response",
      detail: {
        requestedModel,
        actualModel: actualModel ?? "unreported",
        location,
        project,
        call: callIndex,
        durationMs,
        reservationId: reservation.reservationId,
        estimatedCostUsd: settlement.estimatedCostUsd,
        outputFile,
        stdoutArtifact,
        stderrArtifact,
      },
    });

    return parsed;
  }

  throw lastError;
}

function estimateCostUsd(usage?: Record<string, number>): number {
  if (!usage) return 0;
  const inputPrice = numericSetting(
    process.env.AMF_AGENT_INPUT_USD_PER_MILLION_TOKENS,
    1.5,
  );
  const cachedPrice = numericSetting(
    process.env.AMF_AGENT_CACHED_INPUT_USD_PER_MILLION_TOKENS,
    0.15,
  );
  const outputPrice = numericSetting(
    process.env.AMF_AGENT_OUTPUT_USD_PER_MILLION_TOKENS,
    9,
  );
  const input = usage.input ?? usage.prompt ?? 0;
  const cached = usage.cached ?? 0;
  const output = (usage.candidates ?? 0) + (usage.thoughts ?? 0) + (usage.tool ?? 0);
  const normalInput = Math.max(0, input - cached);
  return (
    normalInput * inputPrice +
    cached * cachedPrice +
    output * outputPrice
  ) / 1_000_000;
}
