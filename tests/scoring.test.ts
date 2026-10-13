import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateConsensus,
  brierScore,
  buildLeaderboard,
  calibration,
  profileStats,
  scorePoints,
  selectScoringRevision,
} from "../src/domain/scoring";
import { createDemoSeed } from "../src/domain/seed";
import {
  forecastSubmissionSchema,
  questionActionSchema,
  questionDraftSchema,
} from "../src/domain/schemas";
import type { ForecastRevision, Profile, Question } from "../src/domain/types";

const question: Question = {
  id: "q1",
  title: "Will the test event happen?",
  description: "A synthetic test scenario.",
  category: "Science & tech",
  horizon: "daily",
  status: "RESOLVED",
  opensAt: "2026-10-01T00:00:00.000Z",
  closesAt: "2026-10-02T00:00:00.000Z",
  resolvesAt: "2026-10-02T01:00:00.000Z",
  resolutionCriteria: "The event must be recorded in the test fixture.",
  sourceName: "Test fixture",
  sourceUrl: "https://example.com/fixture",
  outcome: 1,
  visual: "ai",
  isDemo: true,
};
const person = (id: string): Profile => ({
  id,
  username: id,
  country: "Argentina",
  avatarColor: "#eee",
  isAdmin: false,
});
const revision = (
  overrides: Partial<ForecastRevision> = {},
): ForecastRevision => ({
  id: "r1",
  forecastId: "f1",
  questionId: "q1",
  userId: "u1",
  probability: 0.8,
  reasoning: "",
  createdAt: "2026-10-01T12:00:00.000Z",
  ...overrides,
});
const closeTo = (actual: number, expected: number) =>
  assert.ok(
    Math.abs(actual - expected) < 1e-12,
    `${actual} is not close to ${expected}`,
  );

test("Brier score implements binary squared error, including mathematical endpoints", () => {
  assert.equal(brierScore(1, 1), 0);
  assert.equal(brierScore(0, 0), 0);
  assert.equal(brierScore(1, 0), 1);
  assert.equal(brierScore(0, 1), 1);
  assert.equal(brierScore(0.5, 1), 0.25);
  closeTo(brierScore(0.8, 1), 0.04);
  closeTo(brierScore(0.8, 0), 0.64);
});

test("scoring rejects corrupt probabilities and non-binary outcomes", () => {
  for (const value of [-0.01, 1.01, NaN, Infinity])
    assert.throws(() => brierScore(value, 1), RangeError);
  assert.throws(() => brierScore(0.8, 2 as 1), RangeError);
  assert.throws(() => scorePoints(-1), RangeError);
  assert.throws(() => scorePoints(NaN), RangeError);
  assert.equal(scorePoints(null), 0);
  assert.equal(scorePoints(0.25), 750);
});

test("last valid revision wins, excluding exact deadline, early, late and invalid revisions", () => {
  const selected = revision({
    id: "valid-last",
    probability: 0.7,
    createdAt: "2026-10-01T23:59:59.999Z",
  });
  const rows = [
    revision({
      id: "late",
      probability: 0.99,
      createdAt: "2026-10-02T00:00:00.001Z",
    }),
    revision({ id: "exact", probability: 0.99, createdAt: question.closesAt }),
    revision({ id: "early", createdAt: "2026-09-30T23:59:59.999Z" }),
    selected,
    revision(),
    revision({ id: "bad-date", createdAt: "invalid" }),
    revision({
      id: "invalid-probability",
      probability: 1,
      createdAt: "2026-10-01T23:59:59.999Z",
    }),
    revision({
      id: "another-question",
      questionId: "q2",
      createdAt: "2026-10-01T23:59:59.999Z",
    }),
  ];
  assert.equal(selectScoringRevision(rows, question)?.id, selected.id);
  assert.equal(
    selectScoringRevision([rows[0], rows[1], rows[2]], question),
    null,
  );
  assert.equal(
    selectScoringRevision([revision({ createdAt: question.opensAt })], question)
      ?.id,
    "r1",
  );
});

test("revision tie-breaking is deterministic without mutating immutable history", () => {
  const rows = [
    revision({ id: "a", probability: 0.6 }),
    revision({ id: "b", probability: 0.7 }),
  ];
  assert.equal(selectScoringRevision(rows, question)?.id, "b");
  assert.equal(selectScoringRevision([...rows].reverse(), question)?.id, "b");
  assert.deepEqual(
    rows.map((row) => row.id),
    ["a", "b"],
  );
});

