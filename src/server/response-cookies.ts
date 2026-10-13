import type { CookieOptions } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

interface PendingCookie {
  name: string;
  value: string;
  options: CookieOptions;
}
const pending = new WeakMap<NextRequest, Map<string, PendingCookie>>();

/** Refreshed credentials must reach the browser even when a later operation fails. */
export function stageResponseCookies(
  request: NextRequest,
  cookies: PendingCookie[],
): void {
  const values = pending.get(request) ?? new Map<string, PendingCookie>();
  for (const cookie of cookies) values.set(cookie.name, cookie);
  pending.set(request, values);
}

export function applyResponseCookies(
  request: NextRequest,
  response: NextResponse,
): void {
  for (const cookie of pending.get(request)?.values() ?? [])
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  pending.delete(request);
}
