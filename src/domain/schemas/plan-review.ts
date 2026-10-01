import { z } from "zod";
import { IdSchema } from "./common";
import { CheckContentSchema } from "./plan";

export const UpdateCheckSchema = z.strictObject({ sessionId: IdSchema, checkId: IdSchema, content: CheckContentSchema });
export const AddManualCheckSchema = z.strictObject({ sessionId: IdSchema, content: CheckContentSchema });
export const SetCheckExcludedSchema = z.strictObject({ sessionId: IdSchema, checkId: IdSchema, excluded: z.boolean() });

export const reviewMessages = {
  validation: "Проверьте выделенные поля.",
  limit: "В плане уже 20 проверок, включая исключённые. Новую проверку добавить нельзя.",
  frozen: "Тестирование уже начато. План зафиксирован; изменения недоступны.",
  "not-found": "Проверка не найдена в этом плане. Обновите страницу.",
  "missing-plan": "План не найден. Вернитесь на главную.",
  "empty-scope": "В плане нет проверок для выполнения. Верните или добавьте хотя бы одну проверку.",
  busy: "Не удалось сохранить изменения из-за одновременной операции. Обновите страницу и попробуйте ещё раз.",
  unavailable: "Не удалось сохранить изменения. Попробуйте позже.",
} as const;
