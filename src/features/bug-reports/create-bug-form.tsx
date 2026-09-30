"use client";

import { useActionState } from "react";
import { createBugReport, type CreateBugState } from "@/app/sessions/[sessionId]/run/bugs/actions";

const initialState: CreateBugState = {};

export function CreateBugForm({ sessionId, resultId }: { sessionId: string; resultId: string }) {
  const [state, action, pending] = useActionState(createBugReport, initialState);
  return <form action={action}>
    <input type="hidden" name="sessionId" value={sessionId} />
    <input type="hidden" name="resultId" value={resultId} />
    <button type="submit" className="button-primary" disabled={pending}>{pending ? "Создаём…" : "Создать баг-репорт"}</button>
    {state.message && <p role="alert" className="mt-2 text-sm text-red-700">{state.message}</p>}
  </form>;
}
