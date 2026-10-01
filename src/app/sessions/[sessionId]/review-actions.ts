"use server";

import { revalidatePath } from "next/cache";
import { createDatabaseClient } from "@/server/db";
import { addManualCheck, setCheckExcluded, updateCheck } from "@/server/services/review-test-plan";
import { reviewMessages } from "@/domain/schemas/plan-review";

export type ReviewActionState = { message?: string; fields?: string[]; success?: boolean };

export async function saveCheck(_previous: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const content = { title: form.get("title"), type: form.get("type"), steps: form.getAll("steps"), testData: form.getAll("testData"),
    expectedResult: form.get("expectedResult"), reason: form.get("reason"), basis: form.get("basis") };
  const sessionId = form.get("sessionId");
  const db = createDatabaseClient();
  try {
    const result = form.get("operation") === "add"
      ? await addManualCheck(db, { sessionId, content })
      : await updateCheck(db, { sessionId, checkId: form.get("checkId"), content });
    if (result.status === "saved" || result.status === "unchanged") {
      revalidatePath(`/sessions/${sessionId}`);
      return { success: true, message: "Изменения сохранены." };
    }
    return { message: reviewMessages[result.status], fields: result.status === "validation" ? result.fields : undefined };
  } finally { await db.$disconnect(); }
}

export async function changeCheckExclusion(_previous: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const sessionId = form.get("sessionId");
  const value = form.get("excluded");
  const db = createDatabaseClient();
  try {
    const result = await setCheckExcluded(db, { sessionId, checkId: form.get("checkId"), excluded: value === "true" ? true : value === "false" ? false : value });
    if (result.status === "saved" || result.status === "unchanged") {
      revalidatePath(`/sessions/${sessionId}`);
      return { success: true };
    }
    return { message: reviewMessages[result.status] };
  } finally { await db.$disconnect(); }
}
