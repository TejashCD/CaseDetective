// The game world: a rainy Amsterdam canal street at night, plus the interview room.
// Everything is drawn procedurally; there are no image assets. This class owns the
// simulation and input, and the renderer modules do the drawing.
import type { Witness } from "../../shared/api.ts";
import {
  BOARD,
  CANAL,
  DEFAULT_SHOPS,
  FACADE_BASE,
  NPC_HOUSE_X,
  NPC_OFFSET_X,
  NPC_REACH,
  NPC_Y,
  QUAY,
  RENDER_SCALE,
  SPAWN,
  STATION_X,
  STREET,
  VIEW_H,
  VIEW_W,
  WALK_SPEED,
  WORLD_W,
  type Point,
} from "./constants.ts";
import { drawInterior } from "./interior-renderer.ts";
import { clamp } from "./math.ts";
import { bestBridgeX, bridgeNear, isWalkable, planPath, regionAt, snapToWalkable } from "./navigation.ts";
import { buildScenery, type LitWindow } from "./scenery.ts";
import { drawStreet } from "./street-renderer.ts";
import type { Interactable, Npc, Player, RainDrop, Ripple, Scene, Spark } from "./types.ts";

export type Direction = "up" | "down" | "left" | "right";

export interface WorldOptions {
  /** Title-screen mode: no player, the camera pans by itself. */
  attract?: boolean;
  /** The player moved in or out of reach of something. */
  onNear?: (target: Interactable | null) => void;
  onInteract?: (target: Interactable) => void;
}

const MAX_FRAME_SECONDS = 0.25;
const STEP_SECONDS = 1 / 60;
const RAIN_DROPS = 150;
const RIPPLE_SECONDS = 0.7;
const RIPPLES_PER_SECOND = 14;
const STUCK_SECONDS = 0.3;
const CAMERA_EASE = 6;

export class World implements Scene {
  readonly canvas: HTMLCanvasElement;
  readonly attract: boolean;

  npcs: Npc[];
  player: Player = newPlayer();
  cam: number;
  t = 0;
  interior: { index: number } | null = null;
  thinking = false;
  speaking = false;
  flash = 0;
  sparks: Spark[] = [];
  ripples: Ripple[] = [];
  readonly drops: RainDrop[] = Array.from({ length: RAIN_DROPS }, () => newDrop(true));
  scenery: HTMLCanvasElement;
  litWindows: LitWindow[] = [];

  readonly #g: CanvasRenderingContext2D;
  readonly #onNear: (target: Interactable | null) => void;
  readonly #onInteract: (target: Interactable) => void;
  readonly #keys: Record<Direction, boolean> = { up: false, down: false, left: false, right: false };
  readonly #vignette: HTMLCanvasElement;
  #path: Point[] | null = null;
  /** What to interact with when the current path ends. */
  #pending: Interactable | null = null;
  #near: Interactable | null = null;
  #stuckFor = 0;
  #shakeFor = 0;
  #nextBlink = 2;
  #running = false;

  constructor(canvas: HTMLCanvasElement, { attract = false, onNear = () => {}, onInteract = () => {} }: WorldOptions = {}) {
    const g = canvas.getContext("2d");
    if (!g) throw new Error("Canvas 2D is not supported");
    this.canvas = canvas;
    this.#g = g;
    canvas.width = VIEW_W * RENDER_SCALE;
    canvas.height = VIEW_H * RENDER_SCALE;
    this.attract = attract;
    this.#onNear = onNear;
    this.#onInteract = onInteract;
    this.cam = attract ? 600 : 0;
    this.npcs = placeNpcs(DEFAULT_SHOPS.map((shop) => ({ ...shop, name: "", earned: false })));
    this.#vignette = makeVignette();
    this.scenery = document.createElement("canvas");
    this.build();
    if (!attract) this.#bindPointer();
  }

  // ---- public API ----------------------------------------------------------

  setCase(witnesses: readonly Witness[]): void {
    this.npcs = placeNpcs(witnesses.map((w) => ({ sign: w.sign, color: w.color, name: w.name, earned: w.clue !== null })));
    this.player = newPlayer();
    this.cam = 0;
    this.#path = null;
    this.#pending = null;
    this.#near = null;
    this.interior = null;
    this.build();
  }

