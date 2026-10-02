// Client-side state for the case being played: the server's view, the case token, and
// what the player has seen in each conversation. Saved per tab so a refresh resumes the case.
import type { CaseState, CaseView, Witness } from "../../shared/api.ts";
import { WITNESS_COUNT } from "../../shared/limits.ts";
import { sessionStore } from "../core/storage.ts";

export type MessageKind = "" | "info" | "good" | "bad";

export type ChatMessage =
  { who: "npc"; text: string; challenge?: boolean } | { who: "me"; text: string } | { who: "sys"; text: string; kind: MessageKind };

interface SavedConversations {
  chats: ChatMessage[][];
  quick: string[][];
}

const TOKEN_KEY = "token";
const conversationsKey = (id: string) => `chat.${id}`;

export class CaseSession {
  readonly view: CaseView;
  /** Encrypted case state from the server. Sent with every request, replaced by every response. */
  #token: string;
  /** Display transcript per witness. */
  readonly transcripts: ChatMessage[][];
  /** Suggested replies per witness. */
  readonly quickReplies: string[][];

  constructor(view: CaseView, token: string, saved: SavedConversations | null = null) {
    this.view = view;
    this.#token = token;
    this.transcripts = isPerWitness(saved?.chats) ? saved.chats : emptyPerWitness();
    this.quickReplies = isPerWitness(saved?.quick) ? saved.quick : emptyPerWitness();
  }

  /** Starts or resumes a case and marks it as this tab's active case. */
  static begin(view: CaseView, token: string, { resume = false } = {}): CaseSession {
    sessionStore.set(TOKEN_KEY, token);
    const saved = resume ? sessionStore.getJson<SavedConversations>(conversationsKey(view.id)) : null;
    return new CaseSession(view, token, saved);
  }

  static activeCaseToken(): string | null {
    return sessionStore.get(TOKEN_KEY);
  }

  static forgetActiveCase(): void {
    sessionStore.remove(TOKEN_KEY);
  }

  get token(): string {
    return this.#token;
  }

  /** Applies a server response that changed the case. */
  update({ token, state }: { token: string; state: CaseState }): void {
    this.#token = token;
    this.view.state = state;
    sessionStore.set(TOKEN_KEY, token);
  }

  get id(): string {
    return this.view.id;
  }

  get state(): CaseState {
    return this.view.state;
  }

  get witnesses(): readonly Witness[] {
    return this.view.npcs;
  }

  witness(index: number): Witness {
    const witness = this.view.npcs[index];
    if (!witness) throw new RangeError(`No witness ${index}`);
    return witness;
  }

  transcript(index: number): ChatMessage[] {
    const transcript = this.transcripts[index];
    if (!transcript) throw new RangeError(`No witness ${index}`);
    return transcript;
  }

  get earnedCount(): number {
    return this.state.clues.filter(Boolean).length;
  }

  get allCluesEarned(): boolean {
    return this.state.clues.every(Boolean);
  }

  get solved(): boolean {
    return this.state.verdict === "solved";
  }

  get hasMetAnyone(): boolean {
    return this.transcripts.some((t) => t.length > 0);
  }

  get missingWitnesses(): Witness[] {
    return this.view.npcs.filter((w) => w.clue === null);
  }

  hasEarned(index: number): boolean {
    return Boolean(this.view.npcs[index]?.clue);
  }

  hasMet(index: number): boolean {
    return (this.transcripts[index]?.length ?? 0) > 0;
  }

  earnClue(index: number, clue: string): void {
    this.witness(index).clue = clue;
  }

  save(): void {
    sessionStore.setJson(conversationsKey(this.id), { chats: this.transcripts, quick: this.quickReplies } satisfies SavedConversations);
  }
}

function emptyPerWitness<T>(): T[][] {
  return Array.from({ length: WITNESS_COUNT }, () => []);
}

function isPerWitness<T>(value: T[][] | undefined): value is T[][] {
  return Array.isArray(value) && value.length === WITNESS_COUNT && value.every(Array.isArray);
}
