"use client";

import { useActionState, useId, useState } from "react";
import { saveCheck, type ReviewActionState } from "@/app/sessions/[sessionId]/review-actions";
import type { TestCheck } from "@/domain/schemas/plan";

export function CheckReviewForm({ sessionId, check, onClose }: { sessionId: string; check?: TestCheck; onClose: (saved?: boolean) => void }) {
  const prefix = useId();
  const [steps, setSteps] = useState(check?.steps ?? [""]);
  const [testData, setTestData] = useState(check?.testData ?? []);
  const [state, action, pending] = useActionState(async (previous: ReviewActionState, form: FormData) => {
    const next = await saveCheck(previous, form);
    if (next.success) onClose(true);
    return next;
  }, {});
  const hasError = (field: string) => Boolean(state.fields?.includes(field));
  function rows(name: "steps" | "testData", label: string, values: string[], setValues: (values: string[]) => void) {
    return <fieldset className="space-y-3"><legend className="font-semibold">{label}</legend>
      {values.map((value, index) => <div key={index} className="space-y-2">
        <label htmlFor={`${prefix}-${name}-${index}`} className="text-sm">{label}: {index + 1}</label>
        <textarea id={`${prefix}-${name}-${index}`} name={name} value={value} onChange={(event) => setValues(values.map((item, i) => i === index ? event.target.value : item))} rows={2} maxLength={5000} className="field" aria-invalid={hasError(name)} aria-describedby={hasError(name) ? `${prefix}-error` : undefined} />
        <button type="button" onClick={() => setValues(values.filter((_, i) => i !== index))} className="text-sm text-rose-700 underline">Удалить строку {index + 1} ({label.toLowerCase()})</button>
      </div>)}
      <button type="button" disabled={values.length >= 50} onClick={() => setValues([...values, ""])} className="text-sm text-indigo-700 underline">Добавить строку ({label.toLowerCase()})</button>
      {hasError(name) && <p className="text-sm text-red-700">{name === "steps" ? "Добавьте от 1 до 50 непустых шагов." : "Удалите пустые строки; допускается до 50 значений."} Каждая строка — до 5 000 символов.</p>}
    </fieldset>;
  }
  function text(name: "title" | "expectedResult" | "reason", label: string, max: number) {
    return <div><label htmlFor={`${prefix}-${name}`} className="font-semibold">{label}</label>
      <textarea id={`${prefix}-${name}`} name={name} defaultValue={check?.[name] ?? ""} maxLength={max} rows={name === "title" ? 2 : 3} className="field mt-2" aria-invalid={hasError(name)} aria-describedby={hasError(name) ? `${prefix}-error` : undefined} />
      {hasError(name) && <p className="text-sm text-red-700">Введите от 1 до {max.toLocaleString("ru-RU")} символов.</p>}
    </div>;
  }
  return <form action={action} noValidate className="mt-5 space-y-4 border-t border-slate-200 pt-5" aria-label={check ? "Редактирование проверки" : "Новая ручная проверка"}>
    <input type="hidden" name="sessionId" value={sessionId} /><input type="hidden" name="operation" value={check ? "update" : "add"} />
    {check && <input type="hidden" name="checkId" value={check.id} />}
    <fieldset disabled={pending} className="space-y-4">
      {text("title", "Название проверки", 200)}
      <div><label htmlFor={`${prefix}-type`} className="font-semibold">Тип проверки</label><select id={`${prefix}-type`} name="type" defaultValue={check?.type ?? "positive"} className="field mt-2"><option value="positive">Позитивный</option><option value="negative">Негативный</option><option value="boundary">Граничный</option><option value="regression">Регрессионный</option></select></div>
      {rows("steps", "Шаги", steps, setSteps)}{rows("testData", "Тестовые данные", testData, setTestData)}
      {text("expectedResult", "Ожидаемый результат", 5000)}{text("reason", "Почему нужна проверка", 5000)}
      <div><label htmlFor={`${prefix}-basis`} className="font-semibold">Основание</label><select id={`${prefix}-basis`} name="basis" defaultValue={check?.basis ?? "requirement"} className="field mt-2"><option value="requirement">Требование</option><option value="assumption">Предположение</option></select></div>
      <div className="flex flex-wrap gap-3"><button type="submit" className="button-primary">{pending ? "Сохраняем…" : check ? "Сохранить изменения" : "Добавить проверку"}</button><button type="button" onClick={() => onClose()} className="text-indigo-700 underline">Отмена</button></div>
    </fieldset>
    {state.message && <p id={`${prefix}-error`} role="alert" className="text-sm text-red-700">{state.message}</p>}
  </form>;
}
