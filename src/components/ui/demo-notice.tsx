export function DemoNotice({ provider = "fake" }: { provider?: string }) {
  if (provider === "openai") return (
    <aside className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm leading-6 text-indigo-950" aria-label="AI-анализ">
      Исходный план создаётся с помощью OpenAI: название и описание задачи передаются внешнему сервису; запрос расходует средства API. Перед тестированием проверьте требования, вопросы и предположения.
    </aside>
  );
  if (provider !== "fake") return (
    <aside className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950" aria-label="Настройка анализа">
      Режим анализа не настроен. Обратитесь к администратору.
    </aside>
  );
  return (
    <aside className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950" aria-label="Демонстрационный анализ">
      <strong>Демонстрационный режим.</strong> Исходный план для любой задачи — один пример проверки имени пользователя.
      Демонстрационные проверки не создаются на основе вашего описания. Правки и добавленные проверки QA сохраняются отдельно от происхождения исходного плана.
    </aside>
  );
}
