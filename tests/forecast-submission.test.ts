import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";
import { LocalStore, type LocalData } from "../src/server/local-store";
import { ApiFailure } from "../src/server/errors";
import { protectMutation } from "../src/server/http";

async function fixture(
  run: (
    store: LocalStore,
    filename: string,
    setTime: (date: Date) => void,
  ) => Promise<void>,
) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "forecast-test-"));
  const filename = path.join(directory, "database.json");
  let now = new Date("2026-10-12T12:00:00Z");
  const store = new LocalStore(filename, () => now);
  try {
    await run(store, filename, (date) => {
      now = date;
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("submission persists across adapter instances and preserves every immutable revision", async () => {
  await fixture(async (store, filename) => {
    const session = await store.ensureSession();
    const before = await store.bootstrap(session.token);
    const question = before.questions.find(
      (row) => row.status === "PUBLISHED",
    )!;
    assert.equal(
      question.consensus,
      null,
      "community data must be hidden before first forecast",
    );
    assert.equal(before.stats.forecastCount, 0);
    const first = await store.submitForecast(session.token, {
      questionId: question.id,
      probability: 0.61,
      reasoning: "My base rate.",
    });
    const reloaded = new LocalStore(
      filename,
      () => new Date("2026-10-12T12:00:01Z"),
    );
    const confirmed = await reloaded.bootstrap(session.token);
    const own = confirmed.questions.find((row) => row.id === question.id)!;
    assert.equal(own.forecast?.probability, 0.61);
    assert.equal(own.consensus?.participants, 9);
    const updated = await reloaded.submitForecast(session.token, {
      questionId: question.id,
      probability: 0.72,
      reasoning: "New evidence.",
    });
    assert.equal(updated.id, first.id);
    assert.equal(updated.revisionCount, 2);
    const data = JSON.parse(await readFile(filename, "utf8")) as LocalData;
    const revisions = data.revisions.filter(
      (row) => row.userId === session.profile.id,
    );
    assert.deepEqual(
      revisions.map((row) => row.probability),
      [0.61, 0.72],
    );
    assert.equal(revisions[0].reasoning, "My base rate.");
    assert.equal(revisions[0].createdAt, first.updatedAt);
    assert.ok(
      Date.parse(revisions[1].createdAt) > Date.parse(revisions[0].createdAt),
    );
    assert.ok(
      !JSON.stringify(data).includes(session.token),
      "only a hash of session secrets is stored",
    );
  });
});

test("anonymous, closed, and exact-deadline submissions are rejected without a write", async () => {
  await fixture(async (store, filename, setTime) => {
    const session = await store.ensureSession();
    const initial = await store.bootstrap(session.token);
    const question = initial.questions.find(
      (row) => row.status === "PUBLISHED",
    )!;
    const input = { questionId: question.id, probability: 0.7, reasoning: "" };
    const before = await readFile(filename, "utf8");
    await assert.rejects(
      store.submitForecast(undefined, input),
      (error) => error instanceof ApiFailure && error.status === 401,
    );
    await assert.rejects(
      store.submitForecast("forged-token", input),
      (error) => error instanceof ApiFailure && error.status === 401,
    );
    setTime(new Date(question.closesAt));
    await assert.rejects(
      store.submitForecast(session.token, input),
      /plazo para pronosticar terminó/,
    );
    assert.equal(await readFile(filename, "utf8"), before);
    const resolved = initial.questions.find(
      (row) => row.status === "RESOLVED",
    )!;
    await assert.rejects(
      store.submitForecast(session.token, {
        ...input,
        questionId: resolved.id,
      }),
      /no acepta pronósticos/,
    );
  });
});

test("consensus unlock is scoped to the current user and question", async () => {
  await fixture(async (store) => {
    const alice = await store.ensureSession();
    const bob = await store.ensureSession();
    const question = (await store.bootstrap(alice.token)).questions.find(
      (row) => row.status === "PUBLISHED",
    )!;
    await store.submitForecast(alice.token, {
      questionId: question.id,
      probability: 0.42,
      reasoning: "",
    });
    const aliceView = await store.bootstrap(alice.token);
    const bobView = await store.bootstrap(bob.token);
    assert.ok(
      aliceView.questions.find((row) => row.id === question.id)?.consensus,
    );
    assert.ok(
      aliceView.questions
        .filter((row) => row.id !== question.id)
        .every((row) => row.consensus === null),
    );
    assert.ok(
      bobView.questions.every(
        (row) => row.consensus === null && row.forecast === null,
      ),
    );
    assert.ok(!JSON.stringify(bobView).includes("revisionCount"));
  });
});

test("parallel submissions serialize updates and keep a strict revision order", async () => {
  await fixture(async (store, filename) => {
    const session = await store.ensureSession();
    const question = (await store.bootstrap(session.token)).questions.find(
      (row) => row.status === "PUBLISHED",
    )!;
    const another = new LocalStore(
      filename,
      () => new Date("2026-10-12T12:00:00Z"),
    );
    await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        (index % 2 ? another : store).submitForecast(session.token, {
          questionId: question.id,
          probability: 0.1 + index / 20,
          reasoning: `Revision ${index + 1}`,
        }),
      ),
    );
    const data = JSON.parse(await readFile(filename, "utf8")) as LocalData;
    const revisions = data.revisions.filter(
      (row) => row.userId === session.profile.id,
    );
    assert.equal(revisions.length, 10);
    assert.equal(new Set(revisions.map((row) => row.createdAt)).size, 10);
    const forecast = data.forecasts.find(
      (row) => row.userId === session.profile.id,
    )!;
    assert.equal(forecast.revisionCount, 10);
    assert.equal(forecast.probability, revisions.at(-1)?.probability);
  });
});

test("manual resolution persists a score from the last valid forecast and freezes published criteria", async () => {
  await fixture(async (store, filename) => {
    const session = await store.ensureSession();
    const question = (await store.bootstrap(session.token)).questions.find(
      (row) => row.status === "PUBLISHED",
    )!;
    await store.submitForecast(session.token, {
      questionId: question.id,
      probability: 0.2,
      reasoning: "",
    });
    await store.submitForecast(session.token, {
      questionId: question.id,
      probability: 0.8,
      reasoning: "",
    });
    await assert.rejects(
      store.adminQuestion(session.token, {
        action: "update",
        questionId: question.id,
      }),
      /Solo se pueden editar borradores/,
    );
    await assert.rejects(
      store.adminQuestion(session.token, {
        action: "resolve",
        questionId: question.id,
        outcome: 1,
      }),
      /Cerrá los pronósticos/,
    );
    await store.adminQuestion(session.token, {
      action: "close",
      questionId: question.id,
    });
    await store.adminQuestion(session.token, {
      action: "resolve",
      questionId: question.id,
      outcome: 1,
    });
    const after = await store.bootstrap(session.token);
    assert.equal(after.stats.resolvedCount, 1);
    assert.ok(Math.abs(after.stats.meanBrier! - 0.04) < 1e-12);
    assert.equal(after.stats.points, 960);
    const data = JSON.parse(await readFile(filename, "utf8")) as LocalData;
    assert.equal(
      data.resolutions.filter((row) => row.questionId === question.id).length,
      1,
    );
    const score = data.scores.find((row) => row.userId === session.profile.id)!;
    assert.equal(score.points, 960);
    assert.equal(
      data.revisions.find((row) => row.id === score.forecastRevisionId)
        ?.probability,
      0.8,
    );
    await assert.rejects(
      store.adminQuestion(session.token, {
        action: "void",
        questionId: question.id,
      }),
      /estado final/,
    );
  });
});

test("private invitation joins are idempotent and comparisons exclude unequal question sets", async () => {
  await fixture(async (store) => {
    const alice = await store.ensureSession();
    const bob = await store.ensureSession();
    const league = await store.createLeague(alice.token, {
      name: "Friends Club",
      description: "",
      period: "weekly",
    });
    assert.equal(league.memberCount, 1);
    assert.equal(league.members[0].rank, 0);
    assert.equal((await store.bootstrap(bob.token)).leagues.length, 0);
    await store.joinLeague(bob.token, league.code.toLowerCase());
    const joined = await store.joinLeague(bob.token, league.code);
    assert.equal(joined.memberCount, 2);
    assert.equal(joined.members.length, 2);
    assert.ok(
      joined.members.every((row) => row.resolvedCount === 0 && row.rank === 0),
    );
    await assert.rejects(
      store.joinLeague(bob.token, "UNKNOWN"),
      /Ninguna liga coincide/,
    );
  });
});

test("cookie-authenticated mutations reject cross-origin and form submissions", () => {
  assert.throws(
    () =>
      protectMutation(
        new NextRequest("https://forecast.example/api/forecasts", {
          method: "POST",
          headers: {
            origin: "https://attacker.example",
            "content-type": "application/json",
          },
        }),
      ),
    /otro origen/,
  );
  assert.throws(
    () =>
      protectMutation(
        new NextRequest("https://forecast.example/api/forecasts", {
          method: "POST",
          headers: {
            origin: "https://forecast.example",
            "content-type": "application/x-www-form-urlencoded",
          },
        }),
      ),
    /JSON/,
  );
  assert.doesNotThrow(() =>
    protectMutation(
      new NextRequest("https://forecast.example/api/forecasts", {
        method: "POST",
        headers: {
          origin: "https://forecast.example",
          "content-type": "application/json",
        },
      }),
    ),
  );
  assert.doesNotThrow(
    () =>
      protectMutation(
        new NextRequest("http://0.0.0.0:3000/api/forecasts", {
          method: "POST",
          headers: {
            host: "192.168.1.42:3000",
            origin: "http://192.168.1.42:3000",
            "content-type": "application/json",
          },
        }),
      ),
    "same-origin phone requests must work when Next binds to 0.0.0.0",
  );
});

test("participation auditing is confined to administrator sessions", async () => {
  await fixture(async (store, filename) => {
    const admin = await store.ensureSession();
    assert.ok(
      (await store.participation(admin.token)).every(
        (row) => row.participants === 8 && row.revisions === 24,
      ),
    );
    const user = await store.ensureSession();
    const data = JSON.parse(await readFile(filename, "utf8")) as LocalData;
    data.profiles.find((profile) => profile.id === user.profile.id)!.isAdmin =
      false;
    await writeFile(filename, JSON.stringify(data));
    await assert.rejects(
      store.participation(user.token),
      (error) => error instanceof ApiFailure && error.status === 403,
    );
    await assert.rejects(
      store.adminQuestion(user.token, {
        action: "close",
        questionId: "demo-orbit",
      }),
      (error) => error instanceof ApiFailure && error.status === 403,
    );
    assert.ok(
      (await store.bootstrap(user.token)).questions.every(
        (question) => question.consensus === null,
      ),
    );
  });
});