test("only resolved, non-void questions contribute and scoring uses only that user’s final revision", () => {
  const questions: Question[] = [
    question,
    { ...question, id: "open", status: "PUBLISHED", outcome: null },
    { ...question, id: "void", status: "VOID", outcome: 1 },
    { ...question, id: "cancelled", status: "CANCELLED", outcome: 1 },
    { ...question, id: "missing-result", status: "RESOLVED", outcome: null },
  ];
  const rows = [
    revision({ probability: 0.3 }),
    revision({
      id: "r2",
      probability: 0.8,
      createdAt: "2026-10-01T22:00:00.000Z",
    }),
    revision({
      id: "other-user",
      userId: "u2",
      probability: 0.99,
      createdAt: "2026-10-01T23:00:00.000Z",
    }),
    ...questions
      .slice(1)
      .map((q) => revision({ id: q.id, questionId: q.id, probability: 0.99 })),
  ];
  const stats = profileStats("u1", questions, rows);
  assert.equal(stats.resolvedCount, 1);
  closeTo(stats.meanBrier!, 0.04);
  assert.equal(stats.points, 960);
  assert.equal(stats.categories.length, 1);
  assert.equal(stats.categories[0].count, 1);
  assert.equal(profileStats("new-user", questions, rows).meanBrier, null);
  assert.equal(profileStats("new-user", questions, rows).points, 0);
});

test("additional predictions do not grant volume points or improve rank with equal accuracy", () => {
  const question2 = { ...question, id: "q2" };
  const rows = [
    revision({ userId: "few", probability: 0.5 }),
    revision({ id: "many1", userId: "many", probability: 0.5 }),
    revision({
      id: "many2",
      userId: "many",
      questionId: "q2",
      probability: 0.5,
    }),
    revision({
      id: "unresolved",
      userId: "unresolved",
      questionId: "q3",
      probability: 0.99,
    }),
  ];
  const board = buildLeaderboard(
    [person("few"), person("many"), person("unresolved"), person("fresh")],
    [
      question,
      question2,
      { ...question, id: "q3", status: "PUBLISHED", outcome: null },
    ],
    rows,
  );
  assert.equal(board.length, 2);
  assert.deepEqual(
    board.map((row) => row.points),
    [750, 750],
  );
  assert.deepEqual(
    board.map((row) => row.rank),
    [1, 1],
  );
  assert.deepEqual(
    board.map((row) => row.resolvedCount),
    [1, 2],
  );
});

test("ranking precision preserves equal-skill ties despite floating-point accumulation", () => {
  const questions = Array.from({ length: 13 }, (_, index) => ({
    ...question,
    id: `precision-${index}`,
  }));
  const rows = [
    ...questions.map((q, index) =>
      revision({
        id: `many-${index}`,
        questionId: q.id,
        userId: "a-many",
        probability: 0.8,
      }),
    ),
    revision({
      id: "one",
      questionId: questions[0].id,
      userId: "z-one",
      probability: 0.8,
    }),
    revision({
      id: "slightly-better",
      questionId: questions[0].id,
      userId: "better",
      probability: 0.800001,
    }),
    revision({
      id: "worse",
      questionId: questions[0].id,
      userId: "worse",
      probability: 0.79,
    }),
  ];
  const board = buildLeaderboard(
    [person("z-one"), person("worse"), person("a-many"), person("better")],
    questions,
    rows,
  );
  assert.deepEqual(
    board.map(({ userId, rank }) => ({ userId, rank })),
    [
      { userId: "better", rank: 1 },
      { userId: "a-many", rank: 2 },
      { userId: "z-one", rank: 2 },
      { userId: "worse", rank: 4 },
    ],
  );
  // The API continues to expose the original mean rather than a display score.
  assert.notEqual(board[1].meanBrier, board[2].meanBrier);
  closeTo(board[1].meanBrier, 0.04);
  closeTo(board[2].meanBrier, 0.04);
  assert.equal(board[1].resolvedCount, 13);
  assert.equal(board[2].resolvedCount, 1);
  assert.equal(board[1].points, board[2].points);
});

test("calibration pairs mean stated probability with observed event frequency, ignoring empty bins", () => {
  const bins = calibration([
    { probability: 0.81, outcome: 1 },
    { probability: 0.89, outcome: 0 },
    { probability: 0.2, outcome: 0 },
  ]);
  assert.equal(bins.length, 2);
  closeTo(bins[0].probability, 0.2);
  assert.equal(bins[0].outcome, 0);
  closeTo(bins[1].probability, 0.85);
  assert.equal(bins[1].outcome, 0.5);
  assert.equal(bins[1].count, 2);
  assert.deepEqual(calibration([]), []);
});

