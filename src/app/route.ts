import { NextResponse } from "next/server";

/** Process liveness only: this does not probe storage or Supabase. */
export function GET() {
  return NextResponse.json({
    service: "forecast-league-backend",
    version: "0.1.0",
    status: "ok",
    endpoints: { bootstrap: "/api/bootstrap", auth: "/api/auth" },
  }, { headers: { "Cache-Control": "no-store" } });
}
