import type { CheckType, TestCheck, TestPlan } from "@/domain/schemas";

const checkTypeLabels: Record<CheckType, string> = {
  positive: "Позитивный",
  negative: "Негативный",
  boundary: "Граничный",
  regression: "Регрессионный",
};

const basisLabels: Record<TestCheck["basis"], string> = {
  requirement: "Требование",
  assumption: "Предположение",
};

function TextList({ items, empty }: { items: string[]; empty: string }) {
  return items.length === 0 ? <p className="text-slate-500">{empty}</p> : (
    <ul className="list-disc space-y-2 pl-5">{items.map((item, index) => <li key={index}>{item}</li>)}</ul>
  );
}

export function PlanReview({ plan }: { plan: TestPlan }) {
  return (
    <div className="space-y-6">
      <section className="panel" aria-labelledby="summary-title">
        <h2 id="summary-title" className="section-title">Что изменилось</h2>
        <p className="mt-3 whitespace-pre-wrap text-slate-600">{plan.summary}</p>
      </section>
      <div className="grid gap-6 md:grid-cols-2">
        <section className="panel" aria-labelledby="risks-title">
          <h2 id="risks-title" className="section-title mb-3">Риски</h2>
          <TextList items={plan.risks} empty="Риски не указаны." />
        </section>
        <section className="panel" aria-labelledby="questions-title">
          <h2 id="questions-title" className="section-title mb-3">Вопросы / Недостающая информация</h2>
          <TextList items={plan.questions} empty="Уточняющих вопросов нет." />
        </section>
      </div>
      <section aria-labelledby="checks-title" className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="checks-title" className="section-title">План тестирования</h2>
          <p className="text-sm text-slate-500">Проверок: {plan.checks.length} из 20</p>
        </div>
        {plan.checks.length === 0 && <p className="panel">Проверки не сформированы. Сначала уточните вопросы по задаче.</p>}
        {plan.checks.map((check, index) => (
          <article key={check.id} className={`panel wrap-break-word border-l-4 ${check.type === "positive" ? "border-l-emerald-500" : check.type === "negative" ? "border-l-rose-500" : check.type === "boundary" ? "border-l-amber-500" : "border-l-sky-500"}`} aria-labelledby={`check-${check.id}`}>
            <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
              <span className="font-semibold text-slate-500">Проверка {index + 1}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-800">{checkTypeLabels[check.type]}</span>
              <span className="font-mono text-xs text-slate-500">ID проверки: {check.id}</span>
            </div>
            <h3 id={`check-${check.id}`} className="text-xl font-semibold">{check.title}</h3>
            <div className="my-5 rounded-lg border-l-4 border-indigo-400 bg-indigo-50 p-4">
              <h4 className="font-semibold text-indigo-950">Почему нужна эта проверка?</h4>
              <p className="mt-2 whitespace-pre-wrap text-indigo-950">{check.reason}</p>
              <p className="mt-2 text-xs text-indigo-700">Основание: {basisLabels[check.basis]}</p>
            </div>
            <h4 className="mb-2 font-semibold">Шаги</h4>
            <ol className="list-decimal space-y-2 pl-5">{check.steps.map((step, stepIndex) => <li key={stepIndex}>{step}</li>)}</ol>
            <h4 className="mb-2 mt-5 font-semibold">Тестовые данные</h4>
            <TextList items={check.testData} empty="Особые тестовые данные не указаны." />
            <h4 className="mb-2 mt-5 font-semibold">Ожидаемый результат</h4>
            <p className="whitespace-pre-wrap">{check.expectedResult}</p>
            {check.sourceRefs && check.sourceRefs.length > 0 && (
              <div className="mt-5">
                <h4 className="mb-2 font-semibold">Источники</h4>
                <ul className="list-disc space-y-2 pl-5">{check.sourceRefs.map((source, sourceIndex) => (
                  <li key={sourceIndex}>{source.label ? `${source.label}: ` : ""}{source.kind} · {source.reference}</li>
                ))}</ul>
              </div>
            )}
          </article>
        ))}
      </section>
      <div className="panel">
        <button type="button" disabled className="button-primary">Начать тестирование</button>
        <p className="mt-3 text-sm text-slate-600">Будет доступно на следующем этапе.</p>
      </div>
      <p className="text-xs text-slate-500">Провайдер: {plan.metadata.provider} · Модель: {plan.metadata.model} · Версия схемы: {plan.metadata.schemaVersion} · Версия шаблона: {plan.metadata.promptVersion}</p>
    </div>
  );
}