  setClues(clues: readonly boolean[]): void {
    clues.forEach((earned, i) => {
      const npc = this.npcs[i];
      if (npc) npc.earned = earned;
    });
  }

  get allCluesEarned(): boolean {
    return this.npcs.length > 0 && this.npcs.every((n) => n.earned);
  }

  /** Redraws the static scenery. Call again once web fonts load, for the shop signs. */
  build(): void {
    const { canvas, litWindows } = buildScenery(this.npcs, this.scenery);
    this.scenery = canvas;
    this.litWindows = litWindows;
  }

  enterInterior(index: number): void {
    this.interior = { index };
    this.#path = null;
    this.#pending = null;
    this.releaseKeys();
    this.canvas.parentElement?.classList.add("interior");
  }

  exitInterior(): void {
    const npc = this.interior && this.npcs[this.interior.index];
    if (npc) {
      // Step back out onto the street, facing the shop.
      this.player.x = npc.x - 34;
      this.player.y = NPC_Y + 4;
      this.player.facing = "right";
    }
    this.interior = null;
    this.thinking = false;
    this.speaking = false;
    this.canvas.parentElement?.classList.remove("interior");
  }

  setThinking(value: boolean): void {
    this.thinking = value;
  }

  setSpeaking(value: boolean): void {
    this.speaking = value;
  }

  /** Sparks and a flash in the interview room. */
  celebrate(): void {
    this.flash = 1;
    for (let i = 0; i < 46; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const speed = 120 + Math.random() * 260;
      this.sparks.push({ x: 480, y: 410, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.8 + Math.random() * 0.6 });
    }
  }

  shake(): void {
    this.#shakeFor = 0.4;
  }

  setKey(direction: Direction, down: boolean): void {
    this.#keys[direction] = down;
  }

  releaseKeys(): void {
    this.#keys.up = this.#keys.down = this.#keys.left = this.#keys.right = false;
  }

