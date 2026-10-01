import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ExecutionActions } from "@/features/test-sessions/execution-actions";
import { CreateBugForm } from "@/features/bug-reports/create-bug-form";
import { createDatabaseClient } from "@/server/db";
import { getExecution } from "@/server/services/execute-test-plan";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const typeLabels = { positive: "Позитивный", negative: "Негативный", boundary: "Граничный", regression: "Регрессионный" } as const;
const outcomeLabels = { PASS: "ПРОЙДЕНО", FAIL: "ОШИБКА", BLOCKED: "ЗАБЛОКИРОВАНО" } as const;

export default async function RunPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const db = createDatabaseClient();
  const execution = await getExecution(db, sessionId).finally(() => db.$disconnect());
  if (!execution) notFound();
  if (!execution.run) redirect(`/sessions/${sessionId}`);
  const { session, checks, current, results, progress, bugResultIds } = execution;
  return (
    <main className="page-shell max-w-4xl">
      <nav aria-label="Навигация по проверке" className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-indigo-700">
        <Link href={`/sessions/${sessionId}`} className="hover:underline">План тестирования</Link>
        <Link href="/" className="hover:underline">Главная</Link>
      </nav>
      <p className="eyebrow mt-8">Выполнение плана</p>
      <h1 className="page-title wrap-break-word">{session.title}</h1>
      {current ? (
        <>
          <section className="mt-8 space-y-3" aria-label="Прогресс тестирования">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xl font-semibold">Проверка {checks.indexOf(current) + 1} из {progress.total}</h2>
              <p className="text-sm text-slate-600">Выполнено: {progress.done} из {progress.total}</p>
            </div>
            <progress aria-label="Выполнено проверок" className="h-3 w-full accent-indigo-700" value={progress.done} max={progress.total} />
          </section>
          <article className="panel my-6 space-y-5 wrap-break-word" aria-labelledby="current-check-title">
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="rounded-full bg-indigo-50 px-3 py-1 font-semibold text-indigo-800">{typeLabels[current.type]}</span>
              <span className="font-mono text-slate-600">ID проверки: {current.id}</span>
            </div>
            <h2 id="current-check-title" className="text-2xl font-semibold">{current.title}</h2>
            <section aria-labelledby="steps-title"><h3 id="steps-title" className="font-semibold">Шаги</h3><ol className="mt-2 list-decimal space-y-2 pl-5">{current.steps.map((step, index) => <li key={index} className="whitespace-pre-wrap">{step}</li>)}</ol></section>
            <section aria-labelledby="data-title"><h3 id="data-title" className="font-semibold">Тестовые данные</h3>{current.testData.length ? <ul className="mt-2 list-disc space-y-2 pl-5">{current.testData.map((item, index) => <li key={index} className="whitespace-pre-wrap">{item}</li>)}</ul> : <p className="mt-2 text-slate-600">Особые тестовые данные не указаны.</p>}</section>
            <section aria-labelledby="expected-title" className="rounded-xl bg-emerald-50 p-5"><h3 id="expected-title" className="font-semibold text-emerald-950">Ожидаемый результат</h3><p className="mt-2 whitespace-pre-wrap text-emerald-950">{current.expectedResult}</p></section>
            <section aria-labelledby="reason-title" className="rounded-xl bg-indigo-50 p-5"><h3 id="reason-title" className="font-semibold text-indigo-950">Почему нужна эта проверка?</h3><p className="mt-2 whitespace-pre-wrap text-indigo-950">{current.reason}</p></section>
          </article>
          <ExecutionActions sessionId={sessionId} checkId={current.id} />
        </>
      ) : (
        <>
          <section className="panel mt-8" aria-labelledby="complete-title">
            <p className="eyebrow">План выполнен</p>
            <h2 id="complete-title" className="mt-2 text-2xl font-semibold">Тестирование завершено</h2>
            <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[["Всего проверок", progress.total], ["Пройдено", progress.PASS], ["Ошибок", progress.FAIL], ["Заблокировано", progress.BLOCKED]].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-slate-50 p-4"><dt className="text-sm text-slate-600">{label}</dt><dd className="mt-1 text-2xl font-semibold">{value}</dd></div>
              ))}
            </dl>
            <Link href={`/sessions/${sessionId}/run/report`} className="button-primary mt-6 inline-block">Открыть отчёт о тестировании</Link>
          </section>
          <section className="mt-8" aria-labelledby="results-title">
            <h2 id="results-title" className="section-title">Записанные результаты</h2>
            <ol className="mt-4 space-y-4">
              {checks.map((check) => {
                const result = results.find((item) => item.checkId === check.id);
                return <li key={check.id} className="panel wrap-break-word">
                  <p className="text-sm text-slate-500">Проверка {checks.indexOf(check) + 1} · ID: {check.id}</p>
                  <h3 className="mt-2 text-lg font-semibold">{check.title}</h3>
                  <p className="mt-2 font-semibold">{result ? outcomeLabels[result.outcome] : "Нет результата"}</p>
                  {result?.outcome === "FAIL" && <p className="mt-3 whitespace-pre-wrap"><strong>Фактический результат:</strong> {result.actualResult}</p>}
                  {result?.outcome === "BLOCKED" && <p className="mt-3 whitespace-pre-wrap"><strong>Причина блокировки:</strong> {result.reason}</p>}
                  {result?.comment && <p className="mt-2 whitespace-pre-wrap"><strong>Комментарий:</strong> {result.comment}</p>}
                  {result?.outcome === "FAIL" && (
                    <div className="mt-4">
                      {bugResultIds.includes(result.id) ? (
                        <Link href={`/sessions/${sessionId}/run/bugs/${result.id}`} className="button-primary">Открыть баг-репорт</Link>
                      ) : <CreateBugForm sessionId={sessionId} resultId={result.id} />}
                    </div>
                  )}
                </li>;
              })}
            </ol>
          </section>
        </>
      )}
    </main>
  );
}
