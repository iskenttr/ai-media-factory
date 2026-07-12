import { NextResponse } from "next/server";

import { getAnalysisStore } from "@/lib/server/store";

export const runtime = "nodejs";

export function GET() {
  try {
    return NextResponse.json({ status: getAnalysisStore().healthcheck() ? "ok" : "unavailable" });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }
}
