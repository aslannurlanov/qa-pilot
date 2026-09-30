"use client";

import { useEffect, useId, useState } from "react";

export function CopyReportText({ text, buttonLabel, successMessage, failureMessage, textLabel }: {
  text: string; buttonLabel: string; successMessage: string; failureMessage: string; textLabel: string;
}) {
  const [status, setStatus] = useState<"idle" | "copying" | "copied" | "failed">("idle");
  const textId = useId();
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
    <button type="button" onClick={copy} disabled={status === "copying"} className="button-primary">{buttonLabel}</button>
    <p role="status" className="mt-2 text-sm text-slate-600">{status === "copied" ? successMessage : status === "failed" ? failureMessage : ""}</p>
    {status === "failed" && <div className="mt-3"><label htmlFor={textId} className="text-sm font-semibold">{textLabel}</label><textarea id={textId} readOnly value={text} rows={12} className="field mt-2" /></div>}
  </div>;
}
