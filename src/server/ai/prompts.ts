import type { CaseFile, Exchange, CaseWitness } from "../game/types.ts";

const MAX_REPLY_WORDS = 70;

export const CASE_SYSTEM = `You design cases for CaseDetective, a serious detective game that teaches a student their own study material.
The game is set at night in Amsterdam: canals, rain, lamplight. The tone is grounded noir, never silly.
Pick the three most important concepts in the material. Each concept is guarded by one witness whose job fits the setting.
The case's mystery must be explained by combining all three concepts, so the final accusation works like an exam question.
Challenges must test understanding, not recall of a definition. Keep every fact accurate to the material.`;

export const ACCUSATION_SYSTEM = `You are the chief inspector in CaseDetective, a detective game that teaches study material. You grade the detective's final explanation like a fair, demanding examiner.`;

export function casePrompt(material: string): string {
  return `Build a case from this study material.\n\n<material>\n${material}\n</material>`;
}

/** Stable for the whole case, so it gets prompt-cached. */
export function talkSystem(caseFile: CaseFile): string {
  const hidden = {
    title: caseFile.title,
    place: caseFile.place,
    solution: caseFile.solution,
    witnesses: caseFile.npcs.map((w) => ({
      name: w.name,
      role: w.role,
      concept: w.concept,
      challenge: w.challenge,
      reveal_condition: w.reveal_condition,
      clue: w.clue,
      personality: w.personality,
    })),
  };

  return `You voice the witnesses in CaseDetective, a serious detective game that teaches study material through conversation.
Case file (hidden from the student):
${JSON.stringify(hidden, null, 1)}

How to judge and reply:
- Stay in character as the witness named in the request. Max ${MAX_REPLY_WORDS} words. Plain text, no markdown.
- Judge understanding, not keywords. Accept the student's own words and imperfect phrasing.
- "full" means the answer meets the reveal_condition. Then hand over the clue in character and name it.
- "partial" means on the right track. Nudge toward the missing piece. suspicion_delta 0.
- "none" means wrong or off-topic. Re-explain from a new angle with a concrete everyday example. suspicion_delta 5 to 15. Questions, requests for hints and honest confusion get 0.
- Never state the full answer to the challenge before the student earns it.
- feedback_note: one short sentence naming what the student should review, or "" when understanding is full.
- quick_replies: three short things the student might say next, under 8 words each, written as the student.`;
}

interface TalkPromptInput {
  witness: CaseWitness;
  clueEarned: boolean;
  history: Exchange[];
  text: string;
}

export function talkPrompt({ witness, clueEarned, history, text }: TalkPromptInput): string {
  const transcript = history.map((h) => `Student: ${h.student}\n${witness.name}: ${h.npc}`).join("\n");
  const task = clueEarned
    ? `The student already earned your clue. Answer their questions as a helpful tutor in character; understanding "full", suspicion_delta 0.`
    : `Your challenge to the student: ${witness.challenge}`;

  return `You are ${witness.name}, ${witness.role} at ${witness.location}.
${task}
Conversation so far:
${transcript || "(none yet; you already greeted them and asked your challenge)"}

The student says: <student>${text}</student>`;
}

export function accusationPrompt(caseFile: CaseFile, text: string): string {
  return `Case: ${caseFile.title}
Final question: ${caseFile.accusation_question}
Model answer (hidden): ${caseFile.solution}
The three concepts: ${caseFile.npcs.map((w) => w.concept).join("; ")}

The detective's explanation: <student>${text}</student>

Accept the student's own words. "solved" requires all three concepts used correctly and linked to the case. "partial" means some concepts are right or the links are weak. "no" means mostly wrong.
feedback: 2-3 sentences in the inspector's voice saying what was right and what is missing. Do not reveal the model answer unless the verdict is "solved".
missing: names of concepts that were absent or wrong (empty when solved).`;
}
