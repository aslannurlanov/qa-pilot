import type { BugReport } from "@/domain/schemas";

export function formatBugReport(report: BugReport): string {
  return [
    `Заголовок:\n${report.title}`,
    `Предусловия:\n${report.preconditions.length ? report.preconditions.join("\n") : "Не указаны."}`,
    `Шаги воспроизведения:\n${report.stepsToReproduce.map((step, index) => `${index + 1}. ${step}`).join("\n")}`,
    `Тестовые данные:\n${report.testData.length ? report.testData.join("\n") : "Не указаны."}`,
    `Фактический результат:\n${report.actualResult}`,
    `Ожидаемый результат:\n${report.expectedResult}`,
    `Дополнительная информация:\n${report.comment ?? "Не указана."}`,
  ].join("\n\n");
}
