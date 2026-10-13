import { NextResponse } from "next/server";
import { endpoint } from "@/server/http";
import { invariant } from "@/server/errors";
import { checkAuthError, hasSupabase, SupabaseAdapter } from "@/server/supabase";

export const runtime = "nodejs";

// An API-only service returns JSON instead of redirecting to removed UI pages.
export const GET = endpoint(async (request) => {
  invariant(hasSupabase(), 503, "Supabase no está configurado.");
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  invariant(Boolean(code) !== Boolean(tokenHash), 400, "Enviá un único código de confirmación.");
  invariant(Boolean(code) || type === "email", 400, "El tipo de confirmación debe ser email.");
  const adapter = new SupabaseAdapter(request);
  const result = code
    ? await adapter.client.auth.exchangeCodeForSession(code)
    : await adapter.client.auth.verifyOtp({ token_hash: tokenHash!, type: "email" });
  checkAuthError(result.error, 400, "El enlace de confirmación es inválido o venció.");
  return NextResponse.json({ ok: true, message: "Correo confirmado. Consultá tu sesión en /api/auth." });
});
