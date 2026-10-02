import crypto from "node:crypto";
import type { AccuseResponse, CaseReport, CaseStarted, CaseView, TalkResponse } from "../../shared/api.ts";
import { MalformedOutputError } from "../ai/errors.ts";
import type { Effort, ModelClient } from "../ai/model-client.ts";
import { accusationPrompt, ACCUSATION_SYSTEM, CASE_SYSTEM, casePrompt, talkPrompt, talkSystem } from "../ai/prompts.ts";
import { AccusationSchema, CaseSchema, TalkSchema } from "../ai/schemas.ts";
import type { CaseSealer } from "./case-sealer.ts";
import { DEMO_CASE } from "./demo-case.ts";
import { ActionNotAllowedError, InputTooLargeError, InvalidInputError } from "./errors.ts";
import { gradeAccusationOffline, gradeTalkOffline } from "./offline-grader.ts";
import {
  EFFORT,
  HISTORY_WINDOW,
  LIMITS,
  MAX_NOTES,
  MAX_SIGN_LENGTH,
  QUICK_REPLY_COUNT,
  SUSPICION,
  tooMuchText,
  WITNESS_COLORS,
  WITNESS_COUNT,
} from "./rules.ts";
import type { CaseDraft, CaseFile, CaseProgress, CaseRecord, CaseWitness } from "./types.ts";
import { toCaseReport, toCaseState, toCaseView } from "./views.ts";

const DEFAULT_QUICK_REPLIES = ["Can I have a hint?", "Explain it another way.", "Let me try again."];

interface GameOptions {
  ai: ModelClient;
  sealer: CaseSealer;
  talkEffort: Effort;
  logger?: Pick<Console, "warn">;
  now?: () => number;
}

/**
 * Game rules. Stateless: every method takes the case token from the client, and every
 * change to the case comes back as a new token.
 */
export class Game {
  readonly #ai: ModelClient;
  readonly #sealer: CaseSealer;
  readonly #talkEffort: Effort;
  readonly #logger: Pick<Console, "warn">;
  readonly #now: () => number;

  constructor({ ai, sealer, talkEffort, logger = console, now = Date.now }: GameOptions) {
    this.#ai = ai;
    this.#sealer = sealer;
    this.#talkEffort = talkEffort;
    this.#logger = logger;
    this.#now = now;
  }

  startDemo(): CaseStarted {
    return this.#newCase(DEMO_CASE, true);
  }

