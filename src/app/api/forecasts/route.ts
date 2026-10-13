import { NextResponse } from "next/server";
import { forecastSubmissionSchema } from "@/domain/schemas";
import { body, endpoint } from "@/server/http";
import { DEMO_COOKIE, localStore } from "@/server/local-store";
import { hasSupabase, SupabaseAdapter } from "@/server/supabase";

export const runtime = "nodejs";
export const POST = endpoint(async (request) => {
  const input = await body(request, forecastSubmissionSchema);
  if (hasSupabase()) {
    const adapter = new SupabaseAdapter(request);
    return adapter.respond({ forecast: await adapter.submitForecast(input) });
  }
  return NextResponse.json({
    forecast: await localStore.submitForecast(
      request.cookies.get(DEMO_COOKIE)?.value,
      input,
    ),
  });
});
