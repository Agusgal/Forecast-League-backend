import assert from "node:assert/strict";

// Intentionally creates a demo guest and two revisions in the selected local API.
const origin = new URL(process.env.FORECAST_API_URL || "http://127.0.0.1:3002");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname), "This smoke check only runs against loopback hosts.");
let cookie = "";
async function api(path, data) {
  const response = await fetch(new URL(path, origin), {
    method: data ? "POST" : "GET",
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(data ? { "Content-Type": "application/json", Origin: origin.origin } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  for (const value of response.headers.getSetCookie()) {
    if (value.startsWith("forecast_backend_session=")) cookie = value.split(";")[0];
  }
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  return result;
}
assert.equal((await api("/")).service, "forecast-league-backend");
assert.equal((await api("/api/auth")).mode, "demo", "Use an isolated demo, not Supabase.");
const initial = await api("/api/bootstrap");
assert.ok(cookie);
const now = Date.now();
const question = initial.questions.find(q => q.status === "PUBLISHED" && Date.parse(q.opensAt) <= now && now < Date.parse(q.closesAt));
assert.ok(question, "No open demo questions: start with a fresh FORECAST_DATA_PATH.");
assert.equal(question.consensus, null);
for (const [index, probability] of [0.73, 0.61].entries()) {
  const { forecast } = await api("/api/forecasts", { questionId: question.id, probability });
  assert.equal(forecast.revisionCount, index + 1);
  assert.equal(forecast.userId, initial.user.id);
}
const reloaded = (await api("/api/bootstrap")).questions.find(q => q.id === question.id);
assert.equal(reloaded.forecast.probability, 0.61);
assert.ok(reloaded.consensus);
const response = await fetch(new URL("/api/forecasts", origin), {
  method: "POST", headers: { "Content-Type": "application/json", Origin: "https://foreign.example", Cookie: cookie },
  body: JSON.stringify({ questionId: question.id, probability: 0.5 }),
});
assert.equal(response.status, 403);
console.log("PASS: HTTP liveness, guest cookie, hidden consensus, submission, revision, reload, consensus unlock, cross-origin rejection.");
