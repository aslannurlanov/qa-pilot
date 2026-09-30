"use client";

import { CopyReportText } from "@/components/ui/copy-report-text";

export function CopyBugReport({ text }: { text: string }) {
  return <CopyReportText text={text} buttonLabel="Скопировать баг-репорт" successMessage="Баг-репорт скопирован"
    failureMessage="Не удалось скопировать. Выделите текст ниже и скопируйте вручную." textLabel="Текст баг-репорта" />;
}
