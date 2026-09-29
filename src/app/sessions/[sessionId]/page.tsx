import Link from "next/link";
import { notFound } from "next/navigation";
import { DemoNotice } from "@/components/ui/demo-notice";
import { PlanReview } from "@/features/test-sessions/plan-review";
import { RetryForm } from "@/features/test-sessions/retry-form";
import { createDatabaseClient } from "@/server/db";
import { findSessionReview } from "@/server/repositories/test-sessions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function SessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const db = createDatabaseClient();
  const review = await findSessionReview(db, sessionId).finally(() => db.$disconnect());
  if (!review) notFound();

  return (
    <main className="page-shell">
      <Link href="/" className="text-sm font-medium text-indigo-700 hover:underline">← На главную</Link>
      <p className="eyebrow mt-6">Проверка</p>
      <h1 className="page-title">План тестирования</h1>
      <p className="mb-6 mt-3 text-slate-600">Изучите задачу, риски, вопросы и причины включения каждой проверки.</p>
      <DemoNotice />
      <section className="panel my-6" aria-labelledby="saved-task-title">
        <p className="eyebrow">Исходная задача</p>
        <h2 id="saved-task-title" className="mt-2 text-xl font-semibold">{review.session.title}</h2>
        <p className="mt-3 whitespace-pre-wrap wrap-break-word text-slate-600">{review.session.description}</p>
      </section>
      {review.session.generationStatus === "SUCCEEDED" && review.plan ? (
        <PlanReview plan={review.plan} />
      ) : review.session.generationStatus === "FAILED" ? (
        <section className="panel" aria-labelledby="generation-failed-title">
          <h2 id="generation-failed-title" className="section-title">Ошибка анализа</h2>
          <p className="mt-3 text-slate-600">Не удалось создать корректный план. Задача сохранена, а неполный план не записан.</p>
          <RetryForm sessionId={review.session.id} />
        </section>
      ) : (
        <section className="panel" role="status">
          <h2 className="section-title">Анализируется</h2>
          <p className="mt-3 text-slate-600">Анализ ещё идёт. Обновите страницу, чтобы проверить состояние.</p>
        </section>
      )}
    </main>
  );
}
