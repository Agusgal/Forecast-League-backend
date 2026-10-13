import type {
  Consensus,
  ForecastRevision,
  LeaderboardEntry,
  Profile,
  ProfileStats,
  Question,
} from "./types";

/** Probabilities use fractions throughout the domain and API, never percentages. */
export function brierScore(probability: number, outcome: 0 | 1): number {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new RangeError(
      "La probabilidad debe ser un número finito entre 0 y 1.",
    );
  }
  if (outcome !== 0 && outcome !== 1)
    throw new RangeError("El resultado debe ser 0 o 1.");
  return (probability - outcome) ** 2;
}

/** A transparent display score, not a skill rating or a sum that rewards volume. */
export function scorePoints(meanBrier: number | null): number {
  if (meanBrier === null) return 0;
  if (!Number.isFinite(meanBrier) || meanBrier < 0 || meanBrier > 1) {
    throw new RangeError("El Brier promedio debe estar entre 0 y 1.");
  }
  return Math.round(1_000 * (1 - meanBrier));
}

function validProbability(probability: number): boolean {
  return (
    Number.isFinite(probability) && probability >= 0.01 && probability <= 0.99
  );
}

function isLater(
  candidate: ForecastRevision,
  current: ForecastRevision,
): boolean {
  const difference =
    Date.parse(candidate.createdAt) - Date.parse(current.createdAt);
  return (
    difference > 0 ||
    (difference === 0 && candidate.id.localeCompare(current.id) > 0)
  );
}

/**
 * Select from one user's immutable history. A revision at the exact deadline is
 * already closed. Invalid, early and late revisions can never affect accuracy.
 */
export function selectScoringRevision(
  revisions: readonly ForecastRevision[],
  question: Question,
): ForecastRevision | null {
  const opensAt = Date.parse(question.opensAt);
  const closesAt = Date.parse(question.closesAt);
  if (
    !Number.isFinite(opensAt) ||
    !Number.isFinite(closesAt) ||
    opensAt >= closesAt
  )
    return null;
  let selected: ForecastRevision | null = null;
  for (const revision of revisions) {
    const time = Date.parse(revision.createdAt);
    if (
      revision.questionId !== question.id ||
      !validProbability(revision.probability) ||
      !Number.isFinite(time) ||
      time < opensAt ||
      time >= closesAt
    )
      continue;
    if (!selected || isLater(revision, selected)) selected = revision;
  }
  return selected;
}

interface ScoredForecast {
  question: Question;
  revision: ForecastRevision;
  brier: number;
  outcome: 0 | 1;
}

function resolvedForecasts(
  userId: string,
  questions: readonly Question[],
  revisions: readonly ForecastRevision[],
): ScoredForecast[] {
  const userRevisions = revisions.filter(
    (revision) => revision.userId === userId,
  );
  return questions.flatMap((question) => {
    if (
      question.status !== "RESOLVED" ||
      (question.outcome !== 0 && question.outcome !== 1)
    )
      return [];
    const revision = selectScoringRevision(userRevisions, question);
    return revision
      ? [
          {
            question,
            revision,
            outcome: question.outcome,
            brier: brierScore(revision.probability, question.outcome),
          },
        ]
      : [];
  });
}

/** Ten equal-width buckets; x is mean stated probability, y observed frequency. */
export function calibration(
  forecasts: readonly { probability: number; outcome: 0 | 1 }[],
): ProfileStats["calibration"] {
  const bins = Array.from({ length: 10 }, () => ({
    probability: 0,
    outcome: 0,
    count: 0,
  }));
  for (const forecast of forecasts) {
    // Validate rather than quietly manufacture a chart from corrupt scores.
    brierScore(forecast.probability, forecast.outcome);
    const bin = bins[Math.min(9, Math.floor(forecast.probability * 10))];
    bin.probability += forecast.probability;
    bin.outcome += forecast.outcome;
    bin.count += 1;
  }
  return bins
    .filter((bin) => bin.count > 0)
    .map((bin) => ({
      probability: bin.probability / bin.count,
      outcome: bin.outcome / bin.count,
      count: bin.count,
    }));
}

