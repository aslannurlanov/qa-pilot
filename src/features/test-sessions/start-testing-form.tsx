"use client";

import { useActionState } from "react";
import { startReviewedTesting } from "@/app/sessions/[sessionId]/run/actions";

export function StartTestingForm({ sessionId, disabled }: { sessionId: string; disabled: boolean }) {
  const [state, action, pending] = useActionState(startReviewedTesting, {});
  return <form action={action}>
    <input type="hidden" name="sessionId" value={sessionId} />
    <button type="submit" disabled={disabled || pending} className="button-primary">{pending ? "Открываем…" : "Начать тестирование"}</button>
    {disabled && <p className="mt-3 text-sm text-slate-500">Сначала сохраните изменения или закройте редактор.</p>}
    {state.message && <p role="alert" className="mt-3 text-sm text-red-700">{state.message}</p>}
  </form>;
}
