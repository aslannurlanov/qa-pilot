"use client";

import { useActionState, useState } from "react";
import { analyzeTask } from "@/app/sessions/new/actions";
import type { TaskFormState } from "./form-state";

const initialState: TaskFormState = {};

export function TaskForm({ sessionId }: { sessionId: string }) {
  const [state, action, pending] = useActionState(analyzeTask, initialState);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  return (
    <form action={action} className="panel space-y-6" noValidate aria-busy={pending}>
      <input type="hidden" name="sessionId" value={sessionId} />
      <fieldset disabled={pending} className="space-y-6 disabled:opacity-70">
        <div>
          <label htmlFor="task-title" className="block font-semibold">Название задачи</label>
          <p id="title-hint" className="mt-1 text-sm text-slate-500">Коротко назовите изменение. Не более 200 символов.</p>
          <input
            id="task-title" name="title" value={title} onChange={(event) => setTitle(event.target.value)}
            required maxLength={200} className="field mt-3" autoComplete="off"
            aria-invalid={Boolean(state.errors?.title)} aria-describedby={`title-hint${state.errors?.title ? " title-error" : ""}`}
          />
          {state.errors?.title && <p id="title-error" className="mt-2 text-sm text-red-700">{state.errors.title}</p>}
        </div>
        <div>
          <label htmlFor="task-description" className="block font-semibold">Описание задачи</label>
          <p id="description-hint" className="mt-1 text-sm text-slate-500">Опишите требование, ожидаемое поведение и изменение. Не более 20 000 символов.</p>
          <textarea
            id="task-description" name="description" value={description} onChange={(event) => setDescription(event.target.value)}
            required maxLength={20_000} rows={8} className="field mt-3 resize-y"
            aria-invalid={Boolean(state.errors?.description)} aria-describedby={`description-hint${state.errors?.description ? " description-error" : ""}`}
          />
          {state.errors?.description && <p id="description-error" className="mt-2 text-sm text-red-700">{state.errors.description}</p>}
        </div>
        <button type="submit" className="button-primary">{pending ? "Анализируем…" : "Проанализировать задачу"}</button>
      </fieldset>
      <div aria-live="polite" aria-atomic="true">
        {pending && <p role="status" className="text-sm text-indigo-700">Анализируем задачу и сохраняем план…</p>}
        {!pending && state.message && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{state.message}</p>}
      </div>
    </form>
  );
}
