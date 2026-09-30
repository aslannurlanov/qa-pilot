"use server";

import { redirect } from "next/navigation";
import { IdSchema } from "@/domain/schemas";
import { createDatabaseClient } from "@/server/db";
import { createOrOpenBugReport } from "@/server/services/bug-reports";

export type CreateBugState = { message?: string };

export async function createBugReport(_previous: CreateBugState, formData: FormData): Promise<CreateBugState> {
  const session = IdSchema.safeParse(formData.get("sessionId"));
  const result = IdSchema.safeParse(formData.get("resultId"));
  if (!session.success || !result.success) return { message: "Результат не найден. Обновите страницу." };
  const db = createDatabaseClient();
  try {
    const report = await createOrOpenBugReport(db, session.data, result.data);
    if (!report) return { message: "Баг-репорт доступен только для ошибки в этой проверке." };
  } catch {
    return { message: "Не удалось создать баг-репорт. Попробуйте ещё раз." };
  } finally {
    await db.$disconnect();
  }
  redirect(`/sessions/${session.data}/run/bugs/${result.data}`);
}
