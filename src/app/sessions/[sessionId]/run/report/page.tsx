import Link from "next/link";
import { notFound } from "next/navigation";
import { DemoNotice } from "@/components/ui/demo-notice";
import { LocalDateTime } from "@/components/ui/local-date-time";
import { formatTestingReport, reportTypeLabels, reportOutcomeLabels, reportBasisLabels } from "@/domain/rules/format-testing-report";
import type { TestingReport } from "@/domain/rules/testing-report";
import { CopyTestingReport } from "@/features/testing-reports/copy-testing-report";
import { createDatabaseClient } from "@/server/db";
import { getTestingReport } from "@/server/services/testing-report";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function ResultDetails({ entry, full = false }: { entry: TestingReport["entries"][number]; full?: boolean }) {
  const { check, result, bugUrl } = entry;
  return <li className="panel wrap-break-word space-y-3">
    <h3 className="text-lg font-semibold">{check.title}</h3>
    <p className="text-sm text-slate-600">ID: {check.id} · {reportTypeLabels[check.type]} · {reportOutcomeLabels[result.outcome]}</p>
    <p className="whitespace-pre-wrap"><strong>Ожидаемый результат:</strong> {check.expectedResult}</p>
    {full && <><p className="whitespace-pre-wrap"><strong>Почему нужна проверка:</strong> {check.reason}</p><p>Основание: {reportBasisLabels[check.basis]}</p></>}
    {result.outcome === "FAIL" && <p className="whitespace-pre-wrap"><strong>Фактический результат:</strong> {result.actualResult}</p>}
    {result.outcome === "BLOCKED" && <p className="whitespace-pre-wrap"><strong>Причина блокировки:</strong> {result.reason}</p>}
    {result.comment && <p className="whitespace-pre-wrap"><strong>Комментарий:</strong> {result.comment}</p>}
    {result.outcome === "FAIL" && (bugUrl ? <Link href={bugUrl} className="inline-block font-medium text-indigo-700 underline">Открыть баг-репорт</Link> : <p className="text-sm text-slate-500">Баг-репорт не создан</p>)}
  </li>;
}

