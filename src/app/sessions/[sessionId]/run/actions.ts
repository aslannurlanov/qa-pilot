"use server";

import { redirect } from "next/navigation";
import { IdSchema } from "@/domain/schemas";
import { createDatabaseClient } from "@/server/db";
import { recordCheckResult, ResultInputSchema, startOrResumeRun } from "@/server/services/execute-test-plan";

import { PlanStartError } from "@/server/services/plan-write-guard";
import { reviewMessages } from "@/domain/schemas/plan-review";

export type ResultActionState = { message?: string; outcome?: "FAIL" | "BLOCKED" };

export async function startReviewedTesting(_previous: { message?: string }, formData: FormData): Promise<{ message?: string }> {
  const id = IdSchema.safeParse(formData.get("sessionId"));
  if (!id.success) return { message: reviewMessages["missing-plan"] };
  const db = createDatabaseClient();
  try {
    const run = await startOrResumeRun(db, id.data);
    if (!run) return { message: reviewMessages["missing-plan"] };
  } catch (error) {
    return { message: error instanceof PlanStartError ? reviewMessages[error.code] : "Не удалось начать тестирование. Попробуйте позже." };
  } finally { await db.$disconnect(); }
  redirect(`/sessions/${id.data}/run`);
}

export async function submitResult(_previous: ResultActionState, formData: FormData): Promise<ResultActionState> {
  const id = IdSchema.safeParse(formData.get("sessionId"));
  if (!id.success) return { message: "Проверка не найдена. Вернитесь к плану тестирования." };
  const rawOutcome = formData.get("outcome");
  const outcome = rawOutcome === "FAIL" || rawOutcome === "BLOCKED" ? rawOutcome : undefined;
  const raw = {
    checkId: formData.get("checkId"), outcome: rawOutcome,
    ...(rawOutcome === "FAIL" ? { actualResult: formData.get("actualResult"), comment: formData.get("comment") } : {}),
    ...(rawOutcome === "BLOCKED" ? { reason: formData.get("reason"), comment: formData.get("comment") } : {}),
  };
  const parsed = ResultInputSchema.safeParse(raw);
  if (!parsed.success) {
    if (outcome === "FAIL" && !String(formData.get("actualResult") ?? "").trim()) return { outcome, message: "Укажите фактический результат." };
    if (outcome === "BLOCKED" && !String(formData.get("reason") ?? "").trim()) return { outcome, message: "Укажите причину блокировки." };
    return { outcome, message: "Проверьте введённые данные. Максимальная длина поля — 5 000 символов." };
  }
  const db = createDatabaseClient();
  try {
    const result = await recordCheckResult(db, id.data, parsed.data);
    if (result === "stale-check") return { outcome, message: "Эта проверка уже не текущая. Обновите страницу." };
  } catch {
    return { outcome, message: "Не удалось сохранить результат. Попробуйте ещё раз." };
  } finally {
    await db.$disconnect();
  }
  redirect(`/sessions/${id.data}/run`);
}
