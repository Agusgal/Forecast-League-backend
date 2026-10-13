import { createHash } from "node:crypto";
import { invariant } from "./errors";
const state = globalThis as typeof globalThis & {
  __forecastAuthAttempts?: Map<string, { count: number; resetsAt: number }>;
};
const attempts = (state.__forecastAuthAttempts ??= new Map());
/** A per-account throttle for the single-process local prototype. */
export function throttleAuth(email: string, now = Date.now()) {
  for (const [key, row] of attempts)
    if (row.resetsAt <= now) attempts.delete(key);
  const key = createHash("sha256")
    .update(email.trim().toLowerCase())
    .digest("hex");
  const row = attempts.get(key) ?? { count: 0, resetsAt: now + 60_000 };
  invariant(
    row.count < 10,
    429,
    "Demasiados intentos. Esperá un minuto y volvé a intentar.",
  );
  row.count += 1;
  attempts.set(key, row);
}
