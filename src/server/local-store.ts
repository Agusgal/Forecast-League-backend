import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import type {
  Bootstrap,
  Forecast,
  ForecastRevision,
  League,
  Profile,
  Question,
} from "@/domain/types";
import { createDemoSeed } from "@/domain/seed";
import {
  aggregateConsensus,
  brierScore,
  buildLeaderboard,
  profileStats,
  scorePoints,
  selectScoringRevision,
} from "@/domain/scoring";
import { upgradeDemoContent } from "./demo-content";
import { invariant } from "./errors";

interface LocalAccount {
  userId: string;
  email: string;
  passwordSalt: string;
  passwordHash: string;
  createdAt: string;
}
const derivePassword = promisify(scrypt);

interface Session {
  tokenHash: string;
  userId: string;
  expiresAt: string;
}
interface LeagueRecord {
  id: string;
  name: string;
  description: string;
  code: string;
  ownerId: string;
  period: "weekly" | "monthly";
}
interface Membership {
  leagueId: string;
  userId: string;
  joinedAt: string;
}
interface Resolution {
  questionId: string;
  outcome: 0 | 1 | null;
  resolvedBy: string;
  resolvedAt: string;
}
interface Score {
  questionId: string;
  userId: string;
  forecastRevisionId: string;
  brier: number;
  points: number;
  scoredAt: string;
}
export interface LocalData {
  demoContentRevision?: 1 | 2;
  version: 1;
  profiles: Profile[];
  questions: Question[];
  forecasts: Forecast[];
  revisions: ForecastRevision[];
  leagues: LeagueRecord[];
  memberships: Membership[];
  sessions: Session[];
  accounts?: LocalAccount[];
  resolutions: Resolution[];
  scores: Score[];
}

const processState = globalThis as typeof globalThis & {
  __forecastQueues?: Map<string, Promise<unknown>>;
};
const queues = (processState.__forecastQueues ??= new Map());
const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const DEMO_COOKIE = "forecast_backend_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

