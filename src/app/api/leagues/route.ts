import { NextResponse } from "next/server";
import { createLeagueSchema } from "@/domain/schemas";
import { body, endpoint } from "@/server/http";
import { DEMO_COOKIE, localStore } from "@/server/local-store";
import { hasSupabase, SupabaseAdapter } from "@/server/supabase";

export const runtime = "nodejs";
export const POST = endpoint(async (request) => {
  const input = await body(request, createLeagueSchema);
  if (hasSupabase()) {
    const adapter = new SupabaseAdapter(request);
    return adapter.respond(
      { league: await adapter.league("create", input) },
      201,
    );
  }
  return NextResponse.json(
    {
      league: await localStore.createLeague(
        request.cookies.get(DEMO_COOKIE)?.value,
        input,
      ),
    },
    { status: 201 },
  );
});