  /** Interact with whatever is in reach. */
  interact(): void {
    if (this.interior || !this.#near) return;
    this.#onInteract(this.#near);
  }

  walkToNpc(index: number): void {
    const npc = this.npcs[index];
    if (!npc) return;
    // Approach from the side the player arrives on (via a bridge when coming from the quay).
    const arriveX = regionAt(this.player.y) === "street" ? this.player.x : bestBridgeX(this.player.x, npc.x);
    const side = arriveX > npc.x ? 32 : -34;
    this.walkTo({ x: npc.x + side, y: NPC_Y + 4 }, { type: "npc", index });
  }

  walkToStation(): void {
    this.walkTo({ x: STATION_X, y: STREET.top + 6 }, { type: "station" });
  }

  walkToBoard(): void {
    this.walkTo({ x: BOARD.x, y: BOARD.y + 14 }, { type: "board" });
  }

  walkTo(target: Point, interactWith: Interactable | null = null): void {
    this.#path = planPath(this.player, target, this.npcs);
    this.#pending = interactWith;
    this.#stuckFor = 0;
  }

  start(): void {
    if (this.#running) return;
    this.#running = true;
    let last = performance.now();
    const frame = (now: number) => {
      if (!this.#running) return;
      // Fixed sub-steps keep movement correct on slow or throttled frames.
      let elapsed = Math.min(MAX_FRAME_SECONDS, (now - last) / 1000);
      last = now;
      while (elapsed > 0) {
        const dt = Math.min(STEP_SECONDS, elapsed);
        this.#update(dt);
        elapsed -= dt;
      }
      this.#draw();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  stop(): void {
    this.#running = false;
  }

  /** True during the last `window` seconds before the next blink. */
  isBlinking(window: number): boolean {
    return this.t > this.#nextBlink - window;
  }

  // ---- input ---------------------------------------------------------------

  #bindPointer(): void {
    this.canvas.addEventListener("pointerdown", (event) => {
      if (this.interior) return;
      this.canvas.focus({ preventScroll: true });
      const rect = this.canvas.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * VIEW_W + this.cam;
      const y = ((event.clientY - rect.top) / rect.height) * VIEW_H;

      const npcHit = this.npcs.findIndex((n) => Math.abs(x - n.x) < 22 && y > n.y - 64 && y < n.y + 8);
      if (npcHit >= 0) this.walkToNpc(npcHit);
      else if (Math.abs(x - STATION_X) < 70 && y > FACADE_BASE - 120 && y < STREET.top + 20) this.walkToStation();
      else if (Math.abs(x - BOARD.x) < 26 && y > BOARD.y - 60 && y < BOARD.y + 8) this.walkToBoard();
      else this.walkTo(snapToWalkable(x, y));
    });
  }

  // ---- simulation ----------------------------------------------------------

  #update(dt: number): void {
    this.t += dt;
    this.#updateEffects(dt);
    this.#updateWeather(dt);

    if (this.attract) {
      this.cam = 300 + (Math.sin(this.t * 0.035) * 0.5 + 0.5) * (WORLD_W - VIEW_W - 300);
      return;
    }
    if (this.interior) return;

    this.#movePlayer(dt);
    const target = clamp(this.player.x - VIEW_W / 2, 0, WORLD_W - VIEW_W);
    this.cam += (target - this.cam) * Math.min(1, dt * CAMERA_EASE);
    this.#updateNear();
  }

  #updateEffects(dt: number): void {
    if (this.#shakeFor > 0) this.#shakeFor -= dt;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 1.6);
    this.sparks = this.sparks.filter((s) => (s.life -= dt) > 0);
    for (const s of this.sparks) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 380 * dt;
    }
    if (this.t > this.#nextBlink) this.#nextBlink = this.t + 2.5 + Math.random() * 2.5;
  }

  #updateWeather(dt: number): void {
    for (const drop of this.drops) {
      drop.x += drop.vx * dt;
      drop.y += drop.vy * dt;
      if (drop.y > VIEW_H + 20 || drop.x < -20) Object.assign(drop, newDrop(false));
    }
    if (Math.random() < dt * RIPPLES_PER_SECOND) {
      const x = this.cam + Math.random() * VIEW_W;
      const roll = Math.random();
      const water = roll < 0.45;
      let y: number;
      if (water) y = CANAL.top + 8 + Math.random() * (CANAL.bottom - CANAL.top - 14);
      else if (roll < 0.75) y = STREET.top - 6 + Math.random() * 70;
      else y = QUAY.top + Math.random() * 80;
      this.ripples.push({ x, y, life: 0, duration: RIPPLE_SECONDS, water });
    }
    this.ripples = this.ripples.filter((r) => (r.life += dt) < r.duration);
  }

  #movePlayer(dt: number): void {
    const p = this.player;
    const keys = this.#keys;
    let dx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    let dy = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);

    if (dx || dy) {
      // Keyboard input cancels click-to-walk.
      this.#path = null;
      this.#pending = null;
    } else if (this.#path) {
      const waypoint = this.#path[0];
      if (!waypoint) {
        this.#arrive();
      } else {
        const vx = waypoint.x - p.x;
        const vy = waypoint.y - p.y;
        const distance = Math.hypot(vx, vy);
        if (distance < 4) {
          this.#path.shift();
          if (this.#path.length === 0) this.#arrive();
        } else {
          dx = vx / distance;
          dy = vy / distance;
        }
      }
    }

    p.moving = false;
    if (!dx && !dy) return;

    const length = Math.hypot(dx, dy);
    dx /= length;
    dy /= length;
    const step = WALK_SPEED * dt;
    let moved = false;
    if (dx && isWalkable(p.x + dx * step, p.y, this.npcs)) {
      p.x += dx * step;
      moved = true;
    }
    if (dy && isWalkable(p.x, p.y + dy * step, this.npcs)) {
      p.y += dy * step;
      moved = true;
    } else if (dy && !moved) {
      // Slide toward a nearby bridge so keyboard players don't snag on the canal edge.
      const bridge = bridgeNear(p.x);
      if (bridge) {
        const sx = p.x + Math.sign(bridge.x + bridge.w / 2 - p.x) * step;
        if (isWalkable(sx, p.y, this.npcs)) {
          p.x = sx;
          moved = true;
        }
      }
    }

    if (Math.abs(dx) > Math.abs(dy)) p.facing = dx > 0 ? "right" : "left";
    else p.facing = dy > 0 ? "down" : "up";
    p.moving = moved;

    if (moved) {
      p.phase += dt * 13;
      this.#stuckFor = 0;
    } else if (this.#path && (this.#stuckFor += dt) > STUCK_SECONDS) {
      // Blocked short of the target: still interact if close enough.
      this.#path = null;
      this.#interactIfReached(this.#takePending());
    }
  }

