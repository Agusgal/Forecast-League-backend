import { NextResponse } from "next/server";
import { demoAuthSchema } from "@/domain/schemas";
import { body, endpoint } from "@/server/http";
import { DEMO_COOKIE, localStore } from "@/server/local-store";
import { hasSupabase, SupabaseAdapter } from "@/server/supabase";

export const runtime = "nodejs";
export const POST = endpoint(async (request) => {
  const input = await body(request, demoAuthSchema);
  if (hasSupabase()) {
    const adapter = new SupabaseAdapter(request);
    return adapter.respond({ user: await adapter.profile(input) });
  }
  return NextResponse.json({
    user: await localStore.updateProfile(
      request.cookies.get(DEMO_COOKIE)?.value,
      input,
    ),
  });
});