export function profileStats(
  userId: string,
  questions: readonly Question[],
  revisions: readonly ForecastRevision[],
): ProfileStats {
  const scored = resolvedForecasts(userId, questions, revisions);
  const meanBrier = scored.length
    ? scored.reduce((sum, row) => sum + row.brier, 0) / scored.length
    : null;
  const categories = new Map<string, { sum: number; count: number }>();
  for (const row of scored) {
    const category = categories.get(row.question.category) ?? {
      sum: 0,
      count: 0,
    };
    category.sum += row.brier;
    category.count += 1;
    categories.set(row.question.category, category);
  }
  const userRevisions = revisions.filter(
    (revision) => revision.userId === userId,
  );
  const forecastCount = questions.filter(
    (question) => selectScoringRevision(userRevisions, question) !== null,
  ).length;
  return {
    resolvedCount: scored.length,
    meanBrier,
    points: scorePoints(meanBrier),
    forecastCount,
    calibration: calibration(
      scored.map((row) => ({
        probability: row.revision.probability,
        outcome: row.outcome,
      })),
    ),
    categories: [...categories.entries()]
      .map(([category, row]) => ({
        category,
        meanBrier: row.sum / row.count,
        count: row.count,
      }))
      .sort((a, b) => a.category.localeCompare(b.category)),
  };
}

// Match SQL's round(mean_brier, 12) ranking precision while retaining raw
// accuracy. Binary floating-point summation must not split equal-skill ties.
const rankKey = (meanBrier: number) =>
  Math.round(meanBrier * 1_000_000_000_000);

/** No unresolved predictions or participation bonuses affect rankings. */
export function buildLeaderboard(
  profiles: readonly Profile[],
  questions: readonly Question[],
  revisions: readonly ForecastRevision[],
): LeaderboardEntry[] {
  const rows = profiles
    .flatMap((profile) => {
      const stats = profileStats(profile.id, questions, revisions);
      if (stats.meanBrier === null) return [];
      return [
        {
          userId: profile.id,
          username: profile.username,
          country: profile.country,
          meanBrier: stats.meanBrier,
          resolvedCount: stats.resolvedCount,
          points: stats.points,
          rank: 0,
        },
      ];
    })
    .sort(
      (a, b) =>
        rankKey(a.meanBrier) - rankKey(b.meanBrier) ||
        a.username.localeCompare(b.username),
    );
  // Equal accuracy means equal rank regardless of sample size.
  let previousKey: number | null = null;
  let rank = 0;
  return rows.map((row, index) => {
    const key = rankKey(row.meanBrier);
    if (key !== previousKey) rank = index + 1;
    previousKey = key;
    return { ...row, rank };
  });
}

/**
 * SERVER USE ONLY: callers must check that the requester has forecast on this
 * question before returning these aggregates. Never ship private raw revisions
 * in a browser bootstrap payload. Each person contributes only their latest
 * revision; history replays the same one-person-one-forecast rule over time.
 */
export function aggregateConsensus(
  questionId: string,
  revisions: readonly ForecastRevision[],
): Consensus | null {
  const history = revisions
    .filter(
      (revision) =>
        revision.questionId === questionId &&
        validProbability(revision.probability) &&
        Number.isFinite(Date.parse(revision.createdAt)),
    )
    .toSorted(
      (a, b) =>
        Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
        a.id.localeCompare(b.id),
    );
  if (!history.length) return null;
  const latest = new Map<string, ForecastRevision>();
  const snapshots = new Map<string, { date: string; probability: number }>();
  for (const revision of history) {
    latest.set(revision.userId, revision);
    const probability =
      [...latest.values()].reduce((sum, row) => sum + row.probability, 0) /
      latest.size;
    // Save one ending snapshot per UTC day, preserving actual observation dates.
    const day = new Date(revision.createdAt).toISOString().slice(0, 10);
    snapshots.set(day, {
      date: new Date(revision.createdAt).toISOString(),
      probability,
    });
  }
  const distribution = [
    { label: "1–19%", count: 0 },
    { label: "20–39%", count: 0 },
    { label: "40–59%", count: 0 },
    { label: "60–79%", count: 0 },
    { label: "80–99%", count: 0 },
  ];
  for (const revision of latest.values())
    distribution[Math.min(4, Math.floor(revision.probability * 5))].count += 1;
  return {
    probability:
      [...latest.values()].reduce((sum, row) => sum + row.probability, 0) /
      latest.size,
    participants: latest.size,
    distribution,
    history: [...snapshots.values()],
  };
}
