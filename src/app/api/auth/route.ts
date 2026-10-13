import { NextResponse } from "next/server";
import { z } from "zod";
import { body, endpoint } from "@/server/http";
import { throttleAuth } from "@/server/auth-throttle";
import { DEMO_COOKIE, localStore, SESSION_MAX_AGE } from "@/server/local-store";
import {
  checkAuthError,
  hasSupabase,
  SupabaseAdapter,
} from "@/server/supabase";

const authSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("logout") }).strict(),
  z
    .object({
      action: z.literal("login"),
      email: z.email().max(254),
      password: z.string().min(1).max(128),
    })
    .strict(),
  z
    .object({
      action: z.literal("signup"),
      email: z.email().max(254),
      password: z.string().min(8).max(128),
      username: z.string().trim().min(2).max(32),
    })
    .strict(),
]);

export const runtime = "nodejs";
export const POST = endpoint(async (request) => {
  const input = await body(request, authSchema);
  if (input.action !== "logout") throttleAuth(input.email);
  if (!hasSupabase()) {
    const previousToken = request.cookies.get(DEMO_COOKIE)?.value;
    if (input.action === "logout") {
      await localStore.logout(previousToken);
      const response = NextResponse.json({ ok: true });
      response.cookies.set(DEMO_COOKIE, "", {
        httpOnly: true,
        path: "/",
        sameSite: "lax",
        maxAge: 0,
      });
      return response;
    }
    const session =
      input.action === "signup"
        ? await localStore.createAccount(input, previousToken)
        : await localStore.signIn(input, previousToken);
    const response = NextResponse.json({ user: session.profile });
    response.cookies.set(DEMO_COOKIE, session.token, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_MAX_AGE,
    });
    return response;
  }
  const adapter = new SupabaseAdapter(request);
  if (input.action === "logout") {
    const result = await adapter.client.auth.signOut();
    checkAuthError(
      result.error,
      400,
      "No se pudo cerrar la sesión. Intentá de nuevo.",
    );
    return adapter.respond({ ok: true });
  }
  if (input.action === "login") {
    const result = await adapter.client.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    checkAuthError(
      result.error,
      401,
      "No se pudo iniciar sesión. Revisá tu correo y contraseña, y confirmá tu correo si hace falta.",
    );
    return adapter.respond({ user: await adapter.user() });
  }
  const result = await adapter.client.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: { username: input.username },
      emailRedirectTo: new URL(
        "/auth/callback",
        request.headers.get("origin") ?? request.url,
      ).toString(),
    },
  });
  checkAuthError(
    result.error,
    400,
    "No se pudo crear la cuenta. Revisá tus datos o intentá iniciar sesión.",
  );
  return adapter.respond({
    user: result.data.session ? await adapter.user() : null,
    message: result.data.session
      ? "Tu cuenta está lista."
      : "Revisá tu correo para confirmar tu cuenta y después iniciá sesión.",
  });
});

export const GET = endpoint(async (request) => {
  if (hasSupabase()) {
    const adapter = new SupabaseAdapter(request);
    return adapter.respond({
      mode: "supabase",
      user: await adapter.user(false),
    });
  }
  return NextResponse.json({
    mode: "demo",
    user: await localStore.currentProfile(
      request.cookies.get(DEMO_COOKIE)?.value,
    ),
  });
});
