import Link from "next/link";

export default function SessionNotFound() {
  return (
    <main className="page-shell max-w-3xl">
      <h1 className="page-title">Проверка не найдена</h1>
      <p className="my-4 text-slate-600">Проверьте адрес или создайте новую проверку.</p>
      <Link href="/sessions/new" className="button-primary">Новая проверка</Link>
    </main>
  );
}
