import { describe, expect, it } from "vitest";
import { CheckContentSchema, GeneratedTestPlanSchema, MAX_PLAN_CHECKS, TestCheckSchema, TestPlanSchema } from "@/domain/schemas/plan";
import { AddManualCheckSchema, SetCheckExcludedSchema, UpdateCheckSchema } from "@/domain/schemas/plan-review";
import { checkProvenance } from "@/domain/rules/check-provenance";
import { formatTestingReport } from "@/domain/rules/format-testing-report";
import { buildTestingReport } from "@/domain/rules/testing-report";
import { usernamePlan, usernameTask } from "@/server/ai/fixtures/username-plan";

// Content extraction is explicit: strict mutation schemas reject server-owned fields.
const editable = () => { const c = usernamePlan.checks[0]!; return { title: c.title, type: c.type, steps: c.steps, testData: c.testData, expectedResult: c.expectedResult, reason: c.reason, basis: c.basis }; };

describe("review validation and provenance", () => {
  it("accepts trimmed boundaries and preserves multiline list entries", () => {
    const parsed = CheckContentSchema.parse({ ...editable(), title: ` ${"a".repeat(200)} `, steps: ["line 1\nline 2"], testData: [], expectedResult: "e".repeat(5000), reason: " r " });
    expect(parsed.title).toHaveLength(200); expect(parsed.reason).toBe("r"); expect(parsed.steps).toEqual(["line 1\nline 2"]);
  });
  it.each([
    { title: " " }, { title: "x".repeat(201) }, { steps: [] }, { steps: [" "] }, { steps: Array(51).fill("s") },
    { testData: [""] }, { testData: Array(51).fill("d") }, { reason: "" }, { reason: "x".repeat(5001) },
    { expectedResult: " " }, { expectedResult: "x".repeat(5001) }, { steps: ["x".repeat(5001)] }, { testData: ["x".repeat(5001)] },
    { type: "performance" }, { basis: "MANUAL" },
  ])("rejects invalid content %j", (patch) => { expect(CheckContentSchema.safeParse({ ...editable(), ...patch }).success).toBe(false); });
  it("rejects client identity, provenance and malformed scope", () => {
    expect(AddManualCheckSchema.safeParse({ sessionId: "s", content: editable(), id: "client-id" }).success).toBe(false);
    expect(UpdateCheckSchema.safeParse({ sessionId: "../s", checkId: "c", content: editable() }).success).toBe(false);
    expect(CheckContentSchema.safeParse({ ...editable(), position: 5 }).success).toBe(false);
    expect(SetCheckExcludedSchema.safeParse({ sessionId: "s", checkId: "c", excluded: "true" }).success).toBe(false);
  });
  it("uses a single cap for generation and persisted review", () => {
    const checks = Array.from({ length: MAX_PLAN_CHECKS }, (_, i) => ({ ...usernamePlan.checks[0]!, id: `c-${i}`, position: i }));
    const plan = { ...usernamePlan, checks };
    expect(GeneratedTestPlanSchema.safeParse(plan).success).toBe(true);
    expect(TestPlanSchema.safeParse({ ...plan, id: "p", sessionId: "s", createdAt: "2026-10-01T00:00:00Z" }).success).toBe(true);
    checks.push({ ...checks[0]!, id: "extra", position: 20 });
    expect(GeneratedTestPlanSchema.safeParse(plan).success).toBe(false);
    expect(TestPlanSchema.safeParse({ ...plan, id: "p", sessionId: "s", createdAt: "2026-10-01T00:00:00Z" }).success).toBe(false);
  });
  it("generation cannot supply application provenance, even default values", () => {
    for (const patch of [{ origin: "MANUAL" }, { origin: "GENERATED", editedAt: null }]) {
      expect(GeneratedTestPlanSchema.safeParse({ ...usernamePlan, checks: [{ ...usernamePlan.checks[0], ...patch }] }).success).toBe(false);
    }
  });
  it("labels original, edited demo, edited AI, and manual checks truthfully", () => {
    const c = TestCheckSchema.parse(usernamePlan.checks[0]);
    expect(checkProvenance(c, "fake")).toBe("Демонстрационный пример"); expect(checkProvenance(c, "openai")).toBe("Сгенерировано AI");
    c.editedAt = "2026-10-01T00:00:00Z";
    expect(checkProvenance(c, "fake")).toContain("Основа: демонстрационный пример"); expect(checkProvenance(c, "openai")).toBe("Изменено QA");
    c.origin = "MANUAL"; expect(checkProvenance(c, "fake")).toBe("Добавлено QA");
  });
  it("rejects unsafe positions and allows gaps", () => {
    expect(TestCheckSchema.safeParse({ ...usernamePlan.checks[0], position: Number.MAX_SAFE_INTEGER + 1 }).success).toBe(false);
    expect(TestCheckSchema.safeParse({ ...usernamePlan.checks[0], position: 7 }).success).toBe(true);
  });
  it("includes per-check provenance in deterministic report text", () => {
    const t = "2026-10-01T00:00:00Z";
    const plan = TestPlanSchema.parse({ ...usernamePlan, id: "p", sessionId: "s", createdAt: t });
    plan.checks[0]!.editedAt = t; plan.checks[1]!.origin = "MANUAL";
    const report = buildTestingReport({ session: { ...usernameTask, id: "s", generationStatus: "SUCCEEDED", createdAt: t, updatedAt: t }, plan,
      run: { id: "r", planId: "p", status: "COMPLETED", startedAt: t, completedAt: t },
      results: plan.checks.map(c => ({ id: `res-${c.id}`, runId: "r", planId: "p", checkId: c.id, outcome: "PASS", recordedAt: t })), bugResultIds: [] }, "s");
    const text = formatTestingReport(report); expect(text).toContain("Изменено QA"); expect(text).toContain("Добавлено QA"); expect(text).toContain("исходного сгенерированного плана");
  });
});
