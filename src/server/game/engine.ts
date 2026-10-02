import type { AccuseResponse, CaseReport, CaseView, TalkResponse } from "../../shared/api.ts";
import { MalformedOutputError } from "../ai/errors.ts";
import type { Effort, ModelClient } from "../ai/model-client.ts";
import { accusationPrompt, ACCUSATION_SYSTEM, CASE_SYSTEM, casePrompt, talkPrompt, talkSystem } from "../ai/prompts.ts";
import { AccusationSchema, CaseSchema, TalkSchema } from "../ai/schemas.ts";
import type { CaseStore } from "./case-store.ts";
import { DEMO_CASE } from "./demo-case.ts";
import { ActionNotAllowedError, CaseNotFoundError, InputTooLargeError, InvalidInputError } from "./errors.ts";
import { gradeAccusationOffline, gradeTalkOffline } from "./offline-grader.ts";
import {
  EFFORT,
  HISTORY_WINDOW,
  LIMITS,
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
  store: CaseStore;
  talkEffort: Effort;
  logger?: Pick<Console, "warn">;
}

export class Game {
  readonly #ai: ModelClient;
  readonly #store: CaseStore;
  readonly #talkEffort: Effort;
  readonly #logger: Pick<Console, "warn">;

  constructor({ ai, store, talkEffort, logger = console }: GameOptions) {
    this.#ai = ai;
    this.#store = store;
    this.#talkEffort = talkEffort;
    this.#logger = logger;
  }

  startDemo(): CaseView {
    return this.#addCase(DEMO_CASE, true);
  }

  async startCase(input: unknown): Promise<CaseView> {
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
    return this.#addCase(generated, false);
  }

  getCase(id: string): CaseView {
    return toCaseView(this.#record(id));
  }

  getReport(id: string): CaseReport {
    return toCaseReport(this.#record(id));
  }

  async talk(id: string, witnessIndex: unknown, input: unknown): Promise<TalkResponse> {
    const record = this.#record(id);
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
          user: talkPrompt({ witness, clueEarned: alreadyEarned, history: history.slice(-HISTORY_WINDOW), text }),
          effort: this.#talkEffort,
        }),
      () => gradeTalkOffline(witness, text),
    );

    const delta = alreadyEarned ? 0 : clamp(Math.trunc(result.suspicion_delta) || 0, 0, SUSPICION.maxPenalty);
    history.push({ student: text, npc: result.reply });
    progress.suspicion = Math.min(SUSPICION.max, progress.suspicion + delta);

    const clueEarned = !alreadyEarned && result.understanding === "full";
    if (clueEarned) progress.clues[index] = true;
    if (result.understanding !== "full" && result.feedback_note) {
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
    };
  }

  async accuse(id: string, input: unknown): Promise<AccuseResponse> {
    const record = this.#record(id);
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
    };
  }

  #addCase(generated: CaseDraft, demo: boolean): CaseView {
    const record = this.#store.add({ caseFile: normalizeCase(generated), progress: newProgress(), demo });
    return toCaseView(record);
  }

  #record(id: string): CaseRecord {
    const record = this.#store.get(id);
    if (!record) throw new CaseNotFoundError();
    return record;
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

function normalizeCase(generated: CaseDraft): CaseFile {
  const npcs: CaseWitness[] = generated.npcs.slice(0, WITNESS_COUNT).map((w, i) => ({
    ...w,
    color: WITNESS_COLORS[i] ?? WITNESS_COLORS[0],
    sign: w.sign.toUpperCase().slice(0, MAX_SIGN_LENGTH),
  }));
  return { ...generated, npcs };
}

function newProgress(): CaseProgress {
  return {
    clues: Array<boolean>(WITNESS_COUNT).fill(false),
    suspicion: SUSPICION.start,
    notes: [],
    history: Array.from({ length: WITNESS_COUNT }, () => []),
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
