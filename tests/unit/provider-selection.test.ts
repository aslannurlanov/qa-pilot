import { afterEach, describe, expect, it, vi } from "vitest";
import { createAIProvider } from "@/server/ai/create-provider";
import { getProviderDisclosure } from "@/server/config";
import { usernameTask } from "@/server/ai/fixtures/username-plan";
import { OpenAIProvider } from "@/server/ai/openai-provider";

afterEach(() => vi.unstubAllEnvs());

describe("lazy provider selection", () => {
  it.each([undefined, "fake"])("uses offline fake for %s without credentials", async (mode) => {
    vi.stubEnv("AI_PROVIDER", mode);
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(await createAIProvider().generateTestPlan(usernameTask)).toMatchObject({ metadata: { provider: "fake" } });
    expect(getProviderDisclosure()).toBe("fake");
  });
  it("does not resolve OpenAI credentials until generation", async () => {
    vi.stubEnv("AI_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "");
    const provider = createAIProvider();
    expect(getProviderDisclosure()).toBe("openai");
    await expect(provider.generateTestPlan(usernameTask)).rejects.toMatchObject({ code: "configuration" });
  });
  it("dispatches configured OpenAI mode to the adapter", async () => {
    vi.stubEnv("AI_PROVIDER", "openai");
    const call = vi.spyOn(OpenAIProvider.prototype, "generateTestPlan").mockResolvedValue({ mocked: true });
    expect(await createAIProvider().generateTestPlan(usernameTask)).toEqual({ mocked: true });
    expect(call).toHaveBeenCalledExactlyOnceWith(usernameTask);
  });
  it("rejects an unknown provider without fallback", async () => {
    vi.stubEnv("AI_PROVIDER", "typo");
    expect(getProviderDisclosure()).toBe("unavailable");
    await expect(createAIProvider().generateTestPlan(usernameTask)).rejects.toMatchObject({ code: "configuration" });
  });
});
