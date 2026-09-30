import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { GeneratedTestPlanSchema, TaskInputSchema, type TaskInput } from "@/domain/schemas";
import { getOpenAIConfig } from "@/server/config";
import type { AIProvider } from "./provider";
import { GenerationError } from "./generation-errors";
import { OpenAIPlanSchema } from "./openai-plan-schema";
import { PROMPT_VERSION, taskMessages } from "./test-plan-prompt";

export const OPENAI_TIMEOUT_MS = 60_000;
export const OPENAI_MAX_OUTPUT_TOKENS = 4_000;

// Fetch injection lets tests exercise the real SDK parser without network access.
export class OpenAIProvider implements AIProvider {
  constructor(private readonly transport?: typeof fetch) {}

  async generateTestPlan(task: TaskInput): Promise<unknown> {
    const input = TaskInputSchema.parse(task);
    const { apiKey, model } = getOpenAIConfig();
    const client = new OpenAI({
      apiKey, maxRetries: 0, timeout: OPENAI_TIMEOUT_MS, fetch: this.transport,
      baseURL: "https://api.openai.com/v1", logLevel: "off",
    });
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
    try {
      const response = await client.responses.parse({
        model,
        input: taskMessages(input),
        max_output_tokens: OPENAI_MAX_OUTPUT_TOKENS,
        store: false,
        text: { format: zodTextFormat(OpenAIPlanSchema, "qa_test_plan") },
      }, { signal: controller.signal, maxRetries: 0, timeout: OPENAI_TIMEOUT_MS });
      if (response.output.some((item) => item.type === "message" && item.content.some((content) => content.type === "refusal"))) {
        throw new GenerationError("refusal");
      }
      if (response.status === "incomplete") throw new GenerationError("incomplete");
      if (response.status !== "completed") throw new GenerationError("server");
      const wire = OpenAIPlanSchema.parse(response.output_parsed);
      return GeneratedTestPlanSchema.parse({
        ...wire,
        checks: wire.checks.map((check) => ({
          ...check,
          sourceRefs: check.sourceRefs.map(({ label, ...source }) => ({ ...source, ...(label === null ? {} : { label }) })),
          excludedAt: null,
        })),
        metadata: { schemaVersion: "1", promptVersion: PROMPT_VERSION, provider: "openai", model },
      });
    } catch (error) {
      if (controller.signal.aborted || error instanceof OpenAI.APIConnectionTimeoutError) throw new GenerationError("timeout");
      if (error instanceof GenerationError) throw error;
      if (error instanceof OpenAI.APIConnectionError) throw new GenerationError("network");
      if (error instanceof OpenAI.APIError) {
        if (error.status === 429) throw new GenerationError("rate_limit");
        if (error.status === 408 || error.status === 504) throw new GenerationError("timeout");
        if (error.status && error.status >= 500) throw new GenerationError("server");
        throw new GenerationError("configuration");
      }
      throw new GenerationError("invalid_output");
    } finally {
      clearTimeout(deadline);
    }
  }
}
