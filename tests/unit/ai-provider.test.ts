import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { FakeAIProvider } from "@/server/ai/fake-ai-provider";
import { usernameTask } from "@/server/ai/fixtures/username-plan";
import { generateTestPlan } from "@/server/services/generate-test-plan";

describe("AI validation boundary", () => {
  it("returns the same validated fixture without leaking mutations between calls", async () => {
    const provider = new FakeAIProvider();
    const first = await generateTestPlan(usernameTask, provider);
    const second = await generateTestPlan(usernameTask, provider);
    expect(first).toEqual(second);
    expect(first.checks).toHaveLength(4);
    first.checks.splice(0);
    expect((await generateTestPlan(usernameTask, provider)).checks).toHaveLength(4);
    expect(second.metadata.provider).toBe("fake");
  });

  it("rejects invalid task input before calling the provider", async () => {
    const provider = new FakeAIProvider();
    const call = vi.spyOn(provider, "generateTestPlan");
    await expect(generateTestPlan({ title: "", description: "" }, provider)).rejects.toBeInstanceOf(ZodError);
    expect(call).not.toHaveBeenCalled();
  });

  it.each([null, "# Free-form markdown", { summary: "Incomplete plan", checks: [] }])("rejects malformed FakeAIProvider output (%j)", async (response) => {
    const provider = new FakeAIProvider();
    vi.spyOn(provider, "generateTestPlan").mockResolvedValue(response);
    await expect(generateTestPlan(usernameTask, provider)).rejects.toBeInstanceOf(ZodError);
  });

  it("rejects a plausible provider plan with an invalid check", async () => {
    const provider = new FakeAIProvider();
    const plan = await generateTestPlan(usernameTask, provider);
    vi.spyOn(provider, "generateTestPlan").mockResolvedValue({ ...plan, checks: plan.checks.map((check) => ({ ...check, reason: " " })) });
    await expect(generateTestPlan(usernameTask, provider)).rejects.toBeInstanceOf(ZodError);
  });
});
