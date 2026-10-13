import { NextResponse } from "next/server";
import { endpoint } from "@/server/http";
import { DEMO_COOKIE, localStore, SESSION_MAX_AGE } from "@/server/local-store";
import { hasSupabase, SupabaseAdapter } from "@/server/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = endpoint(async (request) => {
  if (hasSupabase()) {
    const adapter = new SupabaseAdapter(request);
    return adapter.respond(await adapter.bootstrap());
  }
  const session = await localStore.ensureSession(
    request.cookies.get(DEMO_COOKIE)?.value,
  );
  const response = NextResponse.json(await localStore.bootstrap(session.token));
  if (session.created)
    response.cookies.set(DEMO_COOKIE, session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
  return response;
});
