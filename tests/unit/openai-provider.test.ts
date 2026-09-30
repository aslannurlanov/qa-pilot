import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAIProvider, OPENAI_TIMEOUT_MS } from "@/server/ai/openai-provider";
import { GenerationError, generationMessage } from "@/server/ai/generation-errors";
import { usernameTask } from "@/server/ai/fixtures/username-plan";
import { GeneratedTestPlanSchema } from "@/domain/schemas";
import { jsonResponse, responseBody, wirePlan } from "../fixtures/openai-responses";

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "test-placeholder-never-a-real-key");
  vi.stubEnv("OPENAI_MODEL", "gpt-5.4-mini");
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("OpenAI adapter through mocked SDK transport", () => {
  it("sends one strict structured request and maps trusted metadata", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(responseBody()));
    const plan = await new OpenAIProvider(transport).generateTestPlan(usernameTask);
    expect(plan).toMatchObject({ metadata: { schemaVersion: "1", promptVersion: "qa-plan-v1", provider: "openai", model: "gpt-5.4-mini" } });
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, options] = transport.mock.calls[0]!;
    expect(String(url)).toBe("https://api.openai.com/v1/responses");
    const body = JSON.parse(String(options?.body));
    expect(body.max_output_tokens).toBe(4000);
    expect(body.store).toBe(false);
    expect(body.model).toBe("gpt-5.4-mini");
    expect(body.text.format).toMatchObject({ type: "json_schema", name: "qa_test_plan", strict: true });
    expect(body.text.format.schema.additionalProperties).toBe(false);
    expect(body.text.format.schema.required).toEqual(["summary", "risks", "questions", "checks"]);
    expect(body.input.map((item: { role: string }) => item.role)).toEqual(["developer", "user"]);
    expect(JSON.parse(body.input[1].content)).toEqual(usernameTask);
    expect(body.input[0].content).not.toContain(usernameTask.description);
    expect(body.tools).toBeUndefined();
    expect(body.previous_response_id).toBeUndefined();
    expect(body.conversation).toBeUndefined();
    expect(options?.signal).toBeDefined();
  });
  it("normalizes nullable source labels without inventing values", async () => {
    const wire = wirePlan();
    const plan = { ...wire, checks: wire.checks.map((check) => ({ ...check, sourceRefs: [{ kind: "requirement", reference: "user supplied", label: null }] })) };
    const transport = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(responseBody(plan)));
    const mapped = GeneratedTestPlanSchema.parse(await new OpenAIProvider(transport).generateTestPlan(usernameTask));
    expect(mapped.checks[0]).toMatchObject({ sourceRefs: [{ kind: "requirement", reference: "user supplied" }], excludedAt: null });
    expect(mapped.checks[0]?.sourceRefs?.[0]).not.toHaveProperty("label");
  });
  it.each([
    { ...wirePlan(), metadata: { provider: "fake" } },
    { ...wirePlan(), summary: " " },
    { ...wirePlan(), checks: wirePlan().checks.map((c) => ({ ...c, id: "duplicate" })) },
    { ...wirePlan(), checks: wirePlan().checks.map((c) => ({ ...c, position: 0 })) },
    { ...wirePlan(), checks: [], questions: [] },
  ])("rejects invalid structured/domain output", async (wire) => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(responseBody(wire)));
    await expect(new OpenAIProvider(transport).generateTestPlan(usernameTask)).rejects.toMatchObject({ code: "invalid_output" });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("rejects malformed JSON without a repair request", async () => {
    const response = responseBody();
    response.output[0]!.content[0]!.text = "```json invalid```";
    const transport = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(response));
    await expect(new OpenAIProvider(transport).generateTestPlan(usernameTask)).rejects.toMatchObject({ code: "invalid_output" });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("handles a refusal without exposing its text", async () => {
    const response = { ...responseBody(), output: [{ type: "message", role: "assistant", content: [{ type: "refusal", refusal: "sensitive vendor text" }] }] };
    const transport = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(response));
    await expect(new OpenAIProvider(transport).generateTestPlan(usernameTask)).rejects.toMatchObject({ code: "refusal" });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("rejects incomplete truncated output without parsing or retry", async () => {
    const response = responseBody({}, "incomplete");
    response.output[0]!.content[0]!.text = '{"summary":';
    const transport = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(response));
    await expect(new OpenAIProvider(transport).generateTestPlan(usernameTask)).rejects.toMatchObject({ code: "incomplete" });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it.each([[429, "rate_limit"], [500, "server"], [503, "server"], [401, "configuration"], [408, "timeout"]])("maps HTTP %s safely with SDK retries disabled", async (status, code) => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ error: { message: "sensitive vendor payload" } }, Number(status)));
    await expect(new OpenAIProvider(transport).generateTestPlan(usernameTask)).rejects.toMatchObject({ code });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("maps network failure without retry", async () => {
    const transport = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("sensitive connection details"));
    await expect(new OpenAIProvider(transport).generateTestPlan(usernameTask)).rejects.toMatchObject({ code: "network" });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("aborts at the 60-second deadline without retry", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | null | undefined;
    const transport = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => {
      signal = options?.signal;
      return new Promise<Response>((_resolve, reject) => signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
    });
    const result = new OpenAIProvider(transport).generateTestPlan(usernameTask);
    const assertion = expect(result).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(OPENAI_TIMEOUT_MS);
    await assertion;
    expect(signal?.aborted).toBe(true);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(["OPENAI_API_KEY", "OPENAI_MODEL"])("fails missing %s before transport", async (variable) => {
    vi.stubEnv(variable, "");
    const transport = vi.fn<typeof fetch>();
    await expect(new OpenAIProvider(transport).generateTestPlan(usernameTask)).rejects.toMatchObject({ code: "configuration" });
    expect(transport).not.toHaveBeenCalled();
  });
  it("uses only allowlisted Russian error text", () => {
    expect(generationMessage("sensitive vendor payload")).toBeUndefined();
    expect(generationMessage("__proto__")).toBeUndefined();
    expect(new GenerationError("configuration").message).toBe("Для AI-анализа не настроен доступ. Обратитесь к администратору.");
  });
});
