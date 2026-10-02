// Questioning a witness: the conversation panel, suggested replies and sending answers.
import type { TalkResponse } from "../../shared/api.ts";
import type { Sound } from "../audio/sound.ts";
import { api, errorMessage } from "../core/api.ts";
import { $, escapeHtml, replayAnimation } from "../core/dom.ts";
import type { CaseSession, ChatMessage, MessageKind } from "../game/case-session.ts";
import { drawPortrait } from "../world/characters.ts";
import type { World } from "../world/world.ts";
import type { Toast } from "./toast.ts";
import { Typewriter } from "./typewriter.ts";

const OPENING_REPLIES = ["Can I have a hint?", "Explain it another way.", "Let me try an answer."];
const TUTOR_REPLIES = ["Can you explain it more deeply?", "How does this connect to the case?", "Give me an exam-style question."];
const FALLBACK_REPLIES = ["Can I have a hint?", "Explain it another way.", "Let me try again."];
/** Suggestions that mean "let me type my own answer" rather than something to send. */
const TYPE_MY_OWN = /^let me (try|answer)/i;

const MAX_INPUT_HEIGHT = 140;
const EJECT_DELAY_MS = 2200;
const ALL_CLUES_TOAST_DELAY_MS = 1200;

interface InterviewOptions {
  world: World;
  sound: Sound;
  toast: Toast;
  /** Case state changed; re-render the case file. */
  onProgress: (options?: { freshClue?: number }) => void;
  onClosed: () => void;
}

export class Interview {
  readonly #world: World;
  readonly #sound: Sound;
  readonly #toast: Toast;
  readonly #onProgress: InterviewOptions["onProgress"];
  readonly #onClosed: () => void;
  readonly #typewriter: Typewriter;

  readonly #panel = $("#panel-chat");
  readonly #log = $("#chat-log");
  readonly #quick = $("#quick");
  readonly #input = $<HTMLTextAreaElement>("#chat-input");
  readonly #sendButton = $<HTMLButtonElement>("#chat-send");
  readonly #statusPill = $("#chat-status");
  readonly #stage = $("#stage");

  #session: CaseSession | null = null;
  /** Witness being questioned, or null when on the street. */
  #witness: number | null = null;
  #busy = false;

