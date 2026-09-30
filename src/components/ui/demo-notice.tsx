export function DemoNotice({ provider = "fake" }: { provider?: string }) {
  if (provider === "openai") return (
    <aside className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm leading-6 text-indigo-950" aria-label="AI-анализ">
      План создаётся с помощью AI на основе названия и описания задачи. Перед тестированием проверьте требования, вопросы и предположения.
    </aside>
  );
  if (provider !== "fake") return (
    <aside className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950" aria-label="Настройка анализа">
      Режим анализа не настроен. Обратитесь к администратору.
    </aside>
  );
  return (
    <aside className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950" aria-label="Демонстрационный анализ">
      <strong>Демонстрационный режим.</strong> Сейчас для любой задачи используется один пример плана проверки имени пользователя.
      Проверки пока не создаются на основе вашего описания, но сама задача сохраняется.
    </aside>
  );
}
