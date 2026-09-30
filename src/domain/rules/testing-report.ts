import { TestingReportSourceSchema } from "../schemas/testing-report";

export class ReportIntegrityError extends Error {
  constructor() { super("Сохранённые данные тестирования несогласованы."); }
}

export function buildTestingReport(raw: unknown, expectedSessionId: string) {
  const source = TestingReportSourceSchema.parse(raw);
  const { session, plan, run, results, bugResultIds } = source;
  const checks = plan.checks.filter((check) => check.excludedAt === null).sort((a, b) => a.position - b.position);
  const executableIds = new Set(checks.map((check) => check.id));
  const resultIds = new Set(results.map((result) => result.id));
  const bugs = new Set(bugResultIds);
  if (session.id !== expectedSessionId || plan.sessionId !== session.id || run.planId !== plan.id
    || session.generationStatus !== "SUCCEEDED" || run.status !== "COMPLETED" || !run.completedAt
    || checks.length === 0 || results.length !== checks.length || resultIds.size !== results.length
    || bugs.size !== bugResultIds.length
    || results.some((result) => result.runId !== run.id || result.planId !== plan.id || !executableIds.has(result.checkId))
    || bugResultIds.some((id) => !results.some((result) => result.id === id && result.outcome === "FAIL"))) {
    throw new ReportIntegrityError();
  }
  const totals = {
    total: checks.length,
    pass: results.filter((result) => result.outcome === "PASS").length,
    fail: results.filter((result) => result.outcome === "FAIL").length,
    blocked: results.filter((result) => result.outcome === "BLOCKED").length,
    recorded: results.length,
    unresolved: checks.length - results.length,
  };
  return {
    session, plan, run, totals,
    conclusion: totals.fail > 0 ? "В проверенном объёме обнаружены ошибки."
      : totals.blocked > 0 ? "Ошибки не зафиксированы; часть проверок заблокирована."
        : "Все проверки этого плана пройдены.",
    entries: checks.map((check) => {
      const result = results.find((item) => item.checkId === check.id);
      if (!result) throw new ReportIntegrityError();
      return { check, result, bugUrl: bugs.has(result.id) ? `/sessions/${session.id}/run/bugs/${result.id}` : null };
    }),
  };
}

export type TestingReport = ReturnType<typeof buildTestingReport>;