test("consensus counts people once and replays historical revisions without future leakage", () => {
  const rows = [
    revision({
      id: "u1-early",
      probability: 0.2,
      createdAt: "2026-10-01T01:00:00.000Z",
    }),
    revision({
      id: "u2-early",
      userId: "u2",
      probability: 0.4,
      createdAt: "2026-10-01T02:00:00.000Z",
    }),
    revision({
      id: "u1-update",
      probability: 0.8,
      createdAt: "2026-10-02T01:00:00.000Z",
    }),
    revision({ id: "different-question", questionId: "q2", probability: 0.99 }),
    revision({ id: "invalid", userId: "invalid", probability: NaN }),
  ];
  const consensus = aggregateConsensus("q1", [...rows].reverse())!;
  assert.equal(consensus.participants, 2);
  closeTo(consensus.probability, 0.6);
  assert.equal(consensus.history.length, 2);
  closeTo(consensus.history[0].probability, 0.3);
  closeTo(consensus.history[1].probability, 0.6);
  assert.equal(
    consensus.distribution.reduce((sum, bin) => sum + bin.count, 0),
    2,
  );
  assert.equal(consensus.distribution[2].count, 1);
  assert.equal(consensus.distribution[4].count, 1);
  assert.equal(aggregateConsensus("missing", rows), null);
});

test("forecast API schema rejects timestamp, ownership and boundary tampering", () => {
  assert.equal(
    forecastSubmissionSchema.safeParse({ questionId: "q1", probability: 0.01 })
      .success,
    true,
  );
  assert.equal(
    forecastSubmissionSchema.safeParse({ questionId: "q1", probability: 0.99 })
      .success,
    true,
  );
  for (const probability of [0, 1, 50, -1, "0.5", NaN]) {
    assert.equal(
      forecastSubmissionSchema.safeParse({ questionId: "q1", probability })
        .success,
      false,
    );
  }
  assert.equal(
    forecastSubmissionSchema.safeParse({
      questionId: "q1",
      probability: 0.5,
      createdAt: "yesterday",
    }).success,
    false,
  );
  assert.equal(
    forecastSubmissionSchema.safeParse({
      questionId: "q1",
      probability: 0.5,
      userId: "admin",
    }).success,
    false,
  );
});

test("admin validation enforces a binary resolution outcome and chronological dates", () => {
  assert.equal(
    questionActionSchema.safeParse({
      questionId: "q1",
      action: "resolve",
      outcome: 1,
    }).success,
    true,
  );
  assert.equal(
    questionActionSchema.safeParse({ questionId: "q1", action: "resolve" })
      .success,
    false,
  );
  assert.equal(
    questionActionSchema.safeParse({
      questionId: "q1",
      action: "publish",
      outcome: 1,
    }).success,
    false,
  );
  const {
    id: _id,
    status: _status,
    outcome: _outcome,
    isDemo: _isDemo,
    ...draft
  } = question;
  assert.equal(questionDraftSchema.safeParse(draft).success, true);
  assert.equal(
    questionDraftSchema.safeParse({ ...draft, opensAt: draft.closesAt })
      .success,
    false,
  );
  assert.equal(
    questionDraftSchema.safeParse({ ...draft, resolvesAt: draft.opensAt })
      .success,
    false,
  );
  assert.equal(
    questionDraftSchema.safeParse({
      ...draft,
      sourceUrl: "javascript:alert(1)",
    }).success,
    false,
  );
});

test("seed is explicitly fictional, has fresh daily windows, and gives no invented user history", () => {
  const now = new Date("2026-10-12T12:00:00.000Z");
  const seed = createDemoSeed(now);
  assert.equal(seed.questions.length, 19);
  assert.ok(
    seed.questions.every(
      (q) => q.isDemo && /ejemplo|SIMULACIÓN/i.test(q.description),
    ),
  );
  const daily = seed.questions.filter(
    (q) => q.horizon === "daily" && q.status === "PUBLISHED",
  );
  assert.equal(daily.length, 7);
  assert.deepEqual(
    new Set(daily.map((q) => q.visual)),
    new Set(["space", "climate", "ai"]),
  );
  assert.ok(
    daily.every(
      (q) =>
        Date.parse(q.closesAt) > now.getTime() &&
        Date.parse(q.closesAt) - now.getTime() < 24 * 3_600_000 &&
        Date.parse(q.resolvesAt) - now.getTime() <= 24 * 3_600_000,
    ),
  );
  assert.equal(
    seed.forecasts.length,
    seed.profiles.length * seed.questions.length,
  );
  assert.ok(
    seed.revisions.every((row) => Date.parse(row.createdAt) < now.getTime()),
  );
  for (const q of seed.questions) {
    const {
      id: _id,
      status: _status,
      outcome: _outcome,
      isDemo: _isDemo,
      ...draft
    } = q;
    assert.equal(questionDraftSchema.safeParse(draft).success, true, q.id);
    for (const profile of seed.profiles) {
      assert.ok(
        selectScoringRevision(
          seed.revisions.filter((row) => row.userId === profile.id),
          q,
        ),
        `${profile.id}: ${q.id}`,
      );
    }
  }
  assert.deepEqual(profileStats("new-user", seed.questions, seed.revisions), {
    resolvedCount: 0,
    meanBrier: null,
    points: 0,
    forecastCount: 0,
    calibration: [],
    categories: [],
  });
  assert.deepEqual(createDemoSeed(now), seed);
  assert.throws(() => createDemoSeed(new Date("invalid")), RangeError);
});
