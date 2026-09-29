"use server";

import { redirect } from "next/navigation";
import { IdSchema } from "@/domain/schemas";
import { FakeAIProvider } from "@/server/ai/fake-ai-provider";
import { createDatabaseClient } from "@/server/db";
import { findTestSession } from "@/server/repositories/test-sessions";
import { AnalysisInProgressError, analyzeTestSession } from "@/server/services/analyze-test-session";

export type RetryState = { message?: string };

export async function retryAnalysis(_previous: RetryState, formData: FormData): Promise<RetryState> {
  const id = IdSchema.safeParse(formData.get("sessionId"));
  if (!id.success) return { message: "Проверка не найдена. Вернитесь на главную страницу и откройте её снова." };

  const db = createDatabaseClient();
  try {
    const session = await findTestSession(db, id.data);
    if (!session) return { message: "Проверка не найдена. Вернитесь на главную страницу и откройте её снова." };
    if (session.generationStatus === "RUNNING") return { message: "Анализ уже идёт. Обновите страницу через некоторое время." };
    await analyzeTestSession(db, new FakeAIProvider(), id.data, { title: session.title, description: session.description });
  } catch (error) {
    return {
      message: error instanceof AnalysisInProgressError
        ? "Анализ уже идёт. Обновите страницу через некоторое время."
        : "Повторный анализ не удался. Проверка сохранена — можно попробовать ещё раз.",
    };
  } finally {
    await db.$disconnect();
  }
  redirect(`/sessions/${id.data}`);
}
