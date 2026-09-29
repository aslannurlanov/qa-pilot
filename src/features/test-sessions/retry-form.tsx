"use client";

import { useActionState } from "react";
import { retryAnalysis, type RetryState } from "@/app/sessions/[sessionId]/actions";

const initialState: RetryState = {};

export function RetryForm({ sessionId }: { sessionId: string }) {
  const [state, action, pending] = useActionState(retryAnalysis, initialState);
  return (
    <form action={action} className="mt-5 space-y-3">
      <input type="hidden" name="sessionId" value={sessionId} />
      <button type="submit" disabled={pending} className="button-primary">{pending ? "Анализируем…" : "Повторить анализ"}</button>
      <div aria-live="polite">
        {pending && <p role="status" className="text-sm text-indigo-700">Создаём план для сохранённой проверки…</p>}
        {state.message && !pending && <p role="alert" className="text-sm text-red-700">{state.message}</p>}
      </div>
    </form>
  );
}
