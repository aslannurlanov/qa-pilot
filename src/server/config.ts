import { resolve } from "node:path";
import { z } from "zod";
import { GenerationError } from "./ai/generation-errors";

export function getAIProviderMode(): "fake" | "openai" {
  const mode = process.env.AI_PROVIDER ?? "fake";
  if (mode !== "fake" && mode !== "openai") throw new GenerationError("configuration");
  return mode;
}

export function getProviderDisclosure(): "fake" | "openai" | "unavailable" {
  try { return getAIProviderMode(); } catch { return "unavailable"; }
}

export function getOpenAIConfig() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_MODEL?.trim();
  if (!apiKey || !model || model.length > 100) throw new GenerationError("configuration");
  return { apiKey, model };
}

const DatabaseUrlSchema = z.string().startsWith("file:").min(6);

export function getDatabaseUrl(): string {
  const url = DatabaseUrlSchema.parse(process.env.DATABASE_URL ?? "file:./data/qa-pilot.db");
  // Prisma CLI and the runtime adapter must resolve relative paths identically.
  return `file:${resolve(url.slice("file:".length)).replaceAll("\\", "/")}`;
}