  #arrive(): void {
    this.#path = null;
    const target = this.#takePending();
    if (!target) return;
    if (target.type === "npc") {
      const npc = this.npcs[target.index];
      if (npc) this.player.facing = npc.x > this.player.x ? "right" : "left";
    }
    if (target.type === "station") this.player.facing = "up";
    this.#interactIfReached(target);
  }

  #takePending(): Interactable | null {
    const target = this.#pending;
    this.#pending = null;
    return target;
  }

  #interactIfReached(target: Interactable | null): void {
    if (!target) return;
    this.#updateNear();
    if (this.#near && interactableKey(this.#near) === interactableKey(target)) this.#onInteract(this.#near);
  }

  #updateNear(): void {
    const p = this.player;
    let best: Interactable | null = null;
    let bestDistance = Infinity;
    for (const [index, n] of this.npcs.entries()) {
      const distance = Math.hypot(n.x - p.x, (n.y - p.y) * 1.4);
      if (distance < NPC_REACH && distance < bestDistance) {
        best = { type: "npc", index };
        bestDistance = distance;
      }
    }
    if (!best && Math.abs(p.x - STATION_X) < 60 && p.y < STREET.top + 40) best = { type: "station" };
    if (!best && Math.hypot(p.x - BOARD.x, p.y - BOARD.y) < 50) best = { type: "board" };

    if (interactableKey(best) !== interactableKey(this.#near)) {
      this.#near = best;
      this.#onNear(best);
    }
  }

  // ---- drawing -------------------------------------------------------------

  #draw(): void {
    const g = this.#g;
    g.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    g.imageSmoothingEnabled = false;
    if (this.#shakeFor > 0) {
      const magnitude = this.#shakeFor * 18;
      g.translate((Math.random() - 0.5) * magnitude, (Math.random() - 0.5) * magnitude);
    }
    if (this.interior) drawInterior(g, this);
    else drawStreet(g, this);

    g.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    g.drawImage(this.#vignette, 0, 0);
    if (this.attract) {
      // Darken the left side so the title text stays readable.
      const scrim = g.createLinearGradient(0, 0, VIEW_W, 0);
      scrim.addColorStop(0, "rgba(9,12,17,.9)");
      scrim.addColorStop(0.55, "rgba(9,12,17,.62)");
      scrim.addColorStop(1, "rgba(9,12,17,.5)");
      g.fillStyle = scrim;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }
}

function placeNpcs(npcs: Omit<Npc, "x" | "y">[]): Npc[] {
  return npcs.map((n, i) => ({ ...n, x: (NPC_HOUSE_X[i] ?? 0) + NPC_OFFSET_X, y: NPC_Y }));
}

function newPlayer(): Player {
  return { ...SPAWN, facing: "up", moving: false, phase: 0 };
}

function newDrop(anywhere: boolean): RainDrop {
  return {
    x: Math.random() * (VIEW_W + 120),
    y: anywhere ? Math.random() * VIEW_H : -20 - Math.random() * 60,
    vx: -110,
    vy: 560 + Math.random() * 200,
    len: 9 + Math.random() * 10,
  };
}

function interactableKey(target: Interactable | null): string {
  if (!target) return "";
  return target.type === "npc" ? `npc${target.index}` : target.type;
}

function makeVignette(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;
  const g = canvas.getContext("2d");
  if (!g) return canvas;
  const vignette = g.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.35, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.95);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,.6)");
  g.fillStyle = vignette;
  g.fillRect(0, 0, VIEW_W, VIEW_H);
  return canvas;
}
