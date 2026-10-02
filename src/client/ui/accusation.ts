// The Politiebureau: presenting the final explanation to the inspector.
import type { AccuseResponse, Verdict } from "../../shared/api.ts";
import { LIMITS } from "../../shared/limits.ts";
import type { Sound } from "../audio/sound.ts";
import { api, errorMessage } from "../core/api.ts";
import { $, escapeHtml } from "../core/dom.ts";
import type { CaseSession } from "../game/case-session.ts";
import { evidenceCardHtml } from "./evidence.ts";

const VERDICT_LABELS: Record<Verdict, string> = { solved: "Case solved", partial: "Not convinced", no: "Rejected" };
const SUBMIT_LABEL = "Present the case";

interface AccusationOptions {
  sound: Sound;
  onSolved: () => void;
  onShowReport: () => void;
  onClosed: () => void;
}

export class AccusationDialog {
  readonly #sound: Sound;
  readonly #onSolved: () => void;
  readonly #dialog = $<HTMLDialogElement>("#dlg-accuse");
  readonly #text = $<HTMLTextAreaElement>("#accuse-text");
  readonly #result = $("#accuse-result");
  readonly #submit = $<HTMLButtonElement>("#accuse-submit");

  #session: CaseSession | null = null;
  /** After a solved verdict the submit button opens the report instead. */
  #solved = false;

  constructor({ sound, onSolved, onShowReport, onClosed }: AccusationOptions) {
    this.#sound = sound;
    this.#onSolved = onSolved;

    $("#accuse-form").addEventListener("submit", (event) => {
      event.preventDefault();
      if (this.#solved) onShowReport();
      else void this.#present();
    });
    $("#accuse-x").addEventListener("click", () => this.close());
    $("#accuse-back").addEventListener("click", () => this.close());
    this.#dialog.addEventListener("close", onClosed);
  }

  open(session: CaseSession): void {
    this.#session = session;
    this.#solved = false;
    $("#accuse-evidence").innerHTML = session.witnesses.map((w, i) => evidenceCardHtml(w, i)).join("");
    $("#accuse-q").textContent = session.view.accusationQuestion;
    this.#result.hidden = true;
    this.#submit.disabled = false;
    this.#submit.textContent = SUBMIT_LABEL;
    this.#sound.door();
    this.#dialog.showModal();
    setTimeout(() => this.#text.focus(), 60);
  }

  close(): void {
    if (this.#dialog.open) this.#dialog.close();
  }

  async #present(): Promise<void> {
    const session = this.#session;
    const text = this.#text.value.trim();
    if (!session) return;
    if (text.length < LIMITS.accusationMin) {
      this.#showMessage("Make your case in a few sentences, using all three pieces of evidence.");
      return;
    }

    this.#submit.disabled = true;
    this.#submit.textContent = "The inspector is reading...";
    try {
      const result = await api.accuse(session.id, text);
      session.applyState(result.state);
      this.#showVerdict(result);
      if (result.verdict === "solved") {
        this.#solved = true;
        this.#sound.solved();
        this.#submit.textContent = "Close the case and see your report";
        this.#onSolved();
      } else {
        this.#sound.thud();
        this.#submit.textContent = "Revise and present again";
      }
    } catch (error) {
      this.#showMessage(errorMessage(error));
      this.#submit.textContent = SUBMIT_LABEL;
    } finally {
      this.#submit.disabled = false;
    }
  }

  #showVerdict({ verdict, feedback, missing }: AccuseResponse): void {
    const missingHtml = missing.length > 0 ? `<p class="missing">Weak or missing: ${escapeHtml(missing.join(", "))}</p>` : "";
    this.#result.innerHTML = `<span class="verdict ${verdict}">${VERDICT_LABELS[verdict]}</span><p>${escapeHtml(feedback)}</p>${missingHtml}`;
    this.#result.hidden = false;
  }

  #showMessage(message: string): void {
    this.#result.innerHTML = `<p>${escapeHtml(message)}</p>`;
    this.#result.hidden = false;
  }
}
