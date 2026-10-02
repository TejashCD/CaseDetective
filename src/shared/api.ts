// Request and response shapes for the HTTP API, shared by server and client.
//
// The server keeps no game state. Each case travels as an encrypted `token` that the
// client sends with every request and replaces with the one in each response.

export type Understanding = "none" | "partial" | "full";
export type Verdict = "solved" | "partial" | "no";

export interface CaseState {
  clues: boolean[];
  suspicion: number;
  verdict: "solved" | null;
  attempts: number;
}

export interface Witness {
  name: string;
  role: string;
  location: string;
  sign: string;
  concept: string;
  greeting: string;
  challenge: string;
  color: string;
  /** Null until the player earns it. */
  clue: string | null;
}

export interface CaseView {
  id: string;
  demo: boolean;
  title: string;
  place: string;
  intro: string;
  objective: string;
  accusationQuestion: string;
  npcs: Witness[];
  state: CaseState;
}

export interface CaseToken {
  token: string;
}

export interface CreateCaseRequest {
  material: string;
}

export interface CaseStarted extends CaseToken {
  case: CaseView;
}

export interface TalkRequest extends CaseToken {
  npc: number;
  text: string;
}

export interface TalkResponse extends CaseToken {
  reply: string;
  understanding: Understanding;
  suspicionDelta: number;
  quickReplies: string[];
  clue: string | null;
  ejected: boolean;
  offline: boolean;
  state: CaseState;
}

export interface AccuseRequest extends CaseToken {
  text: string;
}

export interface AccuseResponse extends CaseToken {
  verdict: Verdict;
  feedback: string;
  missing: string[];
  offline: boolean;
  state: CaseState;
}

export interface ReviewNote {
  concept: string;
  note: string;
}

export interface ConceptReport {
  concept: string;
  witness: string;
  earned: boolean;
  clue: string;
  challenge: string;
  exchanges: number;
}

export interface CaseReport {
  title: string;
  place: string;
  verdict: "solved" | null;
  feedback: string;
  attempts: number;
  suspicion: number;
  ejections: number;
  solution: string;
  concepts: ConceptReport[];
  notes: ReviewNote[];
}

export interface HealthResponse {
  ok: true;
  model: string;
  keyConfigured: boolean;
}

export interface ErrorResponse {
  error: string;
}
