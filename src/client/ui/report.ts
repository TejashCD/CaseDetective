// End-of-case report: verdict, stats, concepts, solution and a review list.
import type { CaseReport, ConceptReport, ReviewNote } from "../../shared/api.ts";
import { $, escapeHtml } from "../core/dom.ts";

interface ReportActions {
  onResume: () => void;
  onNewCase: () => void;
}

export function renderReport(report: CaseReport, { onResume, onNewCase }: ReportActions): void {
  const container = $("#report");
  const solved = report.verdict === "solved";
  container.innerHTML = reportHtml(report, solved);

  $("#rep-new", container).addEventListener("click", onNewCase);
  $("#rep-print", container).addEventListener("click", () => window.print());
  if (!solved) $("#rep-resume", container).addEventListener("click", onResume);
}

function reportHtml(report: CaseReport, solved: boolean): string {
  const earned = report.concepts.filter((c) => c.earned).length;
  const answers = report.concepts.reduce((sum, c) => sum + c.exchanges, 0);

  return `
    <article class="report-sheet">
      <div class="big-stamp ${solved ? "solved" : "open"}">${solved ? "CASE CLOSED" : "CASE OPEN"}</div>
      <p class="kicker">Case report &middot; ${escapeHtml(report.place)}</p>
      <h1>${escapeHtml(report.title)}</h1>
      <p class="sub">${solved ? "Solved. Here is what you proved you understand." : "Not solved yet. Here is where you stand."}</p>
      <div class="stats">
        ${stat(`${earned}/${report.concepts.length}`, "Clues earned")}
        ${stat(answers, "Answers given")}
        ${stat(report.attempts, "Accusations")}
        ${stat(report.suspicion, "Final suspicion")}
      </div>
      <h3>Concepts</h3>
      ${report.concepts.map(conceptRowHtml).join("")}
      <h3>The solution</h3>
      <p class="solution">${escapeHtml(report.solution)}</p>
      ${report.feedback ? `<p class="inspector"><b>Inspector:</b> ${escapeHtml(report.feedback)}</p>` : ""}
      <h3>Review next</h3>
      ${reviewHtml(report.notes)}
    </article>
    <div class="report-actions">
      ${solved ? "" : `<button type="button" class="btn primary" id="rep-resume">Resume the case</button>`}
      <button type="button" class="btn ${solved ? "primary" : "ghost"}" id="rep-new">Open a new case</button>
      <button type="button" class="btn ghost" id="rep-print">Print study sheet</button>
    </div>`;
}

function stat(value: string | number, label: string): string {
  return `<div><b>${escapeHtml(value)}</b><span>${label}</span></div>`;
}

function conceptRowHtml(concept: ConceptReport, index: number): string {
  return `<div class="concept-row">
    <span class="n">${String(index + 1).padStart(2, "0")}</span>
    <div>
      <b>${escapeHtml(concept.concept)}</b>
      <p>${escapeHtml(concept.earned ? concept.clue : concept.challenge)}</p>
      <p class="witness">Witness: ${escapeHtml(concept.witness)}</p>
    </div>
    <span class="tag ${concept.earned ? "ok" : "no"}">${concept.earned ? "Earned" : "Missed"}</span>
  </div>`;
}

function reviewHtml(notes: ReviewNote[]): string {
  if (notes.length === 0) return `<p>No slips recorded. You explained every concept cleanly. Try a harder topic next.</p>`;
  return `<ul class="review">${notes.map((n) => `<li><b>${escapeHtml(n.concept)}:</b> ${escapeHtml(n.note)}</li>`).join("")}</ul>`;
}
