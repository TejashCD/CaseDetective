// Client entry point: builds the UI components and wires them together.
// Game rules and all AI calls live on the server.
import type { CaseView } from "../shared/api.ts";
import { Sound } from "./audio/sound.ts";
import { api, errorMessage } from "./core/api.ts";
import { $ } from "./core/dom.ts";
import { CaseSession } from "./game/case-session.ts";
import { AccusationDialog } from "./ui/accusation.ts";
import { openBriefing } from "./ui/briefing.ts";
import { CaseFilePanel } from "./ui/case-file.ts";
import { bindControls } from "./ui/controls.ts";
import { Interview } from "./ui/interview.ts";
import { renderReport } from "./ui/report.ts";
import { createScreens } from "./ui/screens.ts";
import { initTitleScreen } from "./ui/title-screen.ts";
import { createToaster } from "./ui/toast.ts";
import type { Interactable } from "./world/types.ts";
import { World } from "./world/world.ts";

const sound = new Sound();
const toast = createToaster($("#toasts"));
const worldCanvas = $<HTMLCanvasElement>("#world");
const prompt = $("#prompt");

let session: CaseSession | null = null;

const backdrop = new World($<HTMLCanvasElement>("#backdrop"), { attract: true });
const world = new World(worldCanvas, { onNear: showPrompt, onInteract: interact });
const screens = createScreens(backdrop, world);
backdrop.start();
// Shop signs use web fonts; repaint once they have loaded.
void document.fonts.ready.then(() => backdrop.build());

const caseFile = new CaseFilePanel({
  onWalkToWitness: (index) => {
    world.walkToNpc(index);
    focusWorld();
  },
  onReportToStation: () => {
    world.walkToStation();
    focusWorld();
  },
});

const interview = new Interview({
  world,
  sound,
  toast,
  onProgress: (options) => refreshCaseFile(options),
  onClosed: () => {
    caseFile.visible = true;
    refreshCaseFile();
    focusWorld();
    if (session?.allCluesEarned && !session.solved) {
      toast("All three clues logged. Report to the Politiebureau at the east end of the street.", "gold", 6);
    }
  },
});

const accusation = new AccusationDialog({
  sound,
  onSolved: () => refreshCaseFile(),
  onShowReport: () => void showReport(),
  onClosed: () => focusWorld(),
});

// ---- case lifecycle --------------------------------------------------------

async function startCase(view: CaseView, { resume = false } = {}): Promise<void> {
  session = CaseSession.begin(view, { resume });
  await document.fonts.ready;
  world.setCase(view.npcs);
  caseFile.setCase(view);
  caseFile.visible = true;
  refreshCaseFile();
  screens.show("game");
  if (resume) focusWorld();
  else showBriefing();
}

function refreshCaseFile(options?: { freshClue?: number }): void {
  if (!session) return;
  caseFile.render(session, options);
  world.setClues(session.state.clues);
}

function showBriefing(): void {
  if (!session) return;
  openBriefing(session.view, () => {
    focusWorld();
    if (!session?.hasMetAnyone) toast("Find the witnesses marked with a ? on the street. Click to walk, or use WASD.", "gold", 6);
  });
}

async function showReport(): Promise<void> {
  if (!session) return;
  accusation.close();
  interview.close();
  try {
    const report = await api.getReport(session.id);
    renderReport(report, {
      onResume: () => {
        screens.show("game");
        focusWorld();
      },
      onNewCase: () => {
        CaseSession.forgetActiveCase();
        session = null;
        screens.show("title");
      },
    });
    screens.show("report");
  } catch (error) {
    toast(errorMessage(error), "bad");
  }
}

/** After a refresh, pick the active case back up if the server still has it. */
async function resumeActiveCase(): Promise<void> {
  const id = CaseSession.activeCaseId();
  if (!id) return;
  try {
    await startCase(await api.getCase(id), { resume: true });
  } catch {
    CaseSession.forgetActiveCase();
  }
}

// ---- the street ------------------------------------------------------------

function showPrompt(target: Interactable | null): void {
  if (!target || !session || interview.isOpen) {
    prompt.hidden = true;
    return;
  }
  $("#prompt-text").textContent = promptText(session, target);
  $("#touch-action").textContent = target.type === "npc" ? "Talk" : "Open";
  prompt.hidden = false;
}

function promptText(current: CaseSession, target: Interactable): string {
  switch (target.type) {
    case "npc":
      return `Talk to ${current.witness(target.index).name}`;
    case "station":
      return current.allCluesEarned ? "Enter the Politiebureau" : "Politiebureau (locked until you have 3 clues)";
    case "board":
      return "Read the case notice";
  }
}

function interact(target: Interactable): void {
  if (!session) return;
  sound.wake();
  switch (target.type) {
    case "npc":
      prompt.hidden = true;
      caseFile.visible = false;
      interview.open(session, target.index);
      break;
    case "board":
      showBriefing();
      break;
    case "station":
      enterStation(session);
      break;
  }
}

function enterStation(current: CaseSession): void {
  if (current.solved) {
    toast("The inspector already closed this case.", "gold");
  } else if (!current.allCluesEarned) {
    const missing = current.missingWitnesses.map((w) => w.name);
    toast(`The desk sergeant shakes his head. Bring evidence from ${missing.join(" and ")}.`, "bad", 5);
  } else {
    accusation.open(current);
  }
}

function focusWorld(): void {
  worldCanvas.focus({ preventScroll: true });
}

// ---- HUD and input ---------------------------------------------------------

$("#btn-close").addEventListener("click", () => void showReport());
$("#btn-help").addEventListener("click", showBriefing);

const soundButton = $("#btn-sound");
function syncSoundButton(): void {
  soundButton.setAttribute("aria-pressed", String(sound.on));
  soundButton.setAttribute("aria-label", sound.on ? "Sound on" : "Sound off");
}
soundButton.addEventListener("click", () => {
  sound.toggle();
  syncSoundButton();
});
syncSoundButton();

bindControls({
  world,
  isPlaying: () => screens.current === "game" && !document.querySelector("dialog[open]"),
  isInterviewing: () => interview.isOpen,
  onLeaveInterview: () => interview.close(),
  touchAction: $("#touch-action"),
});

initTitleScreen({ sound, screens, onCaseReady: (view) => void startCase(view) });
void resumeActiveCase();
