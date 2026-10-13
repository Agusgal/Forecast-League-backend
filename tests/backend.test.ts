import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { GET as service } from "../src/app/route";
import { GET as callback } from "../src/app/auth/callback/route";

const request = (query = "") => new NextRequest(`http://localhost:3002/auth/callback${query}`);

test("backend root reports process liveness without creating a user session", async () => {
  const response = service();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).service, "forecast-league-backend");
  assert.equal(response.headers.get("set-cookie"), null);
});

test("standalone callback returns JSON and cookies, without depending on removed screens", async () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const originalFetch = globalThis.fetch;
  try {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    assert.equal((await callback(request())).status, 503);
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "sb_publishable_test";
    for (const query of ["", "?code=a&token_hash=b", "?token_hash=a&type=recovery"]) {
      assert.equal((await callback(request(query))).status, 400);
    }
    globalThis.fetch = async () => Response.json({ msg: "Expired", error_code: "otp_expired" }, { status: 400 });
    const rejected = await callback(request("?token_hash=expired&type=email"));
    assert.equal(rejected.status, 400);
    assert.equal(rejected.headers.get("location"), null);
    assert.match((await rejected.json()).error, /inválido o venció/);

    globalThis.fetch = async (input) => {
      assert.match(String(input), /\/auth\/v1\/verify/);
      return Response.json({
        access_token: "test-access", refresh_token: "test-refresh",
        token_type: "bearer", expires_in: 3600,
        user: { id: "11111111-1111-4111-8111-111111111111", email: "fixture@example.test", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
      });
    };
    const confirmed = await callback(request("?token_hash=fixture&type=email"));
    assert.equal(confirmed.status, 200);
    assert.equal((await confirmed.json()).ok, true);
    assert.equal(confirmed.headers.get("location"), null);
    assert.match(confirmed.headers.get("set-cookie") ?? "", /HttpOnly/i);
    assert.equal(confirmed.headers.get("cache-control"), "private, no-store");
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousKey;
  }
});
