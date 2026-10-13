import { NextRequest, NextResponse } from "next/server";
import { label } from "@/lib/locale";
import { z } from "zod";
import { ApiFailure, invariant } from "./errors";
import { applyResponseCookies } from "./response-cookies";

export function protectMutation(request: NextRequest): void {
  const origin = request.headers.get("origin");
  // Next may construct request.url using its bind address (0.0.0.0), while a
  // phone visits the same server through its LAN hostname. Host identifies the
  // browser's actual target; clients cannot forge it in a cross-origin fetch.
  const expectedOrigin = new URL(
    `${request.nextUrl.protocol}//${request.headers.get("host") || request.nextUrl.host}`,
  ).origin;
  invariant(
    !origin || origin === expectedOrigin,
    403,
    "No se permiten solicitudes desde otro origen.",
  );
  invariant(
    request.headers.get("sec-fetch-site") !== "cross-site",
    403,
    "No se permiten solicitudes entre sitios distintos.",
  );
  invariant(
    request.headers.get("content-type")?.split(";")[0].trim() ===
      "application/json",
    415,
    "Enviá una solicitud JSON.",
  );
}

export async function body<T>(
  request: NextRequest,
  schema: z.ZodType<T>,
): Promise<T> {
  invariant(
    Number(request.headers.get("content-length") || 0) <= 32_768,
    413,
    "La solicitud es demasiado grande.",
  );
  const raw = await request.text();
  invariant(raw.length <= 32_768, 413, "La solicitud es demasiado grande.");
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new ApiFailure(
      400,
      "El contenido de la solicitud debe ser JSON válido.",
    );
  }
  const parsed = schema.safeParse(value, { error: z.locales.es().localeError });
  invariant(
    parsed.success,
    400,
    parsed.success
      ? ""
      : parsed.error.issues
          .map(
            (issue) =>
              `${issue.path.map((part) => label(String(part))).join(" · ") || "Datos"}: ${issue.message}`,
          )
          .join("; "),
  );
  return parsed.data;
}

export function endpoint(
  handler: (request: NextRequest) => Promise<NextResponse>,
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    let response: NextResponse;
    try {
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method))
        protectMutation(request);
      response = await handler(request);
    } catch (error) {
      if (error instanceof ApiFailure)
        response = NextResponse.json(
          { error: error.message },
          { status: error.status },
        );
      else {
        console.error(
          "Error de la API de pronósticos:",
          error instanceof Error ? error.message : "Error desconocido",
        );
        response = NextResponse.json(
          { error: "Algo salió mal. Intentá de nuevo." },
          { status: 500 },
        );
      }
    }
    applyResponseCookies(request, response);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Vary", "Cookie");
    return response;
  };
}
