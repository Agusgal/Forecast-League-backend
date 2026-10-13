import assert from "node:assert/strict";
import test from "node:test";
import { createDemoSeed } from "../src/domain/seed";
import { upgradeDemoContent } from "../src/server/demo-content";
import type { LocalData } from "../src/server/local-store";
import { label, decimal } from "../src/lib/locale";
import { body } from "../src/server/http";
import { forecastSubmissionSchema } from "../src/domain/schemas";
import { NextRequest } from "next/server";

test("Spanish demo upgrade is additive, idempotent and preserves existing accounts and forecast history", () => {
  const now = new Date("2026-10-12T12:00:00Z");
  const seed = createDemoSeed(now);
  const data: LocalData = {
    ...seed,
    version: 1,
    questions: seed.questions.filter((q) => !q.id.startsWith("demo-ar-")),
    forecasts: seed.forecasts.filter(
      (f) => !f.questionId.startsWith("demo-ar-"),
    ),
    revisions: seed.revisions.filter(
      (r) => !r.questionId.startsWith("demo-ar-"),
    ),
    sessions: [],
    accounts: [
      {
        userId: "real-user",
        email: "local@example.test",
        passwordHash: "unchanged-hash",
        passwordSalt: "unchanged-salt",
        createdAt: now.toISOString(),
      },
    ],
    resolutions: [],
    scores: [],
  };
  data.questions[0].title = "Will the next orbital test mission reach orbit?";
  const before = structuredClone(data);
  const custom = {
    ...data.questions[0],
    id: "user-question",
    title: "Mi pregunta personalizada",
    isDemo: false,
  };
  data.questions.push(custom);
  assert.equal(upgradeDemoContent(data, now), true);
  assert.equal(
    data.questions[0].title,
    "¿La próxima misión de prueba alcanzará la órbita?",
  );
  assert.equal(data.questions[0].closesAt, before.questions[0].closesAt);
  assert.equal(data.questions.at(10), custom);
  assert.deepEqual(data.accounts, before.accounts);
  assert.deepEqual(data.forecasts, before.forecasts);
  assert.deepEqual(data.revisions, before.revisions);
  assert.deepEqual(data.scores, before.scores);
  const local = data.questions.filter((q) => q.id.startsWith("demo-ar-"));
  assert.equal(local.length, 9);
  assert.ok(
    local.every(
      (q) =>
        q.isDemo &&
        q.status === "PUBLISHED" &&
        q.outcome === null &&
        q.description.includes("SIMULACIÓN"),
    ),
  );
  const after = structuredClone(data);
  assert.equal(upgradeDemoContent(data, new Date("2026-10-20")), false);
  assert.deepEqual(data, after);
});

test("Spanish presentation keeps enum storage stable and localizes validation errors", async () => {
  assert.equal(label("Science & tech"), "Ciencia y tecnología");
  assert.equal(label("PUBLISHED"), "Publicada");
  assert.equal(label("weekly"), "Semanal");
  assert.equal(decimal(0.125), "0,125");
  const request = new NextRequest("http://localhost/api/forecasts", {
    method: "POST",
    body: JSON.stringify({ questionId: "example", probability: 2 }),
  });
  await assert.rejects(
    () => body(request, forecastSubmissionSchema),
    (error) =>
      error instanceof Error &&
      error.message.startsWith("Probabilidad:") &&
      !error.message.includes("Too big"),
  );
});
