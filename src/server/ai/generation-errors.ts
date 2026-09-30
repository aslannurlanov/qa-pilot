export const generationMessages = {
  configuration: "Для AI-анализа не настроен доступ. Обратитесь к администратору.",
  timeout: "Анализ занял слишком много времени. Задача сохранена — можно повторить попытку.",
  network: "Не удалось связаться с AI-сервисом. Попробуйте позже.",
  rate_limit: "AI-сервис временно ограничил запросы. Попробуйте позже.",
  server: "AI-сервис временно недоступен. Попробуйте позже.",
  refusal: "AI-сервис не смог сформировать план по этой задаче. Уточните описание.",
  incomplete: "AI-сервис вернул неполный план. Задача сохранена — можно повторить попытку.",
  invalid_output: "Не удалось получить корректный план. Задача сохранена, неполный план не записан.",
} as const;

export type GenerationErrorCode = keyof typeof generationMessages;

// Never retain the vendor error, payload, or credentials in a browser-facing error.
export class GenerationError extends Error {
  constructor(public readonly code: GenerationErrorCode) {
    super(generationMessages[code]);
    this.name = "GenerationError";
  }
}

export function generationErrorCode(error: unknown): GenerationErrorCode {
  return error instanceof GenerationError ? error.code : "invalid_output";
}

export function generationMessage(code: unknown): string | undefined {
  return typeof code === "string" && Object.hasOwn(generationMessages, code)
    ? generationMessages[code as GenerationErrorCode] : undefined;
}
