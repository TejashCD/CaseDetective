import crypto from "node:crypto";
import { createModelClient, type ModelClient } from "./ai/model-client.ts";
import type { Config } from "./config.ts";
import { CaseSealer } from "./game/case-sealer.ts";
import { Game } from "./game/engine.ts";

export interface Services {
  ai: ModelClient;
  game: Game;
}

/** Wires up the model client and game. Shared by the standalone server and the Vercel function. */
export function createServices(config: Config, logger: Pick<Console, "warn"> = console): Services {
  const ai = createModelClient({ apiKey: config.apiKey, model: config.model, logger });
  const game = new Game({ ai, sealer: new CaseSealer(caseSecret(config, logger)), talkEffort: config.talkEffort, logger });
  return { ai, game };
}

function caseSecret({ caseSecret, apiKey }: Config, logger: Pick<Console, "warn">): string {
  if (caseSecret) return caseSecret;
  if (apiKey) return apiKey;
  // Only for local demo play without any keys: tokens stop working after a restart.
  logger.warn("Neither CASE_SECRET nor ANTHROPIC_API_KEY is set; cases won't survive a restart.");
  return crypto.randomBytes(32).toString("hex");
}
