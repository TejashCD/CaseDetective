import type { Facing } from "./characters.ts";
import type { Point } from "./constants.ts";
import type { LitWindow } from "./scenery.ts";

export interface Npc extends Point {
  name: string;
  sign: string;
  color: string;
  earned: boolean;
}

export interface Player extends Point {
  facing: Facing;
  moving: boolean;
  phase: number;
}

export interface RainDrop extends Point {
  vx: number;
  vy: number;
  len: number;
}

export interface Ripple extends Point {
  life: number;
  duration: number;
  water: boolean;
}

export interface Spark extends Point {
  vx: number;
  vy: number;
  life: number;
}

export type Interactable = { type: "npc"; index: number } | { type: "station" } | { type: "board" };

/** Read-only view of the world that the renderers draw from. */
export interface Scene {
  readonly t: number;
  readonly cam: number;
  readonly attract: boolean;
  readonly npcs: readonly Npc[];
  readonly player: Player;
  readonly drops: readonly RainDrop[];
  readonly ripples: readonly Ripple[];
  readonly sparks: readonly Spark[];
  readonly flash: number;
  readonly thinking: boolean;
  readonly speaking: boolean;
  readonly interior: { index: number } | null;
  readonly scenery: HTMLCanvasElement;
  readonly litWindows: readonly LitWindow[];
  readonly allCluesEarned: boolean;
  isBlinking(window: number): boolean;
}
