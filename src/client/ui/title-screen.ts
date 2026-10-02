import type { CaseView } from "../../shared/api.ts";
import { LIMITS } from "../../shared/limits.ts";
import type { Sound } from "../audio/sound.ts";
import { api, errorMessage } from "../core/api.ts";
import { $, $$ } from "../core/dom.ts";
import { SAMPLES } from "../data/samples.ts";
import type { Screens } from "./screens.ts";

const LOADING_STEP_MS = 6500;
/** Let the full progress bar show before switching screens. */
const LOADING_FINISH_MS = 450;

interface TitleScreenOptions {
  sound: Sound;
  screens: Screens;
  onCaseReady: (view: CaseView) => void;
}

export function initTitleScreen({ sound, screens, onCaseReady }: TitleScreenOptions): void {
  const form = $<HTMLFormElement>("#intake");
  const material = $<HTMLTextAreaElement>("#material");
  const counter = $("#count");
  const error = $("#intake-error");
  const demoButton = $<HTMLButtonElement>("#play-demo");

  const updateCounter = () => {
    counter.textContent = `${material.value.length.toLocaleString()} / ${LIMITS.materialMax.toLocaleString()}`;
  };
  material.addEventListener("input", updateCounter);

  for (const chip of $$("[data-sample]")) {
    chip.addEventListener("click", () => {
      material.value = SAMPLES[chip.dataset.sample ?? ""] ?? "";
      updateCounter();
      material.focus();
    });
  }

  async function openCase(): Promise<void> {
    sound.wake();
    error.textContent = "";
    const text = material.value.trim();
    if (text.length < LIMITS.materialMin) {
      error.textContent = "Paste some notes or type a topic first.";
      material.focus();
      return;
    }

    screens.show("loading");
    const progress = startLoadingProgress();
    try {
      const view = await api.createCase(text);
      progress.finish();
      setTimeout(() => onCaseReady(view), LOADING_FINISH_MS);
    } catch (failure) {
      progress.cancel();
      screens.show("title");
      error.textContent = errorMessage(failure);
    }
  }

  async function playDemo(): Promise<void> {
    sound.wake();
    error.textContent = "";
    demoButton.classList.add("loading");
    demoButton.setAttribute("aria-busy", "true");
    try {
      onCaseReady(await api.playDemo());
    } catch (failure) {
      error.textContent = errorMessage(failure);
    } finally {
      demoButton.classList.remove("loading");
      demoButton.removeAttribute("aria-busy");
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void openCase();
  });
  demoButton.addEventListener("click", () => void playDemo());
}

/**
 * Case generation reports no real progress, so the checklist advances on a timer
 * and the bar stops short of full until the case arrives.
 */
function startLoadingProgress(): { finish(): void; cancel(): void } {
  const steps = $$("#loading-steps li");
  const bar = $("#loading-bar");
  let step = 0;

  const render = () => {
    steps.forEach((li, i) => {
      li.className = i < step ? "done" : i === step ? "active" : "";
    });
    bar.style.width = `${Math.min(92, 8 + step * 26)}%`;
  };
  render();

  const timer = setInterval(() => {
    if (step < steps.length - 1) {
      step++;
      render();
    }
  }, LOADING_STEP_MS);

  return {
    finish() {
      clearInterval(timer);
      step = steps.length;
      render();
      bar.style.width = "100%";
    },
    cancel() {
      clearInterval(timer);
    },
  };
}
