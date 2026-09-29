import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "QA Pilot",
  description: "Помощник для планирования ручного тестирования",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <header className="border-b border-slate-200 bg-white">
          <nav aria-label="Основная навигация" className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
            <Link href="/" className="text-xl font-bold tracking-tight text-indigo-700">QA Pilot</Link>
            <div className="flex items-center gap-6 text-sm font-medium">
              <Link href="/" className="text-slate-600 hover:text-indigo-700">Главная</Link>
              <Link href="/sessions/new" className="text-indigo-700 hover:underline">Новая проверка</Link>
            </div>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
