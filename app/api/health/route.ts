import { NextResponse } from "next/server";

import { getAnalysisStore } from "@/lib/server/store";
import { LocalProviderRegistry } from "@/lib/providers/provider-registry";
import { serverConfig } from "@/lib/server/config";

export const runtime = "nodejs";

interface HealthCheckResult {
  status: "ok" | "degraded" | "unavailable";
  timestamp: string;
  checks: {
    database: { status: "ok" | "unavailable"; latencyMs?: number };
    providers?: { status: "ok" | "degraded" | "unavailable"; details: Record<string, boolean> };
    services?: { status: "ok" | "degraded"; details: Record<string, boolean> };
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
    const workerFresh = store.serviceHeartbeatIsFresh("worker", 45_000);
    result.checks.services = {
      status: workerFresh ? "ok" : "degraded",
      details: { worker: workerFresh },
    };
    if (!workerFresh && result.status !== "unavailable") result.status = "degraded";
  } catch {
    result.status = "unavailable";
  }

  // Check provider availability
  try {
    const providers = new LocalProviderRegistry(
      serverConfig.whisperCppBinary,
      serverConfig.whisperModelPath,
      serverConfig.pyannotePython,
      serverConfig.pyannoteModelPath,
      process.env.WHISPER_CPP_NO_GPU === "1",
      serverConfig.argosTranslateCommand,
      serverConfig.googleCloudProject,
      serverConfig.ttsProvider,
    );
    const [speech, speakers, translation, tts] = await Promise.all([
      providers.speech(),
      providers.speakers(),
      providers.translation(),
      providers.tts(),
    ]);
    const ttsReady = tts ? (await tts.getVoiceProfiles()).length > 0 : false;
    result.checks.providers = {
      status: "ok",
      details: {
        speech: speech !== null,
        speakers: speakers !== null,
        translation: translation !== null,
        tts: ttsReady,
        contentProfile: true, // Always available
      },
    };
    // Mark as degraded if any provider is unavailable
    const allAvailable = speech !== null && speakers !== null && translation !== null && ttsReady;
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
