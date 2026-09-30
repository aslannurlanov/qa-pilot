"use client";

import { useActionState, useState } from "react";
import { submitResult, type ResultActionState } from "@/app/sessions/[sessionId]/run/actions";

const initialState: ResultActionState = {};

export function ExecutionActions({ sessionId, checkId }: { sessionId: string; checkId: string }) {
  const [mode, setMode] = useState<"FAIL" | "BLOCKED" | null>(null);
  const [state, action, pending] = useActionState(submitResult, initialState);
  return (
    <div className="panel space-y-5" aria-labelledby="result-title">
      <h2 id="result-title" className="section-title">Результат проверки</h2>
      <p className="text-sm text-slate-600">Выберите результат текущей проверки. Результат сохранится в этом запуске тестирования.</p>
      <div className="flex flex-wrap gap-3">
        <form action={action}>
          <input type="hidden" name="sessionId" value={sessionId} />
          <input type="hidden" name="checkId" value={checkId} />
          <button type="submit" name="outcome" value="PASS" disabled={pending} className="rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">ПРОЙДЕНО</button>
        </form>
        <button type="button" disabled={pending} onClick={() => setMode("FAIL")} aria-pressed={mode === "FAIL"} className="rounded-lg border border-rose-700 px-5 py-3 font-semibold text-rose-800 hover:bg-rose-50 aria-pressed:bg-rose-50 aria-pressed:ring-2 aria-pressed:ring-rose-700 disabled:opacity-60">ОШИБКА</button>
        <button type="button" disabled={pending} onClick={() => setMode("BLOCKED")} aria-pressed={mode === "BLOCKED"} className="rounded-lg border border-amber-700 px-5 py-3 font-semibold text-amber-900 hover:bg-amber-50 aria-pressed:bg-amber-50 aria-pressed:ring-2 aria-pressed:ring-amber-700 disabled:opacity-60">ЗАБЛОКИРОВАНО</button>
      </div>
      <p className="text-sm text-slate-500">«ОШИБКА» и «ЗАБЛОКИРОВАНО» выбирают тип результата и открывают форму. Для записи результата отправьте форму.</p>
      {mode && (
        <form action={action} className="space-y-4 border-t border-slate-200 pt-5" noValidate>
          <input type="hidden" name="sessionId" value={sessionId} />
          <input type="hidden" name="checkId" value={checkId} />
          <input type="hidden" name="outcome" value={mode} />
          <p className="text-sm font-medium text-slate-700">Выбрано: {mode === "FAIL" ? "ОШИБКА" : "ЗАБЛОКИРОВАНО"}. Результат ещё не сохранён.</p>
          <div>
            <label htmlFor="result-detail" className="block font-semibold">{mode === "FAIL" ? "Фактический результат" : "Причина блокировки"}</label>
            <textarea key={mode} id="result-detail" name={mode === "FAIL" ? "actualResult" : "reason"} className="field mt-2" rows={4} maxLength={5000} aria-invalid={Boolean(state.message && state.outcome === mode)} aria-describedby={state.message && state.outcome === mode ? "result-error" : undefined} />
          </div>
          <div>
            <label htmlFor="result-comment" className="block font-semibold">Комментарий <span className="font-normal text-slate-500">(необязательно)</span></label>
            <textarea id="result-comment" name="comment" className="field mt-2" rows={3} maxLength={5000} />
          </div>
          <button type="submit" disabled={pending} className="button-primary">{pending ? "Сохраняем…" : mode === "FAIL" ? "Зафиксировать ошибку и перейти дальше" : "Сохранить блокировку и перейти дальше"}</button>
          <p className="text-sm text-slate-500">После сохранения откроется следующая проверка.</p>
        </form>
      )}
      {state.message && (!state.outcome || state.outcome === mode) && <p id="result-error" role="alert" className="text-sm text-red-700">{state.message}</p>}
    </div>
  );
}
