// Structured output schemas. The descriptions are sent to the model as instructions.
import * as z from "zod/v4";

export const WitnessSchema = z.object({
  name: z.string().describe("Dutch first name or title + surname"),
  role: z.string().describe("Their job, 1-3 words, e.g. 'Flower seller'"),
  location: z.string().describe("A real-sounding Amsterdam street or place"),
  sign: z.string().describe("Shop sign over their door, 1-2 words, max 12 characters, uppercase"),
  concept: z.string().describe("The study concept this character guards, 2-5 words"),
  greeting: z.string().describe("In-character opening line, max 25 words, sets the mood"),
  challenge: z.string().describe("A question the student must answer to prove they understand the concept"),
  reveal_condition: z.string().describe("Hidden: exactly what a correct answer must show"),
  hint: z.string().describe("A nudge that points the way without giving the answer"),
  clue: z.string().describe("Short evidence text handed over when earned, e.g. 'Ledger: buyers fled when prices peaked'"),
  personality: z.string().describe("2-4 words of voice and manner"),
});

export const CaseSchema = z.object({
  title: z.string().describe("'The Case of the ...'"),
  place: z.string().describe("District of Amsterdam where the case happens"),
  intro: z.string().describe("One atmospheric sentence, max 30 words"),
  objective: z.string().describe("What the detective must do, max 18 words"),
  accusation_question: z.string().describe("Final synthesis question requiring all three concepts"),
  solution: z.string().describe("Hidden model answer that combines all three concepts"),
  npcs: z.array(WitnessSchema).describe("Exactly three witnesses, one per core concept"),
});

export const TalkSchema = z.object({
  reply: z.string(),
  understanding: z.enum(["none", "partial", "full"]),
  suspicion_delta: z.number().int(),
  feedback_note: z.string(),
  quick_replies: z.array(z.string()),
});

export const AccusationSchema = z.object({
  verdict: z.enum(["solved", "partial", "no"]),
  feedback: z.string(),
  missing: z.array(z.string()),
});

export type GeneratedCase = z.infer<typeof CaseSchema>;
export type GeneratedWitness = z.infer<typeof WitnessSchema>;
export type TalkGrade = z.infer<typeof TalkSchema>;
export type AccusationGrade = z.infer<typeof AccusationSchema>;
