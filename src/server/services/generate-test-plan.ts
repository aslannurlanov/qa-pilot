import { GeneratedTestPlanSchema, TaskInputSchema, type GeneratedTestPlan } from "@/domain/schemas";
import type { AIProvider } from "@/server/ai/provider";

export async function generateTestPlan(task: unknown, provider: AIProvider): Promise<GeneratedTestPlan> {
  const input = TaskInputSchema.parse(task);
  const response = await provider.generateTestPlan(input);
  return GeneratedTestPlanSchema.parse(response);
}