export default async function TestingReportPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const db = createDatabaseClient();
  const state = await getTestingReport(db, sessionId).finally(() => db.$disconnect());
  if (state.status === "not-found") notFound();
  const unavailableMessages = {
    "not-started": "Тестирование ещё не начато. Итоговый отчёт появится после завершения запуска.",
    unfinished: "Тестирование ещё не завершено. Продолжите выполнение проверок, чтобы открыть итоговый отчёт.",
    invalid: "Сохранённые данные тестирования несогласованы. Итоговый отчёт недоступен, чтобы не показывать неверные результаты.",
    unavailable: "Не удалось загрузить отчёт. Попробуйте открыть его позже.",
  };
  if (state.status !== "ready") return <main className="page-shell max-w-3xl">
    <h1 className="page-title">Отчёт о тестировании недоступен</h1>
    <p role="alert" className="panel my-6">{unavailableMessages[state.status]}</p>
    <nav className="flex flex-wrap gap-4 text-indigo-700"><Link href={`/sessions/${sessionId}`}>План тестирования</Link><Link href={`/sessions/${sessionId}/run`}>Открыть тестирование</Link><Link href="/">Главная</Link></nav>
  </main>;
  const { report } = state;
  const { session, plan, run, totals, entries } = report;
  const failures = entries.filter(({ result }) => result.outcome === "FAIL");
  const blocked = entries.filter(({ result }) => result.outcome === "BLOCKED");
  return <main className="page-shell max-w-4xl space-y-6">
    <nav aria-label="Навигация по отчёту" className="flex flex-wrap gap-4 text-sm font-medium text-indigo-700">
      <Link href={`/sessions/${sessionId}/run`}>Результаты тестирования</Link><Link href={`/sessions/${sessionId}`}>План тестирования</Link><Link href="/">Главная</Link>
    </nav>
    <h1 className="page-title">Отчёт о тестировании</h1>
    <section className="panel wrap-break-word" aria-labelledby="report-task"><h2 id="report-task" className="section-title">Задача</h2><h3 className="mt-3 text-lg font-semibold">{session.title}</h3><p className="mt-3 whitespace-pre-wrap">{session.description}</p><p className="mt-3 text-sm text-slate-500">ID сессии: {session.id} · ID запуска: {run.id}</p></section>
    <section className="panel" aria-labelledby="report-scope"><h2 id="report-scope" className="section-title">Область проверки</h2><p className="mt-3 whitespace-pre-wrap">{plan.summary}</p><ol className="mt-3 list-decimal space-y-2 pl-5 wrap-break-word">{entries.map(({ check }) => <li key={check.id}>{check.id} · {check.title}</li>)}</ol></section>
    <section className="panel" aria-labelledby="report-period"><h2 id="report-period" className="section-title">Период</h2><p className="mt-3">Начало: <LocalDateTime value={run.startedAt} /></p><p>Завершение: <LocalDateTime value={run.completedAt!} /></p></section>
    <section className="panel" aria-labelledby="report-totals"><h2 id="report-totals" className="section-title">Итоги</h2><dl className="my-4 grid grid-cols-2 gap-4 sm:grid-cols-4">{[["Всего проверок", totals.total], ["Пройдено", totals.pass], ["Ошибок", totals.fail], ["Заблокировано", totals.blocked]].map(([label, value]) => <div key={label}><dt className="text-sm text-slate-600">{label}</dt><dd className="text-2xl font-semibold">{value}</dd></div>)}</dl><p>{report.conclusion}</p><p className="mt-3 text-sm text-slate-500">Заблокированные проверки не подтверждают работоспособность.</p></section>
    <section aria-labelledby="report-results"><h2 id="report-results" className="section-title">Результаты проверок</h2><ol className="mt-4 space-y-4">{entries.map((entry) => <ResultDetails key={entry.check.id} entry={entry} full />)}</ol></section>
    <section aria-labelledby="report-failures"><h2 id="report-failures" className="section-title">Ошибки</h2>{failures.length ? <ul className="mt-4 space-y-4">{failures.map((entry) => <ResultDetails key={entry.check.id} entry={entry} />)}</ul> : <p className="panel mt-4">Ошибки не зафиксированы.</p>}</section>
    <section aria-labelledby="report-blocked"><h2 id="report-blocked" className="section-title">Блокировки</h2>{blocked.length ? <ul className="mt-4 space-y-4">{blocked.map((entry) => <ResultDetails key={entry.check.id} entry={entry} />)}</ul> : <p className="panel mt-4">Блокировки не зафиксированы.</p>}</section>
    <section className="panel" aria-labelledby="report-context"><h2 id="report-context" className="section-title">Риски и вопросы из плана</h2><p className="my-3 text-sm text-slate-500">Контекст планирования: это не подтверждённые находки или решённые вопросы.</p><h3 className="font-semibold">Риски</h3>{plan.risks.length ? <ul className="my-3 list-disc pl-5 whitespace-pre-wrap wrap-break-word">{plan.risks.map((risk, index) => <li key={index}>{risk}</li>)}</ul> : <p className="my-3">Риски не указаны.</p>}<h3 className="font-semibold">Вопросы</h3>{plan.questions.length ? <ul className="mt-3 list-disc pl-5 whitespace-pre-wrap wrap-break-word">{plan.questions.map((question, index) => <li key={index}>{question}</li>)}</ul> : <p className="mt-3">Вопросы не указаны.</p>}</section>
    <section className="panel" aria-labelledby="report-origin"><h2 id="report-origin" className="section-title">Происхождение плана</h2><p className="my-3 wrap-break-word text-sm text-slate-600">Провайдер: {plan.metadata.provider} · Модель: {plan.metadata.model} · Версия схемы: {plan.metadata.schemaVersion} · Версия шаблона: {plan.metadata.promptVersion}</p><DemoNotice provider={plan.metadata.provider} /></section>
    <p className="text-sm text-slate-500">Отчёт отражает текущие сохранённые данные запуска. Он не является оценкой готовности релиза или полноты покрытия требований.</p>
    <CopyTestingReport text={formatTestingReport(report)} />
  </main>;
}
