import { z } from "zod";

export const probabilitySchema = z.number().finite().min(0.01).max(0.99);
export const horizonSchema = z.enum([
  "daily",
  "weekly",
  "monthly",
  "long-term",
]);
export const categorySchema = z.enum([
  "Science & tech",
  "Climate",
  "World",
  "Sports",
  "Economy",
]);

export const forecastSubmissionSchema = z
  .object({
    questionId: z.string().trim().min(1).max(100),
    probability: probabilitySchema,
    reasoning: z.string().trim().max(2_000).default(""),
  })
  .strict();

export const demoAuthSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(2)
      .max(32)
      .regex(
        /^[\p{L}\p{N} _.-]+$/u,
        "Usá letras, números, espacios, puntos, guiones o guiones bajos.",
      ),
    country: z.string().trim().min(2).max(60),
  })
  .strict();

export const createLeagueSchema = z
  .object({
    name: z.string().trim().min(3).max(60),
    description: z.string().trim().max(300).default(""),
    period: z.enum(["weekly", "monthly"]).default("weekly"),
  })
  .strict();

export const joinLeagueSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{6,12}$/, "Ingresá un código de invitación válido."),
  })
  .strict();

const timestampSchema = z.iso.datetime({ offset: true });

/** Draft edits use the entire editable record; published criteria are immutable. */
export const questionDraftSchema = z
  .object({
    title: z.string().trim().min(10).max(180),
    description: z.string().trim().min(20).max(3_000),
    category: categorySchema,
    horizon: horizonSchema,
    opensAt: timestampSchema,
    closesAt: timestampSchema,
    resolvesAt: timestampSchema,
    resolutionCriteria: z.string().trim().min(20).max(3_000),
    sourceName: z.string().trim().min(2).max(120),
    sourceUrl: z.url({ protocol: /^https?$/ }),
    visual: z
      .enum(["space", "climate", "ai", "world", "sports", "economy"])
      .default("world"),
  })
  .strict()
  .superRefine((question, context) => {
    if (Date.parse(question.opensAt) >= Date.parse(question.closesAt)) {
      context.addIssue({
        code: "custom",
        path: ["closesAt"],
        message: "El cierre debe ser posterior a la apertura.",
      });
    }
    if (Date.parse(question.closesAt) > Date.parse(question.resolvesAt)) {
      context.addIssue({
        code: "custom",
        path: ["resolvesAt"],
        message: "La resolución debe ocurrir al cierre o después.",
      });
    }
  });

export const questionActionSchema = z
  .object({
    questionId: z.string().trim().min(1).max(100),
    action: z.enum(["publish", "close", "resolve", "void", "cancel"]),
    outcome: z.union([z.literal(0), z.literal(1)]).optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.action === "resolve" && input.outcome === undefined) {
      context.addIssue({
        code: "custom",
        path: ["outcome"],
        message: "Elegí un resultado binario para resolver la pregunta.",
      });
    }
    if (input.action !== "resolve" && input.outcome !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["outcome"],
        message: "Solo la resolución puede definir un resultado.",
      });
    }
  });

export type ForecastSubmission = z.infer<typeof forecastSubmissionSchema>;
export type QuestionDraft = z.infer<typeof questionDraftSchema>;
