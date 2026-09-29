"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

function formatLocalDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

export function LocalDateTime({ value }: { value: string }) {
  // Server rendering has no access to the visitor's timezone.
  const formatted = useSyncExternalStore(subscribe, () => formatLocalDate(value), () => "Загрузка даты…");
  return <time dateTime={value}>{formatted}</time>;
}
