import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { ApiFailure } from "../src/server/errors";
import { endpoint } from "../src/server/http";
import {
  checkAuthError,
  hasSupabase,
  SupabaseAdapter,
} from "../src/server/supabase";

const jwt = (expires: number, role = "authenticated") =>
  [
    { alg: "HS256", typ: "JWT" },
    {
      sub: "11111111-1111-4111-8111-111111111111",
      role,
      aud: "authenticated",
      exp: expires,
    },
  ]
    .map((value) => Buffer.from(JSON.stringify(value)).toString("base64url"))
    .join(".") + ".dGVzdA";

async function environment(run: () => Promise<void> | void) {
  const before = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
  try {
    await run();
  } finally {
    if (before.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = before.url;
    if (before.key === undefined)
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = before.key;
  }
}

test("Supabase mode refuses partial, malformed, or privileged configuration without falling back to demo", async () => {
  await environment(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    assert.equal(hasSupabase(), false);
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    assert.throws(
      hasSupabase,
      (error) => error instanceof ApiFailure && error.status === 503,
    );
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "sb_publishable_test";
    assert.equal(hasSupabase(), true);
    process.env.NEXT_PUBLIC_SUPABASE_URL = "not-a-url";
    assert.throws(hasSupabase, /URL HTTP o HTTPS válida/);
    process.env.NEXT_PUBLIC_SUPABASE_URL = "file:///private/project";
    assert.throws(hasSupabase, /URL HTTP o HTTPS válida/);
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = jwt(
      9_999_999_999,
      "service_role",
    );
    assert.throws(hasSupabase, /nunca una clave secreta ni de servicio/);
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "sb_secret_test";
    assert.throws(hasSupabase, /nunca una clave secreta ni de servicio/);
  });
});

test("Supabase refresh cookies survive a later database error", async () => {
  await environment(async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "sb_publishable_test";
    const now = Math.floor(Date.now() / 1000);
    const user = {
      id: "11111111-1111-4111-8111-111111111111",
      email: "test@example.com",
      role: "authenticated",
      aud: "authenticated",
      app_metadata: {},
      user_metadata: {},
      created_at: "2026-01-01T00:00:00Z",
    };
    const oldSession = {
      access_token: jwt(now - 600),
      refresh_token: "old-refresh",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: now - 600,
      user,
    };
    const newSession = {
      ...oldSession,
      access_token: jwt(now + 3600),
      refresh_token: "new-refresh",
      expires_at: now + 3600,
    };
    const value =
      "base64-" + Buffer.from(JSON.stringify(oldSession)).toString("base64url");
    const previousFetch = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/auth/v1/token")) return Response.json(newSession);
      if (url.includes("/auth/v1/user")) return Response.json(user);
      if (url.includes("/rest/v1/profiles")) {
        assert.equal(
          new Headers(init?.headers).get("authorization"),
          `Bearer ${newSession.access_token}`,
        );
        return Response.json(
          { code: "P0001", message: "Simulated profile failure" },
          { status: 400 },
        );
      }
      throw new Error(`Unexpected request in test: ${url}`);
    };
    try {
      const route = endpoint(async (request) => {
        const adapter = new SupabaseAdapter(request);
        return adapter.respond({ user: await adapter.user() });
      });
      const response = await route(
        new NextRequest("http://localhost:3000/api/test", {
          headers: { cookie: `sb-example-auth-token=${value}` },
        }),
      );
      assert.equal(response.status, 409);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      const cookie = response.headers.get("set-cookie")!;
      assert.ok(
        cookie,
        "rotated session must reach the browser even when the operation fails",
      );
      assert.match(cookie, /HttpOnly/i);
      assert.match(cookie, /SameSite=lax/i);
      assert.ok(calls.some((url) => url.includes("/auth/v1/token")));
      const stored = JSON.parse(
        Buffer.from(
          cookie.split(";")[0].split("=")[1].slice("base64-".length),
          "base64url",
        ).toString("utf8"),
      );
      assert.equal(stored.refresh_token, "new-refresh");
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});

test("authentication outages and rate limits remain distinguishable from invalid credentials", () => {
  assert.throws(
    () =>
      checkAuthError(
        new AuthRetryableFetchError("Unavailable", 503),
        401,
        "Bad credentials",
      ),
    (error) => error instanceof ApiFailure && error.status === 503,
  );
  assert.throws(
    () =>
      checkAuthError(
        new AuthApiError("Too many requests", 429, undefined),
        401,
        "Bad credentials",
      ),
    (error) => error instanceof ApiFailure && error.status === 429,
  );
  assert.throws(
    () =>
      checkAuthError(
        new AuthApiError("Invalid credentials", 400, undefined),
        401,
        "Bad credentials",
      ),
    (error) =>
      error instanceof ApiFailure &&
      error.status === 401 &&
      error.message === "Bad credentials",
  );
});
