"use client";

import { useEffect, useState } from "react";

export function CopyBugReport({ text }: { text: string }) {
  const [status, setStatus] = useState<"idle" | "copying" | "copied" | "failed">("idle");
  useEffect(() => {
    if (status !== "copied") return;
    const timer = setTimeout(() => setStatus("idle"), 3000);
    return () => clearTimeout(timer);
  }, [status]);
  async function copy() {
    setStatus("copying");
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  }
  return <div className="mt-6">
    <button type="button" onClick={copy} disabled={status === "copying"} className="button-primary">Скопировать баг-репорт</button>
    <p role="status" className="mt-2 text-sm text-slate-600">{status === "copied" ? "Баг-репорт скопирован" : status === "failed" ? "Не удалось скопировать. Выделите текст ниже и скопируйте вручную." : ""}</p>
    {status === "failed" && <div className="mt-3"><label htmlFor="copy-report-text" className="text-sm font-semibold">Текст баг-репорта</label><textarea id="copy-report-text" readOnly value={text} rows={12} className="field mt-2" /></div>}
  </div>;
}
