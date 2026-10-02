import type { Witness } from "../../shared/api.ts";
import { escapeHtml } from "../core/dom.ts";

export function evidenceCardHtml(witness: Witness, index: number, { fresh = false } = {}): string {
  const classes = ["ev", witness.clue !== null && "earned", fresh && "fresh"].filter(Boolean).join(" ");
  const body = witness.clue !== null ? escapeHtml(witness.clue) : `Sealed. Earn it from ${escapeHtml(witness.name)}.`;
  return `<article class="${classes}">
    <div class="ev-num">${String(index + 1).padStart(2, "0")}</div>
    <div><span class="ev-concept">${escapeHtml(witness.concept)}</span><p>${body}</p></div>
  </article>`;
}
