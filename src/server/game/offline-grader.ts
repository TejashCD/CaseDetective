// Keyword grading for the demo case when the AI service is unreachable.
// Keeps the demo playable offline; it is not meant to match the model.
import type { AccusationGrade, TalkGrade } from "../ai/schemas.ts";
import type { CaseWitness } from "./types.ts";

const QUICK_REPLIES = ["Can I have a hint?", "Let me try again.", "Explain it another way."];
/** Answers longer than this count as a real attempt even without a keyword. */
const EFFORTFUL_LENGTH = 25;
const CARELESS_PENALTY = 8;

function mentionsConcept(witness: CaseWitness, text: string): boolean {
  return (witness.keywords ?? []).some((keyword) => text.includes(keyword));
}

export function gradeTalkOffline(witness: CaseWitness, answer: string): TalkGrade {
  const text = answer.toLowerCase();
  const hit = mentionsConcept(witness, text);
  const asking = /hint|help|explain|\?/.test(text);
  const effortful = text.length > EFFORTFUL_LENGTH;

  return {
    reply: hit ? `That's it exactly. Here, take this: ${witness.clue}.` : `Not quite. Think about it this way: ${witness.hint}`,
    understanding: hit ? "full" : effortful ? "partial" : "none",
    suspicion_delta: hit || asking || effortful ? 0 : CARELESS_PENALTY,
    feedback_note: hit ? "" : `Review ${witness.concept.toLowerCase()}: ${witness.hint}`,
    quick_replies: [...QUICK_REPLIES],
  };
}

export function gradeAccusationOffline(witnesses: CaseWitness[], explanation: string): AccusationGrade {
  const text = explanation.toLowerCase();
  const covered = witnesses.filter((w) => mentionsConcept(w, text));
  const missing = witnesses.filter((w) => !covered.includes(w)).map((w) => w.concept);
  const solved = missing.length === 0;

  return {
    verdict: solved ? "solved" : covered.length === witnesses.length - 1 ? "partial" : "no",
    feedback: solved
      ? "You tied all three concepts together. Case closed."
      : `Close, but your story has holes. Bring in: ${missing.join(", ")}.`,
    missing,
  };
}
