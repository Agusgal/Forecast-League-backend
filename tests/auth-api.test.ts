import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";

test("local signup preserves guest forecasts, hashes credentials, rotates sessions, and supports returning sign-in", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "forecast-auth-"));
  const filename = path.join(directory, "db.json");
  process.env.FORECAST_DATA_PATH = filename;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  try {
    const auth = await import("../src/app/api/auth/route");
    const bootstrap = await import("../src/app/api/bootstrap/route");
    const forecasts = await import("../src/app/api/forecasts/route");
    const get = (cookie = "") =>
      auth.GET(
        new NextRequest("http://localhost:3000/api/auth", {
          headers: { cookie },
        }),
      );
    const post = (
      payload: unknown,
      cookie = "",
      origin = "http://localhost:3000",
    ) =>
      auth.POST(
        new NextRequest("http://localhost:3000/api/auth", {
          method: "POST",
          headers: { cookie, origin, "content-type": "application/json" },
          body: JSON.stringify(payload),
        }),
      );
    assert.deepEqual(await (await get()).json(), { mode: "demo", user: null });
    const guestResponse = await bootstrap.GET(
      new NextRequest("http://localhost:3000/api/bootstrap"),
    );
    const guestCookie = guestResponse.headers.get("set-cookie")!.split(";")[0];
    const guest = await guestResponse.json();
    const question = guest.questions.find(
      (row: { status: string }) => row.status === "PUBLISHED",
    );
    const saved = await forecasts.POST(
      new NextRequest("http://localhost:3000/api/forecasts", {
        method: "POST",
        headers: {
          cookie: guestCookie,
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({ questionId: question.id, probability: 0.67 }),
      }),
    );
    assert.equal(saved.status, 200);
    const payload = {
      action: "signup",
      username: "Test Forecaster",
      email: "FORECASTER@example.test",
      password: "local-test-password-2026",
    };
    assert.equal((await post({ ...payload, isAdmin: true })).status, 400);
    assert.equal((await post({ ...payload, password: "short" })).status, 400);
    assert.equal(
      (await post(payload, guestCookie, "https://untrusted.example")).status,
      403,
    );
    const created = await post(payload, guestCookie);
    assert.equal(created.status, 200);
    const user = (await created.json()).user;
    assert.equal(user.id, guest.user.id);
    assert.equal(user.isRegistered, true);
    assert.equal(user.username, payload.username);
    assert.equal("email" in user, false);
    assert.equal("passwordHash" in user, false);
    const setCookie = created.headers.get("set-cookie")!;
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=lax/i);
    const registeredCookie = setCookie.split(";")[0];
    assert.notEqual(registeredCookie, guestCookie);
    assert.equal((await (await get(guestCookie)).json()).user, null);
    assert.equal((await (await get(registeredCookie)).json()).user.id, user.id);
    const snapshot = await readFile(filename, "utf8");
    assert.equal(snapshot.includes(payload.password), false);
    const stored = JSON.parse(snapshot);
    assert.equal(stored.accounts[0].email, "forecaster@example.test");
    assert.equal(stored.accounts[0].passwordHash.length, 128);
    assert.equal(stored.accounts[0].passwordSalt.length, 32);
    assert.equal(
      (await post({ ...payload, email: "forecaster@example.test" })).status,
      409,
    );
    assert.equal(
      (await post({ action: "logout" }, registeredCookie)).status,
      200,
    );
    assert.equal((await (await get(registeredCookie)).json()).user, null);
    assert.equal(
      (
        await post({
          action: "login",
          email: payload.email,
          password: "incorrect",
        })
      ).status,
      401,
    );
    const login = await post({
      action: "login",
      email: "forecaster@example.test",
      password: payload.password,
    });
    assert.equal(login.status, 200);
    assert.equal((await login.json()).user.id, user.id);
    const loginCookie = login.headers.get("set-cookie")!.split(";")[0];
    const after = await (
      await bootstrap.GET(
        new NextRequest("http://localhost:3000/api/bootstrap", {
          headers: { cookie: loginCookie },
        }),
      )
    ).json();
    assert.equal(after.stats.forecastCount, 1);
    assert.equal(
      after.questions.find((row: { id: string }) => row.id === question.id)
        .forecast.probability,
      0.67,
    );
    assert.equal(JSON.stringify(after).includes("passwordHash"), false);
    assert.equal(
      JSON.stringify(after).includes("forecaster@example.test"),
      false,
    );
    const { LocalStore } = await import("../src/server/local-store");
    const reopened = new LocalStore(filename);
    assert.equal(
      (
        await reopened.signIn({
          email: payload.email,
          password: payload.password,
        })
      ).profile.id,
      user.id,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
    delete process.env.FORECAST_DATA_PATH;
  }
});

test("authentication attempts are bounded per normalized account", async () => {
  const { throttleAuth } = await import("../src/server/auth-throttle");
  for (let i = 0; i < 10; i++) throttleAuth("rate-limit@example.test", 1000);
  assert.throws(() => throttleAuth("RATE-LIMIT@example.test", 1001), {
    status: 429,
  });
  assert.doesNotThrow(() => throttleAuth("rate-limit@example.test", 61000));
});
