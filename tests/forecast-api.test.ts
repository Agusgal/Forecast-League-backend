import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";
import type { Bootstrap } from "../src/domain/types";

test("route boundary establishes a private session, validates input, persists a forecast and unlocks consensus", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "forecast-api-"));
  process.env.FORECAST_DATA_PATH = path.join(directory, "db.json");
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  try {
    // Dynamic imports ensure this test worker's singleton uses its isolated file.
    const bootstrapRoute = await import("../src/app/api/bootstrap/route");
    const forecastRoute = await import("../src/app/api/forecasts/route");
    const response = await bootstrapRoute.GET(
      new NextRequest("http://localhost:3000/api/bootstrap"),
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const setCookie = response.headers.get("set-cookie")!;
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=lax/i);
    const cookie = setCookie.split(";")[0];
    const initial = (await response.json()) as Bootstrap;
    const question = initial.questions.find(
      (row) => row.status === "PUBLISHED",
    )!;
    assert.equal(question.consensus, null);
    const post = (payload: unknown, origin = "http://localhost:3000") =>
      forecastRoute.POST(
        new NextRequest("http://localhost:3000/api/forecasts", {
          method: "POST",
          headers: { cookie, origin, "content-type": "application/json" },
          body: JSON.stringify(payload),
        }),
      );
    const payload = {
      questionId: question.id,
      probability: 0.73,
      reasoning: "A tested forecast.",
    };
    assert.equal(
      (await post({ ...payload, userId: "someone-else" })).status,
      400,
    );
    assert.equal(
      (await post({ ...payload, createdAt: "2000-01-01T00:00:00Z" })).status,
      400,
    );
    assert.equal((await post({ ...payload, probability: 73 })).status, 400);
    assert.equal((await post(payload, "https://attacker.example")).status, 403);
    const saved = await post(payload);
    assert.equal(saved.status, 200);
    const record = await saved.json();
    assert.equal(record.forecast.userId, initial.user!.id);
    assert.equal(record.forecast.probability, 0.73);
    const afterResponse = await bootstrapRoute.GET(
      new NextRequest("http://localhost:3000/api/bootstrap", {
        headers: { cookie },
      }),
    );
    const after = (await afterResponse.json()) as Bootstrap;
    const updated = after.questions.find((row) => row.id === question.id)!;
    assert.equal(updated.forecast?.probability, 0.73);
    assert.equal(updated.consensus?.participants, 9);
    assert.equal(after.stats.forecastCount, 1);
    assert.equal(after.stats.resolvedCount, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
    delete process.env.FORECAST_DATA_PATH;
  }
});
