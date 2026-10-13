import { createServerClient } from "@supabase/ssr";
import type { AuthError, SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type {
  Bootstrap,
  Consensus,
  Forecast,
  League,
  LeaderboardEntry,
  Profile,
  ProfileStats,
  Question,
} from "@/domain/types";
import type { QuestionDraft } from "@/domain/schemas";
import { ApiFailure, invariant } from "./errors";
import { stageResponseCookies } from "./response-cookies";

interface QuestionRow {
  id: string;
  title: string;
  description: string;
  category: Question["category"];
  horizon: Question["horizon"];
  status: Question["status"];
  opens_at: string;
  closes_at: string;
  resolves_at: string;
  resolution_criteria: string;
  source_name: string;
  source_url: string;
  outcome: 0 | 1 | null;
  visual: Question["visual"];
  is_demo: boolean;
}
interface ProfileRow {
  id: string;
  username: string;
  country: string;
  avatar_color: string;
  is_admin: boolean;
}
interface ForecastRow {
  id: string;
  question_id: string;
  user_id: string;
  probability: number;
  reasoning: string;
  updated_at: string;
  revision_count: number;
}
interface LeagueRow {
  id: string;
  name: string;
  description: string;
  code: string;
  owner_id: string;
  period: "weekly" | "monthly";
}

function mapQuestion(row: QuestionRow): Question {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    horizon: row.horizon,
    status: row.status,
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    resolvesAt: row.resolves_at,
    resolutionCriteria: row.resolution_criteria,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    outcome: row.outcome,
    visual: row.visual,
    isDemo: row.is_demo,
  };
}
function mapProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    username: row.username,
    country: row.country,
    avatarColor: row.avatar_color,
    isAdmin: row.is_admin,
    isRegistered: true,
  };
}
function mapForecast(row: ForecastRow): Forecast {
  return {
    id: row.id,
    questionId: row.question_id,
    userId: row.user_id,
    probability: Number(row.probability),
    reasoning: row.reasoning,
    updatedAt: row.updated_at,
    revisionCount: row.revision_count,
  };
}
function draftRow(question: QuestionDraft) {
  return {
    title: question.title,
    description: question.description,
    category: question.category,
    horizon: question.horizon,
    opens_at: question.opensAt,
    closes_at: question.closesAt,
    resolves_at: question.resolvesAt,
    resolution_criteria: question.resolutionCriteria,
    source_name: question.sourceName,
    source_url: question.sourceUrl,
    visual: question.visual,
  };
}

export const emptyStats: ProfileStats = {
  resolvedCount: 0,
  meanBrier: null,
  points: 0,
  forecastCount: 0,
  calibration: [],
  categories: [],
};

function supabaseConfiguration(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  invariant(
    Boolean(url) === Boolean(key),
    503,
    "La configuración de Supabase está incompleta. Configurá la URL y la clave pública.",
  );
  if (!url || !key) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ApiFailure(
      503,
      "La URL de Supabase debe ser una URL HTTP o HTTPS válida.",
    );
  }
  invariant(
    ["http:", "https:"].includes(parsed.protocol) &&
      !parsed.username &&
      !parsed.password,
    503,
    "La URL de Supabase debe ser una URL HTTP o HTTPS válida.",
  );
  let role: unknown;
  try {
    role = JSON.parse(
      Buffer.from(key.split(".")[1] || "", "base64url").toString("utf8"),
    ).role;
  } catch {
    /* Publishable keys are opaque rather than JWTs. */
  }
  invariant(
    role !== "service_role" && !key.startsWith("sb_secret_"),
    503,
    "Usá una clave pública de Supabase, nunca una clave secreta ni de servicio.",
  );
  return { url, key };
}

export function hasSupabase(): boolean {
  return supabaseConfiguration() !== null;
}

export function checkAuthError(
  error: AuthError | null,
  status: number,
  message: string,
): void {
  if (!error) return;
  if (error.name === "AuthRetryableFetchError" || (error.status ?? 0) >= 500) {
    throw new ApiFailure(
      503,
      "El servicio de inicio de sesión no está disponible por el momento. Intentá de nuevo.",
    );
  }
  if (error.status === 429)
    throw new ApiFailure(
      429,
      "Demasiados intentos de inicio de sesión. Esperá y volvé a intentar.",
    );
  throw new ApiFailure(status, message);
}

