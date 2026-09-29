"use client";

import Link from "next/link";

export default function SessionError({ retry }: { retry: () => void }) {
  return (
    <main className="page-shell max-w-3xl">
      <div className="panel" role="alert">
        <h1 className="page-title">Не удалось загрузить проверку</h1>
        <p className="my-4 text-slate-600">Попробуйте ещё раз.</p>
        <div className="flex flex-wrap items-center gap-4">
          <button type="button" className="button-primary" onClick={retry}>Повторить попытку</button>
          <Link href="/" className="text-indigo-700 underline">На главную</Link>
        </div>
      </div>
    </main>
  );
}
