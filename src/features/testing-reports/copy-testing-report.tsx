"use client";

import { CopyReportText } from "@/components/ui/copy-report-text";

export function CopyTestingReport({ text }: { text: string }) {
  return <CopyReportText text={text} buttonLabel="Скопировать отчёт" successMessage="Отчёт скопирован"
    failureMessage="Не удалось скопировать. Выделите текст ниже и скопируйте вручную." textLabel="Текст отчёта" />;
}
