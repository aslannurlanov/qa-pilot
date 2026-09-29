import { randomUUID } from "node:crypto";
import { DemoNotice } from "@/components/ui/demo-notice";
import { TaskForm } from "@/features/test-sessions/task-form";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function NewSessionPage() {
  return (
    <main className="page-shell max-w-3xl">
      <p className="eyebrow">01 / Задача</p>
      <h1 className="page-title">Новая проверка</h1>
      <p className="mb-6 mt-3 text-slate-600">Укажите название задачи и опишите, что необходимо протестировать.</p>
      <DemoNotice />
      <div className="mt-6"><TaskForm sessionId={randomUUID()} /></div>
    </main>
  );
}
