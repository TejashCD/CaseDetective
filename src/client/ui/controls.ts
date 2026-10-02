// Keyboard and touch input for walking the street.
import { $$ } from "../core/dom.ts";
import type { Direction, World } from "../world/world.ts";

const KEYMAP: Readonly<Record<string, Direction>> = {
  w: "up",
  arrowup: "up",
  s: "down",
  arrowdown: "down",
  a: "left",
  arrowleft: "left",
  d: "right",
  arrowright: "right",
};
const INTERACT_KEYS = new Set(["e", "enter", " "]);
const TEXT_FIELDS = new Set(["INPUT", "TEXTAREA", "SELECT"]);
const DIRECTIONS = new Set<string>(["up", "down", "left", "right"]);

interface ControlsOptions {
  world: World;
  /** True while the street is on screen and no dialog is open. */
  isPlaying: () => boolean;
  isInterviewing: () => boolean;
  onLeaveInterview: () => void;
  touchAction: HTMLElement;
}

export function bindControls({ world, isPlaying, isInterviewing, onLeaveInterview, touchAction }: ControlsOptions): void {
  addEventListener("keydown", (event) => {
    if (!isPlaying()) return;
    const key = event.key.toLowerCase();

    if (key === "escape" && isInterviewing()) {
      event.preventDefault();
      onLeaveInterview();
      return;
    }
    const target = event.target as HTMLElement;
    if (TEXT_FIELDS.has(target.tagName) || target.isContentEditable || isInterviewing()) return;

    const direction = KEYMAP[key];
    if (direction) {
      event.preventDefault();
      world.setKey(direction, true);
    } else if (INTERACT_KEYS.has(key)) {
      event.preventDefault();
      world.interact();
    }
  });

  addEventListener("keyup", (event) => {
    const direction = KEYMAP[event.key.toLowerCase()];
    if (direction) world.setKey(direction, false);
  });
  addEventListener("blur", () => world.releaseKeys());

  for (const button of $$(".dpad button")) {
    const direction = button.dataset.key;
    if (!direction || !DIRECTIONS.has(direction)) continue;
    const dir = direction as Direction;
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      world.setKey(dir, true);
    });
    for (const type of ["pointerup", "pointerleave", "pointercancel"] as const) {
      button.addEventListener(type, () => world.setKey(dir, false));
    }
  }
  touchAction.addEventListener("click", () => world.interact());
}
