"use client";

import { useActionState } from "react";
import { changeCheckExclusion, type ReviewActionState } from "@/app/sessions/[sessionId]/review-actions";

export function CheckReviewControls({ sessionId, checkId, excluded, disabled, onEdit, onBusy }: {
  sessionId: string; checkId: string; excluded: boolean; disabled: boolean; onEdit: () => void; onBusy: (busy: boolean) => void;
}) {
  const [state, action, pending] = useActionState(async (previous: ReviewActionState, form: FormData) => {
    onBusy(true);
    try { return await changeCheckExclusion(previous, form); } finally { onBusy(false); }
  }, {});
  return <div className="mt-4">
    <form action={action} className="flex flex-wrap items-center gap-4">
      <input type="hidden" name="sessionId" value={sessionId} /><input type="hidden" name="checkId" value={checkId} /><input type="hidden" name="excluded" value={String(!excluded)} />
      <button type="button" disabled={disabled || pending} onClick={onEdit} className="text-indigo-700 underline">Редактировать</button>
      <button type="submit" disabled={disabled || pending} className="text-indigo-700 underline">{pending ? "Сохраняем…" : excluded ? "Вернуть в план" : "Исключить"}</button>
    </form>
    {state.message && <p role="alert" className="mt-2 text-sm text-red-700">{state.message}</p>}
  </div>;
}