  constructor({ world, sound, toast, onProgress, onClosed }: InterviewOptions) {
    this.#world = world;
    this.#sound = sound;
    this.#toast = toast;
    this.#onProgress = onProgress;
    this.#onClosed = onClosed;
    this.#typewriter = new Typewriter({
      onSpeaking: (speaking) => world.setSpeaking(speaking),
      onTick: () => sound.tick(),
      onProgress: () => this.#scrollToEnd(),
    });
    this.#bindEvents();
  }

  get isOpen(): boolean {
    return this.#witness !== null;
  }

  open(session: CaseSession, index: number): void {
    if (this.isOpen) return;
    this.#session = session;
    this.#witness = index;
    const witness = session.witness(index);

    this.#sound.door();
    this.#world.enterInterior(index);
    this.#panel.hidden = false;
    $("#chat-name").textContent = witness.name;
    $("#chat-role").textContent = `${witness.role} · ${witness.location}`;
    $("#chat-concept").textContent = witness.concept;
    drawPortrait($<HTMLCanvasElement>("#portrait"), index, witness.color);
    this.#updateStatus();

    this.#log.replaceChildren();
    const transcript = session.transcript(index);
    if (transcript.length === 0) {
      transcript.push({ who: "npc", text: witness.greeting }, { who: "npc", text: witness.challenge, challenge: true });
      session.quickReplies[index] = [...OPENING_REPLIES];
      for (const message of transcript) this.#render(message);
      this.#typewriter.play(this.#lastNpcBubbles(2));
    } else {
      for (const message of transcript) this.#render(message);
      this.#renderSystem(`You're back with ${witness.name}.`, "info");
      if (witness.clue) session.quickReplies[index] = [...TUTOR_REPLIES];
    }
    this.#renderQuickReplies();
    session.save();
    this.#scrollToEnd();
    setTimeout(() => this.#input.focus({ preventScroll: true }), 50);
  }

  close(): void {
    if (!this.isOpen) return;
    this.#typewriter.finish();
    this.#witness = null;
    this.#world.exitInterior();
    this.#panel.hidden = true;
    this.#onClosed();
  }

  async send(rawText: string): Promise<void> {
    const text = rawText.trim();
    const session = this.#session;
    const index = this.#witness;
    if (!text || this.#busy || index === null || !session) return;

    this.#typewriter.finish();
    this.#setBusy(true);
    this.#input.value = "";
    this.#autosize();
    this.#record({ who: "me", text });
    this.#renderQuickReplies();
    const pending = this.#renderThinking(session.witness(index).name);
    this.#world.setThinking(true);

    try {
      const result = await api.talk(session.token, index, text).finally(() => {
        pending.remove();
        this.#world.setThinking(false);
      });
      this.#applyResult(session, index, result);
    } catch (error) {
      if (this.#witness === index) this.#renderSystem(errorMessage(error), "bad");
    } finally {
      this.#setBusy(false);
      if (this.#witness === index) {
        this.#renderQuickReplies();
        this.#input.focus({ preventScroll: true });
      }
      session.save();
    }
  }

  // ---- results -------------------------------------------------------------

  #applyResult(session: CaseSession, index: number, result: TalkResponse): void {
    session.update(result);
    if (result.clue) session.earnClue(index, result.clue);
    session.quickReplies[index] = result.quickReplies.length > 0 ? result.quickReplies : [...FALLBACK_REPLIES];

    if (this.#witness !== index) {
      // The player left before the answer came back. Keep the transcript complete anyway.
      session.transcript(index).push({ who: "npc", text: result.reply });
      this.#onProgress();
      return;
    }

    this.#typewriter.play([this.#record({ who: "npc", text: result.reply })]);

    if (result.suspicionDelta > 0) {
      this.#recordSystem(`Suspicion +${result.suspicionDelta}`, "bad");
      this.#sound.thud();
      this.#world.shake();
      replayAnimation(this.#stage, "shake");
    } else if (result.understanding === "partial" && !session.hasEarned(index)) {
      this.#recordSystem("On the right track", "info");
    }

    if (result.clue) this.#celebrateClue(session, result.clue);
    if (result.offline) this.#recordSystem("Offline mode: simple grading", "info");
    this.#onProgress({ freshClue: result.clue ? index : -1 });

    if (result.ejected) {
      this.#recordSystem("You've pushed too far. You're shown the door.", "bad");
      this.#toast(`${session.witness(index).name} threw you out. Cool off, then try again.`, "bad", 5);
      setTimeout(() => {
        if (this.#witness === index) this.close();
      }, EJECT_DELAY_MS);
    }
  }

  #celebrateClue(session: CaseSession, clue: string): void {
    this.#recordSystem(`Evidence logged: ${clue}`, "good");
    this.#sound.chime();
    this.#world.celebrate();
    this.#toast(`Evidence logged: ${clue}`, "good", 5);
    this.#updateStatus();
    if (session.allCluesEarned) {
      setTimeout(() => this.#toast("That's all three. Head to the Politiebureau to make your case.", "gold", 6), ALL_CLUES_TOAST_DELAY_MS);
    }
  }

  // ---- rendering -----------------------------------------------------------

  #updateStatus(): void {
    const earned = this.#witness !== null && (this.#session?.hasEarned(this.#witness) ?? false);
    this.#statusPill.textContent = earned ? "Clue earned" : "Clue sealed";
    this.#statusPill.classList.toggle("ok", earned);
    this.#input.placeholder = earned ? "Ask anything about this concept..." : "Explain it in your own words...";
  }

  /** Adds a message to the saved transcript and the log. Returns its element. */
  #record(message: ChatMessage): HTMLElement {
    if (this.#session && this.#witness !== null) this.#session.transcript(this.#witness).push(message);
    return this.#render(message);
  }

  #recordSystem(text: string, kind: MessageKind): void {
    this.#record({ who: "sys", text, kind });
  }

  /** Returns the speech bubble, or the line itself for system messages. */
  #render(message: ChatMessage): HTMLElement {
    if (message.who === "sys") return this.#renderSystem(message.text, message.kind);

    const mine = message.who === "me";
    const element = document.createElement("div");
    element.className = `msg ${mine ? "me" : "npc"}`;
    const speaker = mine ? "You" : escapeHtml(this.#firstName());
    const challenge = message.who === "npc" && message.challenge ? " challenge" : "";
    element.innerHTML = `<span class="from">${speaker}</span><div class="bubble${challenge}"></div>`;
    const bubble = $(".bubble", element);
    bubble.textContent = message.text;
    this.#log.append(element);
    this.#scrollToEnd();
    return bubble;
  }

  /** A status line. Not saved unless it goes through #record. */
  #renderSystem(text: string, kind: MessageKind = ""): HTMLElement {
    const element = document.createElement("div");
    element.className = `sys ${kind}`.trim();
    element.textContent = text;
    this.#log.append(element);
    this.#scrollToEnd();
    return element;
  }

  #renderThinking(name: string): HTMLElement {
    const element = document.createElement("div");
    element.className = "msg npc";
    element.innerHTML = `<span class="from">${escapeHtml(name.split(" ")[0] ?? name)}</span><div class="bubble typing"><i></i><i></i><i></i></div>`;
    this.#log.append(element);
    this.#scrollToEnd();
    return element;
  }

  #renderQuickReplies(): void {
    const buttons = this.#currentQuickReplies().map((reply, i) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.reply = String(i);
      button.disabled = this.#busy;
      const key = document.createElement("kbd");
      key.textContent = String(i + 1);
      const label = document.createElement("span");
      label.textContent = reply;
      button.append(key, label);
      return button;
    });
    this.#quick.replaceChildren(...buttons);
  }

  #currentQuickReplies(): string[] {
    if (this.#witness === null || !this.#session) return [];
    return (this.#session.quickReplies[this.#witness] ?? []).slice(0, 3);
  }

  #pickQuickReply(reply: string): void {
    if (TYPE_MY_OWN.test(reply)) this.#input.focus();
    else void this.send(reply);
  }

  #lastNpcBubbles(count: number): HTMLElement[] {
    return [...this.#log.querySelectorAll<HTMLElement>(".msg.npc .bubble")].slice(-count);
  }

  #firstName(): string {
    if (!this.#session || this.#witness === null) return "";
    return this.#session.witness(this.#witness).name.split(" ")[0] ?? "";
  }

  #scrollToEnd(): void {
    this.#log.scrollTop = this.#log.scrollHeight;
  }

  #setBusy(busy: boolean): void {
    this.#busy = busy;
    this.#sendButton.disabled = busy;
  }

  #autosize(): void {
    this.#input.style.height = "auto";
    this.#input.style.height = `${Math.min(MAX_INPUT_HEIGHT, this.#input.scrollHeight)}px`;
  }

  // ---- events --------------------------------------------------------------

  #bindEvents(): void {
    this.#log.addEventListener("click", () => this.#typewriter.finish());
    this.#quick.addEventListener("click", (event) => {
      const button = (event.target as Element).closest<HTMLElement>("[data-reply]");
      const reply = button ? this.#currentQuickReplies()[Number(button.dataset.reply)] : undefined;
      if (reply) this.#pickQuickReply(reply);
    });
    this.#input.addEventListener("input", () => this.#autosize());
    this.#input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        void this.send(this.#input.value);
      } else if (/^[1-3]$/.test(event.key) && !this.#input.value) {
        const reply = this.#currentQuickReplies()[Number(event.key) - 1];
        if (reply) {
          event.preventDefault();
          this.#pickQuickReply(reply);
        }
      }
    });
    $("#chat-form").addEventListener("submit", (event) => {
      event.preventDefault();
      void this.send(this.#input.value);
    });
    $("#btn-leave").addEventListener("click", () => this.close());
  }
}
