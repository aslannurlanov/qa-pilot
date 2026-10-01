import type { TestCheck } from "../schemas/plan";

export function checkProvenance(check: Pick<TestCheck, "origin" | "editedAt">, provider: string): string {
  if (check.origin === "MANUAL") return "Добавлено QA";
  if (check.editedAt) return provider === "fake" ? "Изменено QA · Основа: демонстрационный пример" : "Изменено QA";
  return provider === "fake" ? "Демонстрационный пример" : "Сгенерировано AI";
}