/** Single-process local development adapter. Atomic file replacement preserves an auditable revision log. */
export class LocalStore {
  constructor(
    readonly filename = process.env.FORECAST_DATA_PATH ||
      path.join(process.cwd(), ".data", "forecast-league.json"),
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private async read(): Promise<LocalData> {
    try {
      const data: unknown = JSON.parse(await readFile(this.filename, "utf8"));
      invariant(
        typeof data === "object" &&
          data !== null &&
          "version" in data &&
          data.version === 1,
        500,
        "Formato de datos locales incompatible.",
      );
      return data as LocalData;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return {
        version: 1,
        ...createDemoSeed(this.clock()),
        sessions: [],
        resolutions: [],
        scores: [],
      };
    }
  }

  private async write(data: LocalData): Promise<void> {
    await mkdir(path.dirname(this.filename), { recursive: true, mode: 0o700 });
    const temporary = `${this.filename}.${randomUUID()}.tmp`;
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(JSON.stringify(data, null, 2), "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await rename(temporary, this.filename);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  /** Serializes reads as well as writes across Next's development module reloads. */
  private async access<T>(
    change: (data: LocalData) => T,
    write = false,
  ): Promise<T> {
    const previous = queues.get(this.filename) ?? Promise.resolve();
    const operation = previous
      .catch(() => undefined)
      .then(async () => {
        const data = await this.read();
        const migrated = upgradeDemoContent(data, this.clock());
        const value = change(data);
        if (write || migrated) await this.write(data);
        return value;
      });
    queues.set(this.filename, operation);
    try {
      return await operation;
    } finally {
      if (queues.get(this.filename) === operation) queues.delete(this.filename);
    }
  }

  private profile(data: LocalData, token?: string): Profile {
    const now = this.clock().getTime();
    const session =
      token &&
      data.sessions.find(
        (row) =>
          row.tokenHash === hash(token) && Date.parse(row.expiresAt) > now,
      );
    const profile =
      session && data.profiles.find((row) => row.id === session.userId);
    invariant(
      profile,
      401,
      "Tu sesión de demo venció. Actualizá la página para empezar de nuevo.",
    );
    return {
      ...profile,
      isRegistered: (data.accounts ?? []).some(
        (account) => account.userId === profile.id,
      ),
    };
  }

  async ensureSession(
    token?: string,
  ): Promise<{ profile: Profile; token: string; created: boolean }> {
    return this.access((data) => {
      if (token) {
        try {
          return { profile: this.profile(data, token), token, created: false };
        } catch {
          /* An expired session starts a fresh, explicitly labelled demo profile. */
        }
      }
      const nextToken = randomBytes(32).toString("base64url");
      const profile: Profile = {
        id: randomUUID(),
        username: `Participante ${randomBytes(2).toString("hex").toUpperCase()}`,
        country: "Global",
        avatarColor: "#d5eb4b",
        isAdmin: true,
      };
      data.profiles.push(profile);
      data.sessions = data.sessions.filter(
        (row) => Date.parse(row.expiresAt) > this.clock().getTime(),
      );
      data.sessions.push({
        tokenHash: hash(nextToken),
        userId: profile.id,
        expiresAt: new Date(
          this.clock().getTime() + SESSION_MAX_AGE * 1000,
        ).toISOString(),
      });
      return { profile, token: nextToken, created: true };
    }, true);
  }

  /** An account is private storage; read models never include email or password hashes. */
  async currentProfile(token?: string): Promise<Profile | null> {
    if (!token) return null;
    return this.access((data) => {
      try {
        return this.profile(data, token);
      } catch (error) {
        if (error instanceof Error && "status" in error && error.status === 401)
          return null;
        throw error;
      }
    });
  }

  private accountSession(
    data: LocalData,
    userId: string,
    previousToken?: string,
  ): string {
    const token = randomBytes(32).toString("base64url");
    data.sessions = data.sessions.filter(
      (row) =>
        Date.parse(row.expiresAt) > this.clock().getTime() &&
        (!previousToken || row.tokenHash !== hash(previousToken)),
    );
    data.sessions.push({
      tokenHash: hash(token),
      userId,
      expiresAt: new Date(
        this.clock().getTime() + SESSION_MAX_AGE * 1000,
      ).toISOString(),
    });
    return token;
  }

  async createAccount(
    input: { username: string; email: string; password: string },
    previousToken?: string,
  ): Promise<{ profile: Profile; token: string }> {
    const email = input.email.trim().toLowerCase();
    const salt = randomBytes(16).toString("hex");
    const digest = (await derivePassword(input.password, salt, 64)) as Buffer;
    return this.access((data) => {
      data.accounts ??= [];
      invariant(
        !data.accounts.some((account) => account.email === email),
        409,
        "Ya existe una cuenta con ese correo. Iniciá sesión.",
      );
      let existing: Profile | null = null;
      if (previousToken) {
        try {
          existing = this.profile(data, previousToken);
        } catch {
          /* expired guest */
        }
      }
      const guest =
        existing && !existing.isRegistered
          ? data.profiles.find((profile) => profile.id === existing!.id)
          : null;
      const profile = guest ?? {
        id: randomUUID(),
        username: input.username,
        country: "Global",
        avatarColor: "#CC7722",
        isAdmin: true,
      };
      profile.username = input.username;
      if (!guest) data.profiles.push(profile);
      data.accounts.push({
        userId: profile.id,
        email,
        passwordSalt: salt,
        passwordHash: digest.toString("hex"),
        createdAt: this.clock().toISOString(),
      });
      const token = this.accountSession(data, profile.id, previousToken);
      return { profile: { ...profile, isRegistered: true }, token };
    }, true);
  }

  async signIn(
    input: { email: string; password: string },
    previousToken?: string,
  ): Promise<{ profile: Profile; token: string }> {
    const email = input.email.trim().toLowerCase();
    // Read the credential separately so scrypt does not hold the persistence queue.
    const account = await this.access((data) =>
      (data.accounts ?? []).find((account) => account.email === email),
    );
    const digest = (await derivePassword(
      input.password,
      account?.passwordSalt ?? "unknown-account-salt",
      64,
    )) as Buffer;
    invariant(
      account &&
        timingSafeEqual(digest, Buffer.from(account.passwordHash, "hex")),
      401,
      "El correo o la contraseña son incorrectos.",
    );
    return this.access((data) => {
      const stored = data.accounts?.find(
        (row) => row.userId === account.userId && row.email === email,
      );
      invariant(stored, 401, "El correo o la contraseña son incorrectos.");
      const profile = data.profiles.find((row) => row.id === account.userId);
      invariant(profile, 401, "El correo o la contraseña son incorrectos.");
      return {
        profile: { ...profile, isRegistered: true },
        token: this.accountSession(data, profile.id, previousToken),
      };
    }, true);
  }

  private leagueViews(data: LocalData, userId: string): League[] {
    return data.leagues
      .filter((league) =>
        data.memberships.some(
          (membership) =>
            membership.leagueId === league.id && membership.userId === userId,
        ),
      )
      .map((league) => {
        const ids = new Set(
          data.memberships
            .filter((membership) => membership.leagueId === league.id)
            .map((membership) => membership.userId),
        );
        const periodStart = new Date(this.clock());
        periodStart.setUTCHours(0, 0, 0, 0);
        if (league.period === "monthly") periodStart.setUTCDate(1);
        else
          periodStart.setUTCDate(
            periodStart.getUTCDate() - ((periodStart.getUTCDay() + 6) % 7),
          );
        const sharedQuestions = data.questions.filter(
          (question) =>
            question.status === "RESOLVED" &&
            Date.parse(
              data.resolutions.find(
                (resolution) => resolution.questionId === question.id,
              )?.resolvedAt ?? question.resolvesAt,
            ) >= periodStart.getTime() &&
            [...ids].every(
              (id) =>
                selectScoringRevision(
                  data.revisions.filter((revision) => revision.userId === id),
                  question,
                ) !== null,
            ),
        );
        const profiles = data.profiles.filter((profile) => ids.has(profile.id));
        const ranked = buildLeaderboard(
          profiles,
          sharedQuestions,
          data.revisions,
        );
        const members = [
          ...ranked,
          ...profiles
            .filter(
              (profile) => !ranked.some((row) => row.userId === profile.id),
            )
            .map((profile) => ({
              userId: profile.id,
              username: profile.username,
              country: profile.country,
              meanBrier: 0,
              resolvedCount: 0,
              points: 0,
              rank: 0,
            })),
        ];
        return { ...league, memberCount: ids.size, members };
      });
  }

  async bootstrap(token: string): Promise<Bootstrap> {
    return this.access((data) => {
      const user = this.profile(data, token);
      return {
        mode: "demo",
        user,
        questions: data.questions
          .filter((question) => question.status !== "DRAFT" || user.isAdmin)
          .map((question) => {
            const forecast =
              data.forecasts.find(
                (row) =>
                  row.userId === user.id && row.questionId === question.id,
              ) ?? null;
            return {
              ...question,
              forecast,
              consensus: forecast
                ? aggregateConsensus(question.id, data.revisions)
                : null,
            };
          }),
        leagues: this.leagueViews(data, user.id),
        leaderboard: buildLeaderboard(
          data.profiles,
          data.questions,
          data.revisions,
        ),
        stats: profileStats(user.id, data.questions, data.revisions),
      };
    });
  }

  async submitForecast(
    token: string | undefined,
    input: { questionId: string; probability: number; reasoning: string },
  ): Promise<Forecast> {
    return this.access((data) => {
      const user = this.profile(data, token);
      const question = data.questions.find(
        (row) => row.id === input.questionId,
      );
      invariant(question, 404, "Pregunta no encontrada.");
      const now = this.clock();
      invariant(
        question.status === "PUBLISHED",
        409,
        "Esta pregunta no acepta pronósticos.",
      );
      invariant(
        now.getTime() >= Date.parse(question.opensAt),
        409,
        "Los pronósticos todavía no están abiertos.",
      );
      invariant(
        now.getTime() < Date.parse(question.closesAt),
        409,
        "El plazo para pronosticar terminó.",
      );
      invariant(
        Number.isFinite(input.probability) &&
          input.probability >= 0.01 &&
          input.probability <= 0.99,
        400,
        "La probabilidad debe estar entre el 1 % y el 99 %.",
      );
      invariant(
        typeof input.reasoning === "string" && input.reasoning.length <= 2000,
        400,
        "El razonamiento puede tener hasta 2.000 caracteres.",
      );
      let forecast = data.forecasts.find(
        (row) => row.questionId === question.id && row.userId === user.id,
      );
      const timestamp = new Date(
        Math.max(
          now.getTime(),
          forecast ? Date.parse(forecast.updatedAt) + 1 : 0,
        ),
      ).toISOString();
      invariant(
        Date.parse(timestamp) < Date.parse(question.closesAt),
        409,
        "El plazo para pronosticar terminó.",
      );
      if (!forecast) {
        forecast = {
          id: randomUUID(),
          questionId: question.id,
          userId: user.id,
          probability: input.probability,
          reasoning: input.reasoning,
          updatedAt: timestamp,
          revisionCount: 0,
        };
        data.forecasts.push(forecast);
      }
      forecast.probability = input.probability;
      forecast.reasoning = input.reasoning;
      forecast.updatedAt = timestamp;
      forecast.revisionCount += 1;
      data.revisions.push({
        id: randomUUID(),
        forecastId: forecast.id,
        questionId: question.id,
        userId: user.id,
        probability: input.probability,
        reasoning: input.reasoning,
        createdAt: timestamp,
      });
      return { ...forecast };
    }, true);
  }

  async updateProfile(
    token: string | undefined,
    input: { username: string; country: string },
  ): Promise<Profile> {
    return this.access((data) => {
      const user = this.profile(data, token);
      const stored = data.profiles.find((profile) => profile.id === user.id)!;
      stored.username = input.username;
      stored.country = input.country;
      return { ...stored, isRegistered: user.isRegistered };
    }, true);
  }

  async createLeague(
    token: string | undefined,
    input: { name: string; description: string; period: "weekly" | "monthly" },
  ): Promise<League> {
    return this.access((data) => {
      const user = this.profile(data, token);
      let code = randomBytes(4).toString("hex").toUpperCase();
      while (data.leagues.some((league) => league.code === code))
        code = randomBytes(4).toString("hex").toUpperCase();
      const league: LeagueRecord = {
        id: randomUUID(),
        ...input,
        code,
        ownerId: user.id,
      };
      data.leagues.push(league);
      data.memberships.push({
        leagueId: league.id,
        userId: user.id,
        joinedAt: this.clock().toISOString(),
      });
      return this.leagueViews(data, user.id).find(
        (row) => row.id === league.id,
      )!;
    }, true);
  }

  async joinLeague(token: string | undefined, code: string): Promise<League> {
    return this.access((data) => {
      const user = this.profile(data, token);
      const league = data.leagues.find(
        (row) => row.code.toUpperCase() === code.toUpperCase(),
      );
      invariant(
        league,
        404,
        "Ninguna liga coincide con ese código de invitación.",
      );
      if (
        !data.memberships.some(
          (row) => row.leagueId === league.id && row.userId === user.id,
        )
      ) {
        data.memberships.push({
          leagueId: league.id,
          userId: user.id,
          joinedAt: this.clock().toISOString(),
        });
      }
      return this.leagueViews(data, user.id).find(
        (row) => row.id === league.id,
      )!;
    }, true);
  }

  async logout(token?: string): Promise<void> {
    await this.access((data) => {
      if (token)
        data.sessions = data.sessions.filter(
          (row) => row.tokenHash !== hash(token),
        );
    }, true);
  }

  async participation(
    token?: string,
  ): Promise<
    { questionId: string; participants: number; revisions: number }[]
  > {
    return this.access((data) => {
      invariant(
        this.profile(data, token).isAdmin,
        403,
        "Se requiere acceso de administración.",
      );
      return data.questions.map((question) => ({
        questionId: question.id,
        participants: data.forecasts.filter(
          (forecast) => forecast.questionId === question.id,
        ).length,
        revisions: data.revisions.filter(
          (revision) => revision.questionId === question.id,
        ).length,
      }));
    });
  }

  async adminQuestion(
    token: string | undefined,
    input: {
      action:
        | "create"
        | "update"
        | "publish"
        | "close"
        | "resolve"
        | "void"
        | "cancel";
      questionId?: string;
      question?: Omit<Question, "id" | "status" | "outcome" | "isDemo">;
      outcome?: 0 | 1;
    },
  ): Promise<Question> {
    return this.access((data) => {
      const user = this.profile(data, token);
      invariant(user.isAdmin, 403, "Se requiere acceso de administración.");
      if (input.action === "create") {
        invariant(input.question, 400, "Faltan los datos de la pregunta.");
        const question: Question = {
          ...input.question,
          id: randomUUID(),
          status: "DRAFT",
          outcome: null,
          isDemo: true,
        };
        data.questions.push(question);
        return question;
      }
      const question = data.questions.find(
        (row) => row.id === input.questionId,
      );
      invariant(question, 404, "Pregunta no encontrada.");
      if (input.action === "update") {
        invariant(
          question.status === "DRAFT",
          409,
          "Solo se pueden editar borradores. Los criterios publicados no se pueden modificar.",
        );
        invariant(input.question, 400, "Faltan los datos de la pregunta.");
        Object.assign(question, input.question);
      } else if (input.action === "publish") {
        invariant(
          question.status === "DRAFT",
          409,
          "Solo se pueden publicar borradores.",
        );
        invariant(
          Date.parse(question.closesAt) > this.clock().getTime(),
          409,
          "Definí un cierre futuro antes de publicar.",
        );
        question.status = "PUBLISHED";
      } else if (input.action === "close") {
        invariant(
          question.status === "PUBLISHED",
          409,
          "Solo se pueden cerrar preguntas publicadas.",
        );
        question.status = "CLOSED";
      } else if (input.action === "resolve") {
        invariant(
          question.status === "CLOSED",
          409,
          "Cerrá los pronósticos antes de resolver esta pregunta.",
        );
        invariant(
          input.outcome === 0 || input.outcome === 1,
          400,
          "La resolución requiere un resultado sí o no.",
        );
        question.status = "RESOLVED";
        question.outcome = input.outcome;
        const resolvedAt = this.clock().toISOString();
        data.resolutions.push({
          questionId: question.id,
          outcome: input.outcome,
          resolvedBy: user.id,
          resolvedAt,
        });
        for (const forecast of data.forecasts.filter(
          (row) => row.questionId === question.id,
        )) {
          const revision = selectScoringRevision(
            data.revisions.filter((row) => row.userId === forecast.userId),
            question,
          );
          if (!revision) continue;
          const brier = brierScore(revision.probability, input.outcome);
          data.scores.push({
            questionId: question.id,
            userId: forecast.userId,
            forecastRevisionId: revision.id,
            brier,
            points: scorePoints(brier),
            scoredAt: resolvedAt,
          });
        }
      } else {
        invariant(
          !["RESOLVED", "VOID", "CANCELLED"].includes(question.status),
          409,
          "Esta pregunta ya tiene un estado final.",
        );
        question.status = input.action === "cancel" ? "CANCELLED" : "VOID";
        data.resolutions.push({
          questionId: question.id,
          outcome: null,
          resolvedBy: user.id,
          resolvedAt: this.clock().toISOString(),
        });
      }
      return { ...question };
    }, true);
  }
}

export const localStore = new LocalStore();
