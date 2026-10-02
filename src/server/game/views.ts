// Everything the browser receives is built here. Hidden fields (solution, reveal
// conditions, unearned clues, keywords) must never be added to these views.
import type { CaseReport, CaseState, CaseView, ReviewNote } from "../../shared/api.ts";
import type { CaseProgress, CaseRecord } from "./types.ts";

export function toCaseState(progress: CaseProgress): CaseState {
  return {
    clues: [...progress.clues],
    suspicion: progress.suspicion,
    verdict: progress.verdict,
    attempts: progress.attempts,
  };
}

export function toCaseView({ id, demo, caseFile, progress }: CaseRecord): CaseView {
  return {
    id,
    demo,
    title: caseFile.title,
    place: caseFile.place,
    intro: caseFile.intro,
    objective: caseFile.objective,
    accusationQuestion: caseFile.accusation_question,
    npcs: caseFile.npcs.map((w, i) => ({
      name: w.name,
      role: w.role,
      location: w.location,
      sign: w.sign,
      concept: w.concept,
      greeting: w.greeting,
      challenge: w.challenge,
      color: w.color,
      clue: progress.clues[i] ? w.clue : null,
    })),
    state: toCaseState(progress),
  };
}

/** Includes the solution: only requested once the player solves the case or gives up. */
export function toCaseReport({ caseFile, progress }: CaseRecord): CaseReport {
  return {
    title: caseFile.title,
    place: caseFile.place,
    verdict: progress.verdict,
    feedback: progress.feedback,
    attempts: progress.attempts,
    suspicion: progress.suspicion,
    ejections: progress.ejections,
    solution: caseFile.solution,
    concepts: caseFile.npcs.map((w, i) => ({
      concept: w.concept,
      witness: w.name,
      earned: progress.clues[i] ?? false,
      clue: w.clue,
      challenge: w.challenge,
      exchanges: progress.history[i]?.length ?? 0,
    })),
    notes: uniqueNotes(progress.notes),
  };
}

function uniqueNotes(notes: ReviewNote[]): ReviewNote[] {
  const seen = new Set<string>();
  return notes.filter(({ concept, note }) => {
    const key = `${concept}\u0000${note}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
