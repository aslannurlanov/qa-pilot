import { TaskInputSchema, type TaskInput } from "@/domain/schemas";
import { usernamePlan } from "./fixtures/username-plan";
import type { AIProvider } from "./provider";

export class FakeAIProvider implements AIProvider {
  async generateTestPlan(task: TaskInput): Promise<unknown> {
    TaskInputSchema.parse(task);
    // A fresh copy prevents one caller from corrupting subsequent fixture responses.
    return structuredClone(usernamePlan);
  }
}
