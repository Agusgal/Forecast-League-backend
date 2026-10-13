import { argentinaExamples } from "@/domain/argentina-examples";
import { translateDemoText } from "@/domain/demo-translations";
import type { LocalData } from "./local-store";

/** One-time, additive upgrade. Existing deadlines, accounts, submissions and scores remain intact. */
export function upgradeDemoContent(data: LocalData, now: Date): boolean {
  if (data.demoContentRevision === 2) return false;
  for (const question of data.questions) {
    if (!question.isDemo || !question.id.startsWith("demo-")) continue;
    for (const field of [
      "title",
      "description",
      "resolutionCriteria",
      "sourceName",
    ] as const) {
      question[field] = translateDemoText(question[field]);
    }
  }
  for (const league of data.leagues) {
    if (!league.id.startsWith("demo-league-")) continue;
    league.name = translateDemoText(league.name);
    league.description = translateDemoText(league.description);
  }
  for (const question of argentinaExamples(now)) {
    if (!data.questions.some((existing) => existing.id === question.id))
      data.questions.push(question);
  }
  data.demoContentRevision = 2;
  return true;
}
