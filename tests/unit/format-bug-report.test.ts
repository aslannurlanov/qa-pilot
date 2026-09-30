import { describe, expect, it } from "vitest";
import { formatBugReport } from "@/domain/rules/format-bug-report";
import { makeBug } from "../fixtures/domain";

describe("plain-text bug report", () => {
  it("formats all report sections and preserves ordered steps and the manual comment", () => {
    const report = { ...makeBug(), stepsToReproduce: ["Первый шаг", "Второй шаг"], comment: "Комментарий QA" };
    expect(formatBugReport(report)).toBe([
      `Заголовок:\n${report.title}`, "Предусловия:\nНе указаны.",
      "Шаги воспроизведения:\n1. Первый шаг\n2. Второй шаг",
      `Тестовые данные:\n${report.testData.join("\n")}`,
      `Фактический результат:\n${report.actualResult}`, `Ожидаемый результат:\n${report.expectedResult}`,
      "Дополнительная информация:\nКомментарий QA",
    ].join("\n\n"));
  });
  it("uses neutral empty states without inventing context", () => {
    const text = formatBugReport({ ...makeBug(), testData: [] });
    expect(text).toContain("Тестовые данные:\nНе указаны.");
    expect(text).toContain("Дополнительная информация:\nНе указана.");
  });
});
