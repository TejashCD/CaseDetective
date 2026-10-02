import type * as z from "zod/v4";
import type { AskOptions, ModelClient } from "../../src/server/ai/model-client.ts";
import { AccusationSchema, CaseSchema, TalkSchema, type GeneratedCase, type TalkGrade } from "../../src/server/ai/schemas.ts";

export const SAMPLE_CASE: GeneratedCase = {
  title: "The Case of the Test Tube",
  place: "Oost",
  intro: "A lab burned down.",
  objective: "Find out why.",
  accusation_question: "What happened?",
  solution: "Combustion, oxidation and catalysis.",
  npcs: ["Combustion", "Oxidation", "Catalysis"].map((concept, i) => ({
    name: `Witness ${i + 1}`,
    role: "Chemist",
    location: `Street ${i + 1}`,
    sign: "laboratorium-extra-long",
    concept,
    greeting: "Hello.",
    challenge: `Explain ${concept}.`,
    reveal_condition: `Explains ${concept}.`,
    hint: "Think.",
    clue: `Clue ${i + 1}`,
    personality: "calm",
  })),
};

export function talkGrade(overrides: Partial<TalkGrade> = {}): TalkGrade {
  return {
    reply: "Hmm.",
    understanding: "none",
    suspicion_delta: 0,
    feedback_note: "",
    quick_replies: ["a", "b", "c", "d"],
    ...overrides,
  };
}

type Responder = (options: AskOptions<z.ZodType>) => unknown;

export interface FakeModelClient extends ModelClient {
  readonly calls: AskOptions<z.ZodType>[];
}

/** Records every call and answers with `respond`, or with sensible defaults. */
export function fakeAi(respond: Responder = defaultAnswer): FakeModelClient {
  const calls: AskOptions<z.ZodType>[] = [];
  return {
    model: "test-model",
    configured: true,
    calls,
    ask<S extends z.ZodType>(options: AskOptions<S>): Promise<z.infer<S>> {
      calls.push(options);
      try {
        return Promise.resolve(respond(options) as z.infer<S>);
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }
    },
  };
}

export function defaultAnswer({ schema }: AskOptions<z.ZodType>): unknown {
  if (schema === CaseSchema) return structuredClone(SAMPLE_CASE);
  if (schema === TalkSchema) return talkGrade();
  if (schema === AccusationSchema) return { verdict: "solved", feedback: "Well done.", missing: [] };
  throw new Error("Unexpected schema");
}

/** Answers talk calls from a queue and everything else with defaults. */
export function talkQueue(...grades: Partial<TalkGrade>[]): Responder {
  return (options) => (options.schema === TalkSchema ? talkGrade(grades.shift()) : defaultAnswer(options));
}

export const silentLogger = { warn() {}, error() {} };
