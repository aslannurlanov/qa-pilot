import type { AIProvider } from "./provider";
import { FakeAIProvider } from "./fake-ai-provider";
import { OpenAIProvider } from "./openai-provider";
import { getAIProviderMode } from "@/server/config";

// Selection/configuration happens only after the analysis service claims an attempt.
// Successful sessions and concurrent submissions therefore never resolve credentials.
export function createAIProvider(): AIProvider {
  return {
    async generateTestPlan(task) {
      const provider = getAIProviderMode() === "fake" ? new FakeAIProvider() : new OpenAIProvider();
      return provider.generateTestPlan(task);
    },
  };
}
