import path from "node:path";
import { fileURLToPath } from "node:url";
import { EFFORTS, type Effort } from "./ai/model-client.ts";

// Same depth from src/server and dist/server.
export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const STATIC_DIRS = [path.join(ROOT_DIR, "public"), path.join(ROOT_DIR, "dist/web")];

export interface Config {
  port: number;
  model: string;
  talkEffort: Effort;
  apiKey: string;
}

const DEFAULTS = {
  port: 3000,
  model: "claude-opus-5-5",
  talkEffort: "low",
} as const;

export function loadEnvFile(file = path.join(ROOT_DIR, ".env")): void {
  try {
    process.loadEnvFile(file);
  } catch {
    // No .env file; use the real environment.
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Readonly<Config> {
  return Object.freeze({
    port: parsePort(env.PORT),
    model: env.MODEL_ID?.trim() || DEFAULTS.model,
    talkEffort: parseEffort(env.TALK_EFFORT),
    apiKey: env.ANTHROPIC_API_KEY?.trim() || "",
  });
}

function parsePort(value: string | undefined): number {
  if (value === undefined || value === "") return DEFAULTS.port;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`PORT must be an integer between 0 and 65535, got "${value}".`);
  }
  return port;
}

function parseEffort(value: string | undefined): Effort {
  const effort = value?.trim() || DEFAULTS.talkEffort;
  if (!EFFORTS.includes(effort as Effort)) {
    throw new Error(`TALK_EFFORT must be one of ${EFFORTS.join(", ")}, got "${effort}".`);
  }
  return effort as Effort;
}
