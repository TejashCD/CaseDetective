import type { CaseView } from "../../shared/api.ts";
import { $, escapeHtml } from "../core/dom.ts";

export function openBriefing(view: CaseView, onClose?: () => void): void {
  const dialog = $<HTMLDialogElement>("#dlg-brief");
  if (dialog.open) return;

  $("#brief-title").textContent = view.title;
  $("#brief-intro").textContent = view.intro;
  $("#brief-witnesses").innerHTML = view.npcs
    .map(
      (w) =>
        `<li><i style="background:${escapeHtml(w.color)}"></i><div><b>${escapeHtml(w.name)}</b>` +
        `<small>${escapeHtml(w.role)} · ${escapeHtml(w.location)} · guards <em>${escapeHtml(w.concept)}</em></small></div></li>`,
    )
    .join("");

  if (onClose) dialog.addEventListener("close", onClose, { once: true });
  dialog.showModal();
}
