import { argentinaExamples } from "./argentina-examples";
import type { Forecast, ForecastRevision, Profile, Question } from "./types";

export interface DemoLeague {
  id: string;
  name: string;
  description: string;
  code: string;
  ownerId: string;
  period: "weekly" | "monthly";
}

export interface DemoMembership {
  leagueId: string;
  userId: string;
  joinedAt: string;
}
export interface DemoSeed {
  profiles: Profile[];
  questions: Question[];
  forecasts: Forecast[];
  revisions: ForecastRevision[];
  leagues: DemoLeague[];
  memberships: DemoMembership[];
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * Every person, event scenario, probability and outcome below is fictional.
 * The reference links illustrate sources a real question could use; they do
 * not support or purport to report these synthetic outcomes. Newly registered
 * users are deliberately absent and begin with no forecasts or history.
 * Call only on first database initialization so deadlines do not move on reload.
 */
export function createDemoSeed(now: Date = new Date()): DemoSeed {
  if (!Number.isFinite(now.getTime()))
    throw new RangeError(
      "La inicialización de ejemplos necesita una fecha válida.",
    );
  const at = (offset: number) => new Date(now.getTime() + offset).toISOString();
  const profiles: Profile[] = [
    {
      id: "demo-maya",
      username: "Maya Chen",
      country: "Singapore",
      avatarColor: "#dfe9d8",
      isAdmin: false,
    },
    {
      id: "demo-leo",
      username: "Leo Moreno",
      country: "Argentina",
      avatarColor: "#e7dffc",
      isAdmin: false,
    },
    {
      id: "demo-amara",
      username: "Amara Okafor",
      country: "Nigeria",
      avatarColor: "#f5dfc7",
      isAdmin: false,
    },
    {
      id: "demo-elias",
      username: "Elias Berg",
      country: "Sweden",
      avatarColor: "#dbe7fa",
      isAdmin: false,
    },
    {
      id: "demo-sofia",
      username: "Sofia Costa",
      country: "Brazil",
      avatarColor: "#f4dfe5",
      isAdmin: false,
    },
    {
      id: "demo-noah",
      username: "Noah Park",
      country: "South Korea",
      avatarColor: "#d9ebe7",
      isAdmin: false,
    },
    {
      id: "demo-zara",
      username: "Zara Patel",
      country: "United Kingdom",
      avatarColor: "#e9e3d6",
      isAdmin: false,
    },
    {
      id: "demo-ines",
      username: "Inés Laurent",
      country: "France",
      avatarColor: "#e6def3",
      isAdmin: false,
    },
  ];
  const question = (
    input: Omit<Question, "isDemo" | "outcome" | "status"> &
      Partial<Pick<Question, "outcome" | "status">>,
  ): Question => ({
    status: "PUBLISHED",
    outcome: null,
    ...input,
    isDemo: true,
    description: `Escenario de ejemplo: evento y pronósticos ficticios. ${input.description}`,
    resolutionCriteria: `${input.resolutionCriteria} Este ejemplo se resuelve con datos simulados, no con el sitio de referencia. Si los datos faltan o son ambiguos, se anula la pregunta.`,
  });

  const questions: Question[] = [
    question({
      id: "demo-orbit",
      title: "¿La próxima misión de prueba alcanzará la órbita?",
      description:
        "La misión ficticia Atlas-1 tiene previsto despegar hoy. Considerá su preparación, la confiabilidad del vehículo y el tiempo meteorológico.",
      category: "Science & tech",
      horizon: "daily",
      visual: "space",
      opensAt: at(-6 * HOUR),
      closesAt: at(3 * HOUR),
      resolvesAt: at(8 * HOUR),
      resolutionCriteria:
        "SÍ si el registro simulado de Atlas-1 confirma una órbita terrestre estable antes de la resolución; NO si registra un lanzamiento fallido, ausencia de lanzamiento o un vuelo suborbital.",
      sourceName: "Registro simulado de misión · referencia NASA",
      sourceUrl: "https://www.nasa.gov/missions/",
    }),
    question({
      id: "demo-temperature",
      title: "¿Tokio alcanzará los 25 °C en las próximas 24 horas?",
      description:
        "Simulación meteorológica de la estación de Tokio. Se considera la máxima temperatura horaria del aire durante el intervalo indicado.",
      category: "Climate",
      horizon: "daily",
      visual: "climate",
      opensAt: at(-5 * HOUR),
      closesAt: at(6 * HOUR),
      resolvesAt: at(23 * HOUR),
      resolutionCriteria: `SÍ si una temperatura horaria válida de la estación TOKYO del registro simulado alcanza al menos 25,0 °C entre ${at(0)} y ${at(23 * HOUR)} inclusive; en caso contrario, NO. Si faltan todas las observaciones, se anula.`,
      sourceName: "Datos meteorológicos simulados · referencia JMA",
      sourceUrl: "https://www.jma.go.jp/jma/en/Activities/observations.html",
    }),
    question({
      id: "demo-ai",
      title:
        "¿Un modelo abierto de IA superará el 80 % en la prueba de razonamiento?",
      description:
        "Evaluación ficticia del modelo abierto Cedar-3. Las pruebas y las condiciones de evaluación se fijan antes de abrir los pronósticos.",
      category: "Science & tech",
      horizon: "daily",
      visual: "ai",
      opensAt: at(-4 * HOUR),
      closesAt: at(10 * HOUR),
      resolvesAt: at(20 * HOUR),
      resolutionCriteria:
        "SÍ si el informe simulado de Cedar-3 registra una precisión superior al 80,0 % en Reasoning Set A v1, con sus 500 ítems y el protocolo fijo sin ejemplos; NO con 80,0 % o menos, o sin informe al resolver.",
      sourceName: "Informe simulado · referencia de fichas de modelos",
      sourceUrl: "https://huggingface.co/docs/hub/model-cards",
    }),
    question({
      id: "demo-clean-energy",
      title:
        "¿La energía limpia cubrirá la mitad del consumo eléctrico de la ciudad?",
      description:
        "Informe ficticio de siete días de la red eléctrica de Bahía Puerto. La energía limpia incluye generación eólica, solar e hidráulica.",
      category: "Climate",
      horizon: "weekly",
      visual: "climate",
      opensAt: at(-3 * DAY),
      closesAt: at(3 * DAY),
      resolvesAt: at(4 * DAY),
      resolutionCriteria:
        "SÍ si la suma de generación eólica, solar e hidráulica representa al menos el 50,0 % del total del informe simulado de la semana 42; NO en caso contrario. Se excluyen las importaciones del numerador y del denominador.",
      sourceName: "Informe eléctrico simulado · referencia AIE",
      sourceUrl: "https://www.iea.org/topics/renewables",
    }),
    question({
      id: "demo-football",
      title: "¿El líder de la liga ganará su próximo partido de local?",
      description:
        "En la ficticia Liga del Puerto, Ciudad Norte recibe a Unión Sur. Pronosticá el resultado al final del tiempo reglamentario.",
      category: "Sports",
      horizon: "weekly",
      visual: "sports",
      opensAt: at(-2 * DAY),
      closesAt: at(5 * DAY),
      resolvesAt: at(6 * DAY),
      resolutionCriteria:
        "SÍ si Ciudad Norte termina con más goles que Unión Sur al finalizar el tiempo reglamentario y el descuento; NO si empata o pierde. Si se cancela o posterga más allá de la resolución, se anula.",
      sourceName: "Acta de partido simulada · referencia FIFA",
      sourceUrl: "https://www.fifa.com/",
    }),
    question({
      id: "demo-economy",
      title: "¿La inflación interanual bajará del 3 % este mes?",
      description:
        "Publicación ficticia de precios al consumidor de Lydora. Es un ejercicio de pronóstico sin apuestas ni dinero.",
      category: "Economy",
      horizon: "monthly",
      visual: "economy",
      opensAt: at(-4 * DAY),
      closesAt: at(24 * DAY),
      resolvesAt: at(28 * DAY),
      resolutionCriteria:
        "SÍ si la primera publicación del IPC general interanual de Lydora para el mes simulado es inferior al 3,0 %; NO si es igual o superior. Se usa la primera publicación, sin revisiones. Si falta al resolver, se anula.",
      sourceName: "Publicación simulada de IPC · referencia FMI",
      sourceUrl: "https://www.imf.org/en/Data",
    }),
    question({
      id: "demo-lunar",
      title: "¿El módulo lunar completará un aterrizaje controlado?",
      description:
        "Misión lunar ficticia Pathfinder. Esta pregunta de largo plazo no se puntúa hasta que se resuelva su resultado simulado.",
      category: "Science & tech",
      horizon: "long-term",
      visual: "space",
      opensAt: at(-5 * DAY),
      closesAt: at(120 * DAY),
      resolvesAt: at(150 * DAY),
      resolutionCriteria:
        "SÍ si el registro simulado de Pathfinder confirma un aterrizaje controlado en la Luna y al menos un paquete de telemetría válido posterior antes de la resolución; NO si falla, se cancela o no aterriza a tiempo.",
      sourceName: "Registro lunar simulado · referencia NASA",
      sourceUrl: "https://www.nasa.gov/moon/",
    }),
    question({
      id: "demo-resolved-rain",
      title: "¿Se acumularon al menos 10 mm de lluvia el fin de semana?",
      description:
        "Simulación meteorológica finalizada. El registro ficticio suma 12,4 mm: es un ejemplo de resultado SÍ.",
      category: "Climate",
      horizon: "weekly",
      visual: "climate",
      status: "RESOLVED",
      outcome: 1,
      opensAt: at(-10 * DAY),
      closesAt: at(-4 * DAY),
      resolvesAt: at(-3 * DAY),
      resolutionCriteria:
        "SÍ si la estación simulada HB-01 suma al menos 10,0 mm de precipitación en los dos días; NO si suma menos. Deben estar presentes ambas observaciones diarias.",
      sourceName: "Simulación meteorológica · referencia OMM",
      sourceUrl: "https://wmo.int/topics/weather",
    }),
    question({
      id: "demo-resolved-ai",
      title: "¿El nuevo modelo aprobó todas las evaluaciones de seguridad?",
      description:
        "Evaluación ficticia finalizada. Cedar-2 aprobó cuatro de las cinco evaluaciones requeridas; el resultado simulado es NO.",
      category: "Science & tech",
      horizon: "daily",
      visual: "ai",
      status: "RESOLVED",
      outcome: 0,
      opensAt: at(-3 * DAY),
      closesAt: at(-2 * DAY),
      resolvesAt: at(-36 * HOUR),
      resolutionCriteria:
        "SÍ solo si el informe simulado de Cedar-2 marca como aprobadas las cinco evaluaciones predefinidas; NO si falla alguna. Si falta el informe o se retira, se anula.",
      sourceName: "Evaluación simulada · referencia NIST",
      sourceUrl: "https://www.nist.gov/ai",
    }),
    question({
      id: "demo-resolved-world",
      title: "¿Las ciudades firmaron un acuerdo climático conjunto?",
      description:
        "Cumbre ficticia finalizada. El documento simulado contiene las firmas de las cuatro ciudades participantes; el resultado es SÍ.",
      category: "World",
      horizon: "monthly",
      visual: "world",
      status: "RESOLVED",
      outcome: 1,
      opensAt: at(-32 * DAY),
      closesAt: at(-30 * HOUR),
      resolvesAt: at(-12 * HOUR),
      resolutionCriteria:
        "SÍ si la cumbre ficticia Cuatro Ciudades publica el acuerdo climático final con las firmas de las cuatro delegaciones antes del plazo; NO en caso contrario. Un anuncio sin documento firmado no alcanza.",
      sourceName: "Acta simulada de cumbre · referencia ONU",
      sourceUrl: "https://www.un.org/en/climatechange",
    }),
  ];

  questions.push(...argentinaExamples(now));

  const forecasts: Forecast[] = [];
  const revisions: ForecastRevision[] = [];
  const resolvedProbabilities = [
    [0.83, 0.19, 0.78],
    [0.71, 0.24, 0.81],
    [0.69, 0.34, 0.76],
    [0.75, 0.41, 0.68],
    [0.61, 0.37, 0.63],
    [0.58, 0.46, 0.73],
    [0.67, 0.53, 0.62],
    [0.49, 0.57, 0.69],
  ];
  questions.forEach((currentQuestion, questionIndex) => {
    profiles.forEach((profile, profileIndex) => {
      const forecastId = `forecast-${currentQuestion.id}-${profile.id}`;
      const finalProbability =
        currentQuestion.status === "RESOLVED"
          ? resolvedProbabilities[profileIndex][questionIndex - 7]
          : Math.min(
              0.96,
              Math.max(
                0.04,
                (38 + ((questionIndex * 17 + profileIndex * 9) % 49)) / 100,
              ),
            );
      const windowStart = Date.parse(currentQuestion.opensAt);
      const windowEnd = Math.min(
        now.getTime() - 5 * 60_000,
        Date.parse(currentQuestion.closesAt) - 60_000,
      );
      const userRevisions: ForecastRevision[] = [0.15, 0.55, 0.92].map(
        (fraction, revisionIndex) => ({
          id: `revision-${currentQuestion.id}-${profile.id}-${revisionIndex + 1}`,
          forecastId,
          questionId: currentQuestion.id,
          userId: profile.id,
          probability:
            revisionIndex === 2
              ? finalProbability
              : Math.round(
                  Math.min(
                    0.99,
                    Math.max(
                      0.01,
                      finalProbability + (revisionIndex === 0 ? -0.12 : 0.04),
                    ),
                  ) * 100,
                ) / 100,
          reasoning:
            revisionIndex === 2
              ? "Pronóstico ficticio de ejemplo: actualizado después de revisar la evidencia del escenario."
              : "Pronóstico ficticio de ejemplo: estimación inicial basada en antecedentes.",
          createdAt: new Date(
            windowStart + (windowEnd - windowStart) * fraction,
          ).toISOString(),
        }),
      );
      revisions.push(...userRevisions);
      const latest = userRevisions[userRevisions.length - 1];
      forecasts.push({
        id: forecastId,
        questionId: currentQuestion.id,
        userId: profile.id,
        probability: latest.probability,
        reasoning: latest.reasoning,
        updatedAt: latest.createdAt,
        revisionCount: userRevisions.length,
      });
    });
  });

  const leagues: DemoLeague[] = [
    {
      id: "demo-league-future",
      name: "El club del futuro",
      description:
        "Liga ficticia de amigos para explorar Forecast League. Sumate con el código FUTURE.",
      code: "FUTURE",
      ownerId: "demo-maya",
      period: "weekly",
    },
    {
      id: "demo-league-longview",
      name: "Mirada a largo plazo",
      description:
        "Liga mensual ficticia de amigos. Compará la precisión en preguntas resueltas compartidas.",
      code: "LONGVIEW",
      ownerId: "demo-leo",
      period: "monthly",
    },
  ];
  const memberships: DemoMembership[] = [
    ...profiles.slice(0, 5).map((profile) => ({
      leagueId: "demo-league-future",
      userId: profile.id,
      joinedAt: at(-14 * DAY),
    })),
    ...[profiles[1], ...profiles.slice(4)].map((profile) => ({
      leagueId: "demo-league-longview",
      userId: profile.id,
      joinedAt: at(-35 * DAY),
    })),
  ];
  return { profiles, questions, forecasts, revisions, leagues, memberships };
}
