import { describe, expect, it } from "vitest";
import { buildTestingReport } from "@/domain/rules/testing-report";
import { formatTestingReport } from "@/domain/rules/format-testing-report";
import type { TestingReportSource } from "@/domain/schemas/testing-report";
import type { CheckOutcome } from "@/domain/schemas";
import { usernamePlan, usernameTask } from "@/server/ai/fixtures/username-plan";

const timestamp = "2026-09-30T10:00:00.000Z";
function source(outcomes: CheckOutcome[] = ["PASS", "FAIL", "BLOCKED", "PASS"]): TestingReportSource {
  return {
    session: { ...usernameTask, id: "session-1", generationStatus: "SUCCEEDED", createdAt: timestamp, updatedAt: timestamp },
    plan: { ...structuredClone(usernamePlan), id: "plan-1", sessionId: "session-1", createdAt: timestamp },
    run: { id: "run-1", planId: "plan-1", status: "COMPLETED", startedAt: timestamp, completedAt: timestamp },
    results: outcomes.map((outcome, index) => ({
      id: `result-${index}`, runId: "run-1", planId: "plan-1", checkId: usernamePlan.checks[index]!.id, recordedAt: timestamp,
      ...(outcome === "PASS" ? { outcome } : outcome === "FAIL" ? { outcome, actualResult: "Фактический результат\nВторая строка", comment: "Комментарий QA" } : { outcome, reason: "Нет доступа\nОжидаем среду", comment: "" }),
    })),
    bugResultIds: [],
  };
}

describe("final testing report projection", () => {
  it("counts recorded outcomes without treating BLOCKED as PASS", () => {
    const report = buildTestingReport(source(), "session-1");
    expect(report.totals).toEqual({ total: 4, pass: 2, fail: 1, blocked: 1, recorded: 4, unresolved: 0 });
    expect(report.conclusion).toBe("В проверенном объёме обнаружены ошибки.");
  });
  it.each([
    [["PASS", "PASS", "PASS", "PASS"], "Все проверки этого плана пройдены."],
    [["BLOCKED", "BLOCKED", "BLOCKED", "BLOCKED"], "Ошибки не зафиксированы; часть проверок заблокирована."],
    [["BLOCKED", "FAIL", "PASS", "PASS"], "В проверенном объёме обнаружены ошибки."],
  ] as [CheckOutcome[], string][])("uses conclusion precedence for %j", (outcomes, expected) => {
    expect(buildTestingReport(source(outcomes), "session-1").conclusion).toBe(expected);
  });
  it("orders non-contiguous check positions deterministically without mutating input", () => {
    const data = source();
    data.plan.checks.reverse();
    data.plan.checks.forEach((check) => { check.position *= 2; });
    const before = structuredClone(data);
    const report = buildTestingReport(data, "session-1");
    expect(report.entries.map(({ check }) => check.id)).toEqual(usernamePlan.checks.map((check) => check.id));
    expect(data).toEqual(before);
  });
  it("excludes reserved excluded checks from scope and totals", () => {
    const data = source();
    data.plan.checks[3]!.excludedAt = timestamp;
    data.results.pop();
    expect(buildTestingReport(data, "session-1").totals.total).toBe(3);
  });
  it("creates only scoped links for existing failed-result BugReports", () => {
    const data = source();
    expect(buildTestingReport(data, "session-1").entries[1]?.bugUrl).toBeNull();
    data.bugResultIds = ["result-1"];
    expect(buildTestingReport(data, "session-1").entries[1]?.bugUrl).toBe("/sessions/session-1/run/bugs/result-1");
  });
  it.each([
    (data: TestingReportSource) => { data.results.pop(); },
    (data: TestingReportSource) => { data.results[1] = { ...data.results[0]!, id: "duplicate-result" }; },
    (data: TestingReportSource) => { data.results[1]!.id = data.results[0]!.id; },
    (data: TestingReportSource) => { data.results[0]!.runId = "other-run"; },
    (data: TestingReportSource) => { data.results[0]!.planId = "other-plan"; },
    (data: TestingReportSource) => { data.results[0]!.checkId = "missing-check"; },
    (data: TestingReportSource) => { data.plan.sessionId = "other-session"; },
    (data: TestingReportSource) => { data.run.planId = "other-plan"; },
    (data: TestingReportSource) => { data.run.status = "IN_PROGRESS"; data.run.completedAt = null; },
    (data: TestingReportSource) => { data.run.completedAt = null; },
    (data: TestingReportSource) => { data.run.completedAt = "invalid-date"; },
    (data: TestingReportSource) => { data.bugResultIds = ["result-0"]; },
    (data: TestingReportSource) => { data.bugResultIds = ["result-1", "result-1"]; },
    (data: TestingReportSource) => { data.plan.checks[0]!.excludedAt = timestamp; },
    (data: TestingReportSource) => { data.plan.checks = []; data.results = []; },
  ])("rejects inconsistent or ineligible source data", (mutate) => {
    const data = source();
    mutate(data);
    expect(() => buildTestingReport(data, "session-1")).toThrow();
  });
  it("rejects a different requested session", () => {
    expect(() => buildTestingReport(source(), "other-session")).toThrow();
  });
});

describe("plain-text testing report", () => {
  it("preserves multiline and long content, complete sections, provenance, and stable output", () => {
    const data = source();
    data.session.description = `${"Длинное описание ".repeat(300)}\nВторая строка`;
    const report = buildTestingReport(data, "session-1");
    const text = formatTestingReport(report);
    expect(text).toBe(formatTestingReport(report));
    expect(text).toContain(data.session.description);
    expect(text).toContain("Фактический результат\nВторая строка");
    expect(text).toContain("Нет доступа\nОжидаем среду");
    expect(text).toContain("Комментарий QA");
    expect(text).toContain("Баг-репорт не создан");
    for (const section of ["Задача:", "Область проверки:", "Период:", "Итоги:", "Результаты проверок:", "Ошибки:", "Блокировки:", "Риски и вопросы из плана", "Происхождение плана:"]) expect(text).toContain(section);
    expect(text).toContain("Демонстрационный план");
    expect(text).not.toContain("%");
    expect(text.indexOf("username-positive")).toBeLessThan(text.indexOf("username-negative"));
  });
  it("uses neutral empty states and preserves real provider provenance", () => {
    const data = source(["PASS", "PASS", "PASS", "PASS"]);
    data.plan.risks = []; data.plan.questions = [];
    data.plan.metadata.provider = "openai";
    const text = formatTestingReport(buildTestingReport(data, "session-1"));
    for (const empty of ["Риски не указаны.", "Вопросы не указаны.", "Ошибки не зафиксированы.", "Блокировки не зафиксированы."]) expect(text).toContain(empty);
    expect(text).toContain("Провайдер: openai");
    expect(text).not.toContain("Демонстрационный план");
  });
});
