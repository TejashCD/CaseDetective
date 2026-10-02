// Case file sidebar: story, evidence, suspicion meter, witness list and the station button.
import type { CaseView, Witness } from "../../shared/api.ts";
import { $, escapeHtml } from "../core/dom.ts";
import type { CaseSession } from "../game/case-session.ts";
import { evidenceCardHtml } from "./evidence.ts";

const MIN_METER_WIDTH = 4;
const HOT_SUSPICION = 70;

export function suspicionLabel(suspicion: number): string {
  if (suspicion < 35) return `Calm · ${suspicion}`;
  if (suspicion < HOT_SUSPICION) return `Wary · ${suspicion}`;
  return `Hostile · ${suspicion}`;
}

interface CaseFileHandlers {
  onWalkToWitness: (index: number) => void;
  onReportToStation: () => void;
}

export class CaseFilePanel {
  readonly #panel = $("#panel-file");
  readonly #evidence = $("#evidence");
  readonly #evidenceCount = $("#evidence-count");
  readonly #meter = $("#sus-meter");
  readonly #meterFills = [$("#sus-fill"), $("#chat-sus-fill")];
  readonly #meterLabel = $("#sus-label");
  readonly #witnessList = $("#witnesses");
  readonly #stationButton = $<HTMLButtonElement>("#btn-station");

  constructor({ onWalkToWitness, onReportToStation }: CaseFileHandlers) {
    this.#witnessList.addEventListener("click", (event) => {
      const button = (event.target as Element).closest<HTMLElement>("[data-walk]");
      if (button) onWalkToWitness(Number(button.dataset.walk));
    });
    this.#stationButton.addEventListener("click", onReportToStation);
  }

  set visible(value: boolean) {
    this.#panel.hidden = !value;
  }

  setCase(view: CaseView): void {
    $("#hud-title").textContent = view.title;
    $("#hud-place").textContent = view.place;
    $("#file-title").textContent = view.title;
    $("#file-intro").textContent = view.intro;
    $("#file-objective").textContent = view.objective;
  }

  /** `freshClue` is the index of a just-earned clue to animate. */
  render(session: CaseSession, { freshClue = -1 } = {}): void {
    const { state, witnesses } = session;

    this.#evidenceCount.textContent = `${session.earnedCount} / ${witnesses.length}`;
    this.#evidence.innerHTML = witnesses.map((w, i) => evidenceCardHtml(w, i, { fresh: i === freshClue })).join("");

    for (const fill of this.#meterFills) fill.style.width = `${Math.max(MIN_METER_WIDTH, state.suspicion)}%`;
    this.#meter.setAttribute("aria-valuenow", String(state.suspicion));
    this.#meter.classList.toggle("hot", state.suspicion >= HOT_SUSPICION);
    this.#meterLabel.textContent = suspicionLabel(state.suspicion);

    this.#witnessList.innerHTML = witnesses.map((w, i) => witnessRowHtml(w, i, witnessStatus(session, i))).join("");

    const ready = session.allCluesEarned && !session.solved;
    this.#stationButton.disabled = !ready;
    this.#stationButton.classList.toggle("ready", ready);
    if (session.solved) this.#stationButton.textContent = "Case closed";
    else if (session.allCluesEarned) this.#stationButton.textContent = "Report to the Politiebureau";
    else this.#stationButton.textContent = `Report to the Politiebureau · ${session.earnedCount}/${witnesses.length} clues`;
  }
}

function witnessStatus(session: CaseSession, index: number): { text: string; ok: boolean } {
  if (session.hasEarned(index)) return { text: "Clue earned", ok: true };
  return { text: session.hasMet(index) ? "Questioned" : "Not seen", ok: false };
}

function witnessRowHtml(witness: Witness, index: number, status: { text: string; ok: boolean }): string {
  return `<li><button type="button" data-walk="${index}">
    <span class="sw" style="background:${escapeHtml(witness.color)}"></span>
    <span><b>${escapeHtml(witness.name)}</b><small>${escapeHtml(witness.role)} · ${escapeHtml(witness.location)}</small></span>
    <span class="st ${status.ok ? "ok" : ""}">${status.text}</span>
  </button></li>`;
}
