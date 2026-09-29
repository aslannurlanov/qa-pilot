"use server";

import { redirect } from "next/navigation";
import { IdSchema, TaskInputSchema } from "@/domain/schemas";
import type { TaskFormState } from "@/features/test-sessions/form-state";
import { FakeAIProvider } from "@/server/ai/fake-ai-provider";
import { createDatabaseClient } from "@/server/db";
import { findTestSession } from "@/server/repositories/test-sessions";
import { AnalysisInProgressError, analyzeTestSession } from "@/server/services/analyze-test-session";

export async function analyzeTask(_previous: TaskFormState, formData: FormData): Promise<TaskFormState> {
  const input = TaskInputSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
  });
  if (!input.success) {
    const errors: NonNullable<TaskFormState["errors"]> = {};
    for (const issue of input.error.issues) {
      if (issue.path[0] === "title") errors.title = "Укажите название задачи длиной от 1 до 200 символов.";
      if (issue.path[0] === "description") errors.description = "Укажите описание задачи длиной от 1 до 20 000 символов.";
    }
    return { errors, message: "Проверьте выделенные поля." };
  }
  const id = IdSchema.safeParse(formData.get("sessionId"));
  if (!id.success) return { message: "Форма устарела. Обновите страницу и попробуйте ещё раз." };

  const db = createDatabaseClient();
  let destination: string | undefined;
  try {
    const sessionId = await analyzeTestSession(db, new FakeAIProvider(), id.data, input.data);
    destination = `/sessions/${sessionId}`;
  } catch (error) {
    const session = await findTestSession(db, id.data);
    if (session?.generationStatus === "FAILED" || session?.generationStatus === "RUNNING") {
      destination = `/sessions/${id.data}`;
    } else {
      return {
        message: error instanceof AnalysisInProgressError
          ? "Эта проверка уже анализируется. Попробуйте ещё раз чуть позже."
          : "Не удалось создать проверку. Введённые данные сохранены в форме. Попробуйте ещё раз.",
      };
    }
  } finally {
    await db.$disconnect();
  }
  // Next.js redirects throw; keep this outside the operation's error handler.
  redirect(destination!);
}
