import Link from "next/link";
import { notFound } from "next/navigation";
import { formatBugReport } from "@/domain/rules/format-bug-report";
import { CopyBugReport } from "@/features/bug-reports/copy-bug-report";
import { createDatabaseClient } from "@/server/db";
import { findBugReport } from "@/server/services/bug-reports";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const typeLabels = { positive: "Позитивный", negative: "Негативный", boundary: "Граничный", regression: "Регрессионный" } as const;

export default async function BugReportPage({ params }: { params: Promise<{ sessionId: string; resultId: string }> }) {
  const { sessionId, resultId } = await params;
  const db = createDatabaseClient();
  const data = await findBugReport(db, sessionId, resultId).finally(() => db.$disconnect());
  if (!data) notFound();
  const { report } = data;
  return <main className="page-shell max-w-4xl">
    <nav aria-label="Навигация по баг-репорту" className="flex flex-wrap gap-4 text-sm font-medium text-indigo-700">
      <Link href={`/sessions/${sessionId}/run`}>Результаты тестирования</Link>
      <Link href={`/sessions/${sessionId}`}>План тестирования</Link>
      <Link href="/">Главная</Link>
    </nav>
    <h1 className="page-title">Баг-репорт</h1>
    <p className="my-4 wrap-break-word text-sm text-slate-600">Задача: {data.taskTitle} · ID проверки: {data.checkId} · Тип: {typeLabels[data.checkType]}</p>
    <div className="panel space-y-6 wrap-break-word">
      <section aria-labelledby="bug-title"><h2 id="bug-title" className="section-title">Заголовок</h2><p className="mt-2">{report.title}</p></section>
      <section aria-labelledby="bug-preconditions"><h2 id="bug-preconditions" className="section-title">Предусловия</h2><p className="mt-2 whitespace-pre-wrap">{report.preconditions.length ? report.preconditions.join("\n") : "Не указаны."}</p></section>
      <section aria-labelledby="bug-steps"><h2 id="bug-steps" className="section-title">Шаги воспроизведения</h2><ol className="mt-2 list-decimal space-y-2 pl-5">{report.stepsToReproduce.map((step, index) => <li key={index} className="whitespace-pre-wrap">{step}</li>)}</ol></section>
      <section aria-labelledby="bug-data"><h2 id="bug-data" className="section-title">Тестовые данные</h2>{report.testData.length ? <ul className="mt-2 list-disc space-y-2 pl-5">{report.testData.map((item, index) => <li key={index} className="whitespace-pre-wrap">{item}</li>)}</ul> : <p className="mt-2">Не указаны.</p>}</section>
      <section aria-labelledby="bug-actual"><h2 id="bug-actual" className="section-title">Фактический результат</h2><p className="mt-2 whitespace-pre-wrap">{report.actualResult}</p></section>
      <section aria-labelledby="bug-expected"><h2 id="bug-expected" className="section-title">Ожидаемый результат</h2><p className="mt-2 whitespace-pre-wrap">{report.expectedResult}</p></section>
      <section aria-labelledby="bug-extra"><h2 id="bug-extra" className="section-title">Дополнительная информация</h2><p className="mt-2 whitespace-pre-wrap">{report.comment ?? "Не указана."}</p></section>
    </div>
    <CopyBugReport text={formatBugReport(report)} />
  </main>;
}