function databaseError(error: { message: string; code?: string } | null): void {
  if (!error) return;
  if (error.code === "42501")
    throw new ApiFailure(403, "No tenés permiso para realizar esa acción.");
  if (error.code === "23505")
    throw new ApiFailure(409, "Este registro ya existe.");
  if (
    error.code === "P0001" ||
    error.code === "22023" ||
    error.code === "23514"
  )
    throw new ApiFailure(
      409,
      "No se pudo completar la acción. Revisá el estado de la pregunta, los plazos y los datos ingresados.",
    );
  if (error.code === "PGRST116" || error.code === "P0002")
    throw new ApiFailure(404, "No se encontró el registro solicitado.");
  console.error("Error de solicitud a Supabase:", error.code || "unknown");
  throw new ApiFailure(
    503,
    "La base de datos no está disponible o faltan las migraciones.",
  );
}

export class SupabaseAdapter {
  readonly client: SupabaseClient;

  constructor(request: NextRequest) {
    const config = supabaseConfiguration();
    invariant(config, 503, "Supabase no está configurado.");
    const cookieJar = new Map(
      request.cookies.getAll().map((cookie) => [cookie.name, cookie.value]),
    );
    this.client = createServerClient(config.url, config.key, {
      cookies: {
        getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })),
        setAll: (cookies) => {
          for (const cookie of cookies)
            cookieJar.set(cookie.name, cookie.value);
          stageResponseCookies(
            request,
            cookies.map((cookie) => ({
              ...cookie,
              options: {
                ...cookie.options,
                httpOnly: true,
                sameSite: "lax",
                secure: process.env.NODE_ENV === "production",
              },
            })),
          );
        },
      },
    });
  }

  respond(data: unknown, status = 200): NextResponse {
    return NextResponse.json(data, { status });
  }

  async user(required = true): Promise<Profile | null> {
    const {
      data: { user },
      error,
    } = await this.client.auth.getUser();
    if (
      error &&
      (error.name === "AuthRetryableFetchError" ||
        (error.status ?? 0) >= 500 ||
        error.status === 429)
    ) {
      checkAuthError(error, 401, "Iniciá sesión para continuar.");
    }
    if (error || !user) {
      invariant(!required, 401, "Iniciá sesión para continuar.");
      return null;
    }
    const profile = await this.client
      .from("profiles")
      .select("id,username,country,avatar_color,is_admin")
      .eq("id", user.id)
      .single();
    databaseError(profile.error);
    return mapProfile(profile.data as ProfileRow);
  }

  async bootstrap(): Promise<Bootstrap> {
    const user = await this.user(false);
    if (!user) {
      const questions = await this.client
        .from("questions")
        .select("*")
        .order("closes_at");
      databaseError(questions.error);
      return {
        mode: "supabase",
        user: null,
        questions: (questions.data as QuestionRow[]).map((row) => ({
          ...mapQuestion(row),
          forecast: null,
          consensus: null,
        })),
        leagues: [],
        leaderboard: [],
        stats: emptyStats,
      };
    }
    const [questions, forecasts, leaderboard, leagues, stats] =
      await Promise.all([
        this.client.from("questions").select("*").order("closes_at"),
        this.client.from("forecasts").select("*").eq("user_id", user.id),
        this.client.rpc("get_leaderboard"),
        this.client.rpc("get_leagues"),
        this.client.rpc("get_profile_stats"),
      ]);
    for (const result of [questions, forecasts, leaderboard, leagues, stats])
      databaseError(result.error);
    const ownForecasts = (forecasts.data as ForecastRow[]).map(mapForecast);
    const views = await Promise.all(
      (questions.data as QuestionRow[]).map(async (row) => {
        const question = mapQuestion(row);
        const forecast =
          ownForecasts.find((item) => item.questionId === question.id) ?? null;
        let consensus: Consensus | null = null;
        if (forecast) {
          const result = await this.client.rpc("get_consensus", {
            p_question_id: question.id,
          });
          databaseError(result.error);
          consensus = result.data as Consensus | null;
        }
        return { ...question, forecast, consensus };
      }),
    );
    return {
      mode: "supabase",
      user,
      questions: views,
      leagues: leagues.data as League[],
      leaderboard: leaderboard.data as LeaderboardEntry[],
      stats: stats.data as ProfileStats,
    };
  }

  async submitForecast(input: {
    questionId: string;
    probability: number;
    reasoning: string;
  }): Promise<Forecast> {
    await this.user();
    const result = await this.client.rpc("submit_forecast", {
      p_question_id: input.questionId,
      p_probability: input.probability,
      p_reasoning: input.reasoning,
    });
    databaseError(result.error);
    return mapForecast(
      (Array.isArray(result.data)
        ? result.data[0]
        : result.data) as ForecastRow,
    );
  }

  async profile(input: {
    username: string;
    country: string;
  }): Promise<Profile> {
    const user = await this.user();
    const result = await this.client
      .from("profiles")
      .update(input)
      .eq("id", user!.id)
      .select("id,username,country,avatar_color,is_admin")
      .single();
    databaseError(result.error);
    return mapProfile(result.data as ProfileRow);
  }

  async league(
    action: "create" | "join",
    input: {
      name?: string;
      description?: string;
      period?: string;
      code?: string;
    },
  ): Promise<League> {
    await this.user();
    const result =
      action === "create"
        ? await this.client.rpc("create_league", {
            p_name: input.name,
            p_description: input.description,
            p_period: input.period,
          })
        : await this.client.rpc("join_league", { p_code: input.code });
    databaseError(result.error);
    const row = (
      Array.isArray(result.data) ? result.data[0] : result.data
    ) as LeagueRow;
    const leagues = await this.client.rpc("get_leagues");
    databaseError(leagues.error);
    return (leagues.data as League[]).find((league) => league.id === row.id)!;
  }

  async admin(input: {
    action: string;
    questionId?: string;
    question?: QuestionDraft;
    outcome?: 0 | 1;
  }): Promise<Question> {
    const user = await this.user();
    invariant(user?.isAdmin, 403, "Se requiere acceso de administración.");
    let result;
    if (input.action === "create") {
      invariant(input.question, 400, "Faltan los datos de la pregunta.");
      result = await this.client
        .from("questions")
        .insert({
          ...draftRow(input.question),
          status: "DRAFT",
          is_demo: false,
        })
        .select("*")
        .single();
    } else if (input.action === "update") {
      invariant(input.question, 400, "Faltan los datos de la pregunta.");
      result = await this.client
        .from("questions")
        .update(draftRow(input.question))
        .eq("id", input.questionId)
        .eq("status", "DRAFT")
        .select("*")
        .single();
    } else if (input.action === "resolve") {
      result = await this.client.rpc("resolve_question", {
        p_question_id: input.questionId,
        p_outcome: input.outcome,
        p_notes: "",
      });
    } else {
      const status: Record<string, string> = {
        publish: "PUBLISHED",
        close: "CLOSED",
        void: "VOID",
        cancel: "CANCELLED",
      };
      result = await this.client.rpc("transition_question", {
        p_question_id: input.questionId,
        p_status: status[input.action],
      });
    }
    databaseError(result.error);
    // RPCs may return a resolution record instead of the updated question.
    if (input.action === "create" || input.action === "update")
      return mapQuestion(result.data as QuestionRow);
    const question = await this.client
      .from("questions")
      .select("*")
      .eq("id", input.questionId)
      .single();
    databaseError(question.error);
    return mapQuestion(question.data as QuestionRow);
  }

  async participation(): Promise<
    { questionId: string; participants: number; revisions: number }[]
  > {
    invariant(
      (await this.user())?.isAdmin,
      403,
      "Se requiere acceso de administración.",
    );
    const result = await this.client.rpc("get_question_participation");
    databaseError(result.error);
    return result.data as {
      questionId: string;
      participants: number;
      revisions: number;
    }[];
  }
}