  async startCase(input: unknown): Promise<CaseStarted> {
    const material = textInput(input);
    if (material.length < LIMITS.materialMin) throw new InvalidInputError("Paste some notes or name a topic first.");
    if (material.length > LIMITS.materialMax) throw new InputTooLargeError(tooMuchText());

    const generated = await this.#ai.ask({
      schema: CaseSchema,
      system: CASE_SYSTEM,
      user: casePrompt(material),
      effort: EFFORT.createCase,
      validate: (value) => {
        if (value.npcs.length < WITNESS_COUNT) {
          throw new MalformedOutputError(`expected ${WITNESS_COUNT} witnesses, got ${value.npcs.length}`);
        }
      },
    });
    return this.#newCase(generated, false);
  }

  getCase(token: unknown): CaseView {
    return toCaseView(this.#sealer.open(token));
  }

  getReport(token: unknown): CaseReport {
    return toCaseReport(this.#sealer.open(token));
  }

  async talk(token: unknown, witnessIndex: unknown, input: unknown): Promise<TalkResponse> {
    const record = this.#sealer.open(token);
    const index = Number(witnessIndex);
    const text = textInput(input).slice(0, LIMITS.talkMax);
    const { caseFile, progress } = record;
    const witness = caseFile.npcs[index];
    const history = progress.history[index];
    if (!Number.isInteger(index) || !witness || !history) throw new InvalidInputError("Unknown witness.");
    if (!text) throw new InvalidInputError("Say something first.");

    const alreadyEarned = progress.clues[index] === true;
    const { result, offline } = await this.#withDemoFallback(
      record,
      () =>
        this.#ai.ask({
          schema: TalkSchema,
          system: talkSystem(caseFile),
          user: talkPrompt({ witness, clueEarned: alreadyEarned, history, text }),
          effort: this.#talkEffort,
        }),
      () => gradeTalkOffline(witness, text),
    );

    const delta = alreadyEarned ? 0 : clamp(Math.trunc(result.suspicion_delta) || 0, 0, SUSPICION.maxPenalty);
    history.push({ student: text, npc: result.reply });
    if (history.length > HISTORY_WINDOW) history.splice(0, history.length - HISTORY_WINDOW);
    progress.exchanges[index] = (progress.exchanges[index] ?? 0) + 1;
    progress.suspicion = Math.min(SUSPICION.max, progress.suspicion + delta);

    const clueEarned = !alreadyEarned && result.understanding === "full";
    if (clueEarned) progress.clues[index] = true;
    if (result.understanding !== "full" && result.feedback_note && progress.notes.length < MAX_NOTES) {
      progress.notes.push({ concept: witness.concept, note: result.feedback_note });
    }

    const ejected = progress.suspicion >= SUSPICION.max;
    if (ejected) {
      progress.ejections++;
      progress.suspicion = SUSPICION.afterEjection;
    }

    const quickReplies = result.quick_replies.slice(0, QUICK_REPLY_COUNT);
    return {
      reply: result.reply,
      understanding: result.understanding,
      suspicionDelta: delta,
      quickReplies: quickReplies.length > 0 ? quickReplies : [...DEFAULT_QUICK_REPLIES],
      clue: clueEarned ? witness.clue : null,
      ejected,
      offline,
      state: toCaseState(progress),
      token: this.#sealer.seal(record),
    };
  }

  async accuse(token: unknown, input: unknown): Promise<AccuseResponse> {
    const record = this.#sealer.open(token);
    const { caseFile, progress } = record;
    if (!progress.clues.every(Boolean)) {
      throw new ActionNotAllowedError("You need all three clues before the inspector will listen.");
    }
    const text = textInput(input).slice(0, LIMITS.accusationMax);
    if (text.length < LIMITS.accusationMin) throw new InvalidInputError("Make your case in a few sentences.");

    progress.attempts++;
    const { result, offline } = await this.#withDemoFallback(
      record,
      () =>
        this.#ai.ask({
          schema: AccusationSchema,
          system: ACCUSATION_SYSTEM,
          user: accusationPrompt(caseFile, text),
          effort: EFFORT.accuse,
        }),
      () => gradeAccusationOffline(caseFile.npcs, text),
    );

    if (result.verdict === "solved") progress.verdict = "solved";
    progress.feedback = result.feedback;
    return {
      verdict: result.verdict,
      feedback: result.feedback,
      missing: result.missing,
      offline,
      state: toCaseState(progress),
      token: this.#sealer.seal(record),
    };
  }

  #newCase(draft: CaseDraft, demo: boolean): CaseStarted {
    const record: CaseRecord = {
      id: crypto.randomUUID(),
      demo,
      caseFile: normalizeCase(draft),
      progress: newProgress(),
      createdAt: this.#now(),
    };
    return { case: toCaseView(record), token: this.#sealer.seal(record) };
  }

  /** The demo case falls back to offline grading so it stays playable without a key or connection. */
  async #withDemoFallback<T>(record: CaseRecord, call: () => Promise<T>, offline: () => T): Promise<{ result: T; offline: boolean }> {
    try {
      return { result: await call(), offline: false };
    } catch (error) {
      if (!record.demo) throw error;
      const reason = error instanceof Error ? error.message : "unknown error";
      this.#logger.warn(`AI service unavailable, using offline grading for the demo: ${reason}`);
      return { result: offline(), offline: true };
    }
  }
}

function normalizeCase(draft: CaseDraft): CaseFile {
  const npcs: CaseWitness[] = draft.npcs.slice(0, WITNESS_COUNT).map((w, i) => ({
    ...w,
    color: WITNESS_COLORS[i] ?? WITNESS_COLORS[0],
    sign: w.sign.toUpperCase().slice(0, MAX_SIGN_LENGTH),
  }));
  return { ...draft, npcs };
}

function newProgress(): CaseProgress {
  return {
    clues: Array<boolean>(WITNESS_COUNT).fill(false),
    suspicion: SUSPICION.start,
    notes: [],
    history: Array.from({ length: WITNESS_COUNT }, () => []),
    exchanges: Array<number>(WITNESS_COUNT).fill(0),
    attempts: 0,
    verdict: null,
    feedback: "",
    ejections: 0,
  };
}

/** Request bodies are untrusted JSON; anything but a string counts as empty. */
function textInput(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
