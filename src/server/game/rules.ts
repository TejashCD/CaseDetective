import { LIMITS } from "../../shared/limits.ts";
import type { Effort } from "../ai/model-client.ts";

export { LIMITS, WITNESS_COUNT } from "../../shared/limits.ts";

export const WITNESS_COLORS = ["#c2416b", "#3b6ea5", "#5f8a35"] as const;
export const MAX_SIGN_LENGTH = 12;

export const SUSPICION = {
  start: 15,
  max: 100,
  /** Largest increase from a single answer. */
  maxPenalty: 15,
  /** Where the meter resets after a witness throws the player out. */
  afterEjection: 60,
} as const;

/** Past exchanges with a witness sent back to the model as context. */
export const HISTORY_WINDOW = 10;
export const QUICK_REPLY_COUNT = 3;
/** Review notes kept per case. Keeps the case token small. */
export const MAX_NOTES = 30;

export const EFFORT = {
  createCase: "medium",
  accuse: "medium",
} as const satisfies Record<string, Effort>;

export function tooMuchText(): string {
  return `That's too much text. Trim it under ${LIMITS.materialMax.toLocaleString("en-US")} characters.`;
}
