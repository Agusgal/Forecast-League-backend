import { NextResponse } from "next/server";
import { z } from "zod";
import { questionActionSchema, questionDraftSchema } from "@/domain/schemas";
import { body, endpoint } from "@/server/http";
import { DEMO_COOKIE, localStore } from "@/server/local-store";
import { hasSupabase, SupabaseAdapter } from "@/server/supabase";

const adminSchema = z.union([
  z
    .object({ action: z.literal("create"), question: questionDraftSchema })
    .strict(),
  z
    .object({
      action: z.literal("update"),
      questionId: z.string().min(1).max(100),
      question: questionDraftSchema,
    })
    .strict(),
  questionActionSchema,
]);

export const runtime = "nodejs";
export const GET = endpoint(async (request) => {
  if (hasSupabase()) {
    const adapter = new SupabaseAdapter(request);
    return adapter.respond({ participation: await adapter.participation() });
  }
  return NextResponse.json({
    participation: await localStore.participation(
      request.cookies.get(DEMO_COOKIE)?.value,
    ),
  });
});

export const POST = endpoint(async (request) => {
  const input = await body(request, adminSchema);
  if (hasSupabase()) {
    const adapter = new SupabaseAdapter(request);
    return adapter.respond({ question: await adapter.admin(input) });
  }
  return NextResponse.json({
    question: await localStore.adminQuestion(
      request.cookies.get(DEMO_COOKIE)?.value,
      input,
    ),
  });
});
