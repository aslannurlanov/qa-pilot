import Link from "next/link";
import { DemoNotice } from "@/components/ui/demo-notice";
import { LocalDateTime } from "@/components/ui/local-date-time";
import { createDatabaseClient } from "@/server/db";
import { listTestSessions } from "@/server/repositories/test-sessions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const statusLabels = {
  IDLE: "Ожидает анализа",
  RUNNING: "Анализируется",
  SUCCEEDED: "Готово",
  FAILED: "Ошибка анализа",
} as const;

export default async function HomePage() {
  const db = createDatabaseClient();
  const sessions = await listTestSessions(db).finally(() => db.$disconnect());
  return (
    <main className="page-shell">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="eyebrow">QA Pilot · Версия 0.1</p>
          <h1 className="page-title">Что именно нужно протестировать?</h1>
          <p className="mt-3 text-lg text-slate-600">Превратите задачу или требование в структурированный план ручного тестирования.</p>
        </div>
        <Link href="/sessions/new" className="button-primary">Новая проверка</Link>
      </div>
      <div className="mt-8"><DemoNotice /></div>
      <section className="mt-10" aria-labelledby="sessions-title">
        <h2 id="sessions-title" className="section-title">Сохранённые проверки</h2>
        {sessions.length === 0 ? (
          <div className="panel mt-4">
            <h3 className="text-lg font-semibold">Проверок пока нет</h3>
            <p className="mt-2 text-slate-600">Создайте проверку: задача и план сохранятся здесь, чтобы к ним можно было вернуться.</p>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {sessions.map((session) => (
              <li key={session.id}>
                <Link href={`/sessions/${session.id}`} className="block rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-indigo-400 focus-visible:outline-2 focus-visible:outline-indigo-600 sm:p-6" aria-label={`Открыть проверку: ${session.title}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h3 className="text-lg font-semibold text-slate-900">{session.title}</h3>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${session.generationStatus === "SUCCEEDED" ? "bg-emerald-50 text-emerald-800" : session.generationStatus === "FAILED" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}>
                      {statusLabels[session.generationStatus]}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">Создана: <LocalDateTime value={session.createdAt} /></p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
