import { describe, expect, it } from "vitest";
import { GeneratedTestPlanSchema, TestCheckSchema, TestPlanSchema } from "@/domain/schemas";
import { usernamePlan } from "@/server/ai/fixtures/username-plan";
import { makePlan, timestamp } from "../fixtures/domain";

describe("test plan validation", () => {
  it("accepts a valid plan containing all four check types", () => {
    const plan = TestPlanSchema.parse(makePlan());
    expect(plan.checks.map((check) => check.type)).toEqual(["positive", "negative", "boundary", "regression"]);
  });

  it.each([19, 20, 21])("enforces the 20-check boundary for %i checks", (count) => {
    const plan = makePlan();
    const template = TestCheckSchema.parse(plan.checks[0]);
    plan.checks = Array.from({ length: count }, (_, position) => ({ ...template, id: `check-${position}`, position }));
    expect(TestPlanSchema.safeParse(plan).success).toBe(count <= 20);
    expect(GeneratedTestPlanSchema.safeParse({ ...usernamePlan, checks: plan.checks }).success).toBe(count <= 20);
  });

  it("rejects duplicate check IDs even with different positions", () => {
    const plan = makePlan();
    plan.checks = plan.checks.map((check) => ({ ...check, id: "duplicate" }));
    const result = TestPlanSchema.safeParse(plan);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((issue) => issue.message.includes("IDs must be unique"))).toBe(true);
  });

  it("rejects duplicate positions", () => {
    const plan = makePlan();
    plan.checks = plan.checks.map((check) => ({ ...check, position: 0 }));
    expect(TestPlanSchema.safeParse(plan).success).toBe(false);
  });

  it.each([undefined, "", "   "])("rejects missing or blank reasons (%s)", (reason) => {
    expect(TestCheckSchema.safeParse({ ...makePlan().checks[0], reason }).success).toBe(false);
  });

  it.each([{ steps: [] }, { steps: ["   "] }])("rejects empty or blank steps (%j)", ({ steps }) => {
    expect(TestCheckSchema.safeParse({ ...makePlan().checks[0], steps }).success).toBe(false);
  });

  it("rejects an unsupported check type and unknown fields", () => {
    expect(TestCheckSchema.safeParse({ ...makePlan().checks[0], type: "performance" }).success).toBe(false);
    expect(TestCheckSchema.safeParse({ ...makePlan().checks[0], injectedField: "ignore schema" }).success).toBe(false);
  });

  it("accepts omitted and explicit future traceability", () => {
    expect(TestCheckSchema.parse(makePlan().checks[0]).sourceRefs).toBeUndefined();
    const check = TestCheckSchema.parse({ ...makePlan().checks[0], sourceRefs: [{ kind: "requirement", reference: "4.2" }] });
    expect(check.sourceRefs).toEqual([{ kind: "requirement", reference: "4.2" }]);
  });

  it("can represent an excluded check and non-contiguous positions without changing IDs", () => {
    const plan = makePlan();
    plan.checks = plan.checks.map((check, index) => ({ ...check, position: index * 2, excludedAt: index === 0 ? timestamp : null }));
    expect(TestPlanSchema.parse(plan).checks[0]?.id).toBe("username-positive");
    expect(GeneratedTestPlanSchema.safeParse({ ...usernamePlan, checks: plan.checks }).success).toBe(false);
  });

  it("requires questions when no checks can be generated", () => {
    expect(GeneratedTestPlanSchema.safeParse({ ...usernamePlan, checks: [], questions: [] }).success).toBe(false);
    expect(GeneratedTestPlanSchema.safeParse({ ...usernamePlan, checks: [], questions: ["What should change?"] }).success).toBe(true);
  });
});
