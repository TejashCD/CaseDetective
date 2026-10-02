import { $, $$ } from "../core/dom.ts";
import type { World } from "../world/world.ts";

export type ScreenName = "title" | "loading" | "game" | "report";

export interface Screens {
  readonly current: ScreenName;
  show(name: ScreenName): void;
}

/** Switches screens and runs only the canvas that is visible. */
export function createScreens(backdrop: World, world: World): Screens {
  const backdropCanvas = $("#backdrop");
  let current: ScreenName = "title";

  return {
    get current() {
      return current;
    },

    show(name) {
      current = name;
      for (const screen of $$(".screen")) screen.hidden = screen.id !== `screen-${name}`;

      const playing = name === "game";
      const showBackdrop = !playing && name !== "report";
      backdropCanvas.hidden = !showBackdrop;
      if (playing) world.start();
      else world.stop();
      if (showBackdrop) backdrop.start();
      else backdrop.stop();

      window.scrollTo(0, 0);
    },
  };
}
