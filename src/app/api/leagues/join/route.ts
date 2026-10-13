import { NextResponse } from "next/server";
import { joinLeagueSchema } from "@/domain/schemas";
import { body, endpoint } from "@/server/http";
import { DEMO_COOKIE, localStore } from "@/server/local-store";
import { hasSupabase, SupabaseAdapter } from "@/server/supabase";

export const runtime = "nodejs";
export const POST = endpoint(async (request) => {
  const input = await body(request, joinLeagueSchema);
  if (hasSupabase()) {
    const adapter = new SupabaseAdapter(request);
    return adapter.respond({ league: await adapter.league("join", input) });
  }
  return NextResponse.json({
    league: await localStore.joinLeague(
      request.cookies.get(DEMO_COOKIE)?.value,
      input.code,
    ),
  });
});
