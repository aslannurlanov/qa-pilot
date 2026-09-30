import type { TestingReport } from "./testing-report";

export const reportTypeLabels = { positive: "Позитивный", negative: "Негативный", boundary: "Граничный", regression: "Регрессионный" } as const;
export const reportOutcomeLabels = { PASS: "ПРОЙДЕНО", FAIL: "ОШИБКА", BLOCKED: "ЗАБЛОКИРОВАНО" } as const;
export const reportBasisLabels = { requirement: "Требование", assumption: "Предположение" } as const;

export function formatTestingReport(report: TestingReport): string {
  const { session, plan, run, totals, entries } = report;
  const details = entries.map(({ check, result, bugUrl }) => [
    `${check.id} · ${check.title}`,
    `Тип: ${reportTypeLabels[check.type]}; результат: ${reportOutcomeLabels[result.outcome]}`,
    `Ожидаемый результат:\n${check.expectedResult}`,
    `Почему нужна проверка:\n${check.reason}`,
    `Основание: ${reportBasisLabels[check.basis]}`,
    ...(result.outcome === "FAIL" ? [`Фактический результат:\n${result.actualResult}`, bugUrl ? `Баг-репорт: ${bugUrl}` : "Баг-репорт не создан"] : []),
    ...(result.outcome === "BLOCKED" ? [`Причина блокировки:\n${result.reason}`] : []),
    ...(result.comment ? [`Комментарий:\n${result.comment}`] : []),
  ].join("\n"));
  const failures = entries.filter(({ result }) => result.outcome === "FAIL").map(({ check, result, bugUrl }) => {
    if (result.outcome !== "FAIL") return "";
    return `${check.id} · ${check.title}\nОжидаемый результат:\n${check.expectedResult}\nФактический результат:\n${result.actualResult}${result.comment ? `\nКомментарий:\n${result.comment}` : ""}\n${bugUrl ? `Баг-репорт: ${bugUrl}` : "Баг-репорт не создан"}`;
  });
  const blocked = entries.filter(({ result }) => result.outcome === "BLOCKED").map(({ check, result }) => {
    if (result.outcome !== "BLOCKED") return "";
    return `${check.id} · ${check.title}\nПричина блокировки:\n${result.reason}${result.comment ? `\nКомментарий:\n${result.comment}` : ""}`;
  });
  return [
    "Отчёт о тестировании",
    `Задача:\n${session.title}\n${session.description}\nID сессии: ${session.id}\nID запуска: ${run.id}`,
    `Область проверки:\n${plan.summary}\n${entries.map(({ check }) => `${check.id} · ${check.title}`).join("\n")}`,
    `Период:\nНачало: ${run.startedAt}\nЗавершение: ${run.completedAt}`,
    `Итоги:\nВсего проверок: ${totals.total}\nПройдено: ${totals.pass}\nОшибок: ${totals.fail}\nЗаблокировано: ${totals.blocked}\nЗаписано результатов: ${totals.recorded}\nБез результата: ${totals.unresolved}\n${report.conclusion}`,
    `Результаты проверок:\n${details.join("\n\n")}`,
    `Ошибки:\n${failures.length ? failures.join("\n\n") : "Ошибки не зафиксированы."}`,
    `Блокировки:\n${blocked.length ? blocked.join("\n\n") : "Блокировки не зафиксированы."}`,
    `Риски и вопросы из плана (контекст планирования, не подтверждённые находки или решённые вопросы):\nРиски:\n${plan.risks.length ? plan.risks.join("\n") : "Риски не указаны."}\nВопросы:\n${plan.questions.length ? plan.questions.join("\n") : "Вопросы не указаны."}`,
    `Происхождение плана:\nПровайдер: ${plan.metadata.provider}\nМодель: ${plan.metadata.model}\nВерсия схемы: ${plan.metadata.schemaVersion}\nВерсия шаблона: ${plan.metadata.promptVersion}${plan.metadata.provider === "fake" ? "\nДемонстрационный план: один пример проверки имени пользователя для любой задачи." : ""}`,
    "Отчёт отражает текущие сохранённые данные запуска. Он не является оценкой готовности релиза или полноты покрытия требований. Заблокированные проверки не подтверждают работоспособность.",
  ].join("\n\n");
}
