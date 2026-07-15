import { NextResponse } from "next/server";

import { getAnalysisStore } from "@/lib/server/store";
import { LocalProviderRegistry } from "@/lib/providers/provider-registry";

export const runtime = "nodejs";

interface HealthCheckResult {
  status: "ok" | "degraded" | "unavailable";
  timestamp: string;
  checks: {
    database: { status: "ok" | "unavailable"; latencyMs?: number };
    providers?: { status: "ok" | "degraded" | "unavailable"; details: Record<string, boolean> };
  };
}

export async function GET() {
  const result: HealthCheckResult = {
    status: "ok",
    timestamp: new Date().toISOString(),
    checks: {
      database: { status: "unavailable" },
    },
  };

  // Check database connectivity
  try {
    const store = getAnalysisStore();
    const dbStart = Date.now();
    const healthy = store.healthcheck();
    result.checks.database = {
      status: healthy ? "ok" : "unavailable",
      latencyMs: Date.now() - dbStart,
    };
    if (!healthy) {
      result.status = "unavailable";
    }
  } catch {
    result.status = "unavailable";
  }

  // Check provider availability
  try {
    const providers = new LocalProviderRegistry(
      process.env.WHISPER_CPP_BINARY,
      process.env.WHISPER_CPP_MODEL,
      process.env.PYTHON_BINARY,
      process.env.PYANNOTE_MODEL,
    );
    const [speech, speakers, translation] = await Promise.all([
      providers.speech(),
      providers.speakers(),
      providers.translation(),
    ]);
    result.checks.providers = {
      status: "ok",
      details: {
        speech: speech !== null,
        speakers: speakers !== null,
        translation: translation !== null,
        contentProfile: true, // Always available
      },
    };
    // Mark as degraded if any provider is unavailable
    const allAvailable = speech !== null && speakers !== null && translation !== null;
    if (!allAvailable && result.status !== "unavailable") {
      result.status = "degraded";
    }
  } catch {
    // Provider check failed - this is not critical for health
    result.checks.providers = {
      status: "degraded",
      details: {},
    };
  }

  // Determine HTTP status code
  const httpStatus = result.status === "unavailable" ? 503 : 200;
  return NextResponse.json(result, { status: httpStatus });
}
