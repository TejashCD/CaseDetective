import type { ReviewNote } from "../../shared/api.ts";
import type { GeneratedCase, GeneratedWitness } from "../ai/schemas.ts";

export interface WitnessDraft extends GeneratedWitness {
  /** Demo case only: used for offline grading. */
  keywords?: readonly string[];
}

/** A case before the server assigns colours (generated, or the built-in demo). */
export interface CaseDraft extends Omit<GeneratedCase, "npcs"> {
  npcs: WitnessDraft[];
}

/** A witness as stored on the server, including fields the player never sees. */
export interface CaseWitness extends WitnessDraft {
  color: string;
}

export interface CaseFile extends Omit<GeneratedCase, "npcs"> {
  npcs: CaseWitness[];
}

export interface Exchange {
  student: string;
  npc: string;
}

export interface CaseProgress {
  clues: boolean[];
  suspicion: number;
  notes: ReviewNote[];
  history: Exchange[][];
  attempts: number;
  verdict: "solved" | null;
  feedback: string;
  ejections: number;
}

export interface CaseRecord {
  id: string;
  demo: boolean;
  caseFile: CaseFile;
  progress: CaseProgress;
  createdAt: number;
  touchedAt: number;
}
