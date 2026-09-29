import type { TaskInput } from "@/domain/schemas";

export interface AIProvider {
  // Provider data is untrusted. Only the application boundary returns a domain type.
  generateTestPlan(task: TaskInput): Promise<unknown>;
}
