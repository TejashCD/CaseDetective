import { NPC_LOOKS, type Look } from "./constants.ts";
import { shade } from "./math.ts";

export type Facing = "up" | "down" | "left" | "right";

export interface PersonStyle extends Look {
  coat: string;
  /** Size of one pixel unit. */
  scale: number;
  facing?: Facing;
  moving?: boolean;
  /** Walk-cycle phase. */
  phase?: number;
  /** Vertical breathing/step offset. */
  bob?: number;
  blink?: boolean;
  /** Mouth opening height; 0 is closed. */
  mouth?: number;
  shadow?: boolean;
}

const SHOE = "#121014";
const EYE = "#16171b";
const MOUTH = "#5a2620";

/** Draws a pixel-art person with their feet at (x, y). */
export function drawPerson(g: CanvasRenderingContext2D, x: number, y: number, o: PersonStyle): void {
  const u = o.scale;
  const b = o.bob ?? 0;
  const rect = (ux: number, uy: number, w: number, h: number, color: string) => {
    g.fillStyle = color;
    g.fillRect(x + ux * u, y - (uy + h) * u, w * u, h * u);
  };
  const facing = o.facing ?? "down";
  const dir = facing === "left" ? -1 : 1;
  const walk = o.moving ? Math.sin(o.phase ?? 0) : 0;
  const leftLift = walk > 0.25 ? 1 : 0;
  const rightLift = walk < -0.25 ? 1 : 0;
  const swing = o.moving ? walk * 0.8 : 0;
  const coatDark = o.coatDark ?? shade(o.coat, -0.32);

  if (o.shadow !== false) {
    g.fillStyle = "rgba(0,0,0,.38)";
    g.beginPath();
    g.ellipse(x, y, 6 * u, 1.7 * u, 0, 0, Math.PI * 2);
    g.fill();
  }

  // legs and shoes
  rect(-3, leftLift, 2, 6 - leftLift, o.pants);
  rect(1, rightLift, 2, 6 - rightLift, o.pants);
  rect(-3.3, leftLift, 2.6, 1, SHOE);
  rect(0.7, rightLift, 2.6, 1, SHOE);

  // arms
  rect(-5.6, 8 + b + swing, 1.6, 8.5, coatDark);
  rect(4, 8 + b - swing, 1.6, 8.5, coatDark);
  rect(-5.6, 7.2 + b + swing, 1.6, 1, o.skin);
  rect(4, 7.2 + b - swing, 1.6, 1, o.skin);

  // coat
  rect(-4.5, 5 + b, 9, 12, o.coat);
  rect(-4.5, 5 + b, 9, 1, coatDark);
  rect(-4.5, 10.5 + b, 9, 1, coatDark);
  if (facing !== "up") {
    rect(-0.4, 5 + b, 0.8, 10.5, coatDark);
    rect(-1.8, 15 + b, 3.6, 2, o.collar ?? "#ddd");
    if (o.tie) rect(-0.5, 12.2 + b, 1, 4, o.tie);
    rect(-4.5, 15.2 + b, 2.2, 1.8, coatDark);
    rect(2.3, 15.2 + b, 2.2, 1.8, coatDark);
  } else {
    rect(-4.5, 15.5 + b, 9, 1.5, coatDark);
  }

  // head
  rect(-1, 17 + b, 2, 1, o.skin);
  rect(-3, 18 + b, 6, 6, o.skin);
  if (facing === "up") {
    rect(-3, 18.5 + b, 6, 5.5, o.hair);
  } else {
    rect(-3, 22.6 + b, 6, 1.4, o.hair);
    if (o.longHair) {
      rect(-3.6, 16.5 + b, 1.2, 7, o.hair);
      rect(2.4, 16.5 + b, 1.2, 7, o.hair);
      rect(-3.6, 22.4 + b, 7.2, 2.2, o.hair);
    }
    if (o.beard) rect(-3, 18 + b, 6, 1.7, o.hair);
    const eyeH = o.blink ? 0.35 : 1;
    const eyeY = 20.6 + b + (o.blink ? 0.3 : 0);
    if (facing === "down") {
      rect(-2, eyeY, 1, eyeH, EYE);
      rect(1, eyeY, 1, eyeH, EYE);
      if (o.mouth) rect(-0.9, 18.9 + b, 1.8, o.mouth, MOUTH);
    } else {
      rect(dir > 0 ? 1.4 : -2.4, eyeY, 1, eyeH, EYE);
    }
  }

  // hat
  if (o.hat) {
    if (o.cap) {
      rect(-3.3, 23.8 + b, 6.6, 2.2, o.hat);
      rect(dir > 0 ? 1.5 : -4.5, 23.8 + b, 3, 0.7, shade(o.hat, -0.3));
    } else {
      rect(-4.6, 23.6 + b, 9.2, 1, o.hat);
      rect(-3, 24.6 + b, 6, 3, o.hat);
      rect(-3, 24.6 + b, 6, 0.8, o.band ?? "#111");
    }
  }
}

/** Witness `index` wearing a coat in their case colour. */
export function npcLook(index: number, color: string): Look & { coat: string } {
  const look = NPC_LOOKS[index % NPC_LOOKS.length] ?? NPC_LOOKS[0];
  return { ...look, coat: color, coatDark: shade(color, -0.35) };
}

const PORTRAIT_SIZE = 48;
const PORTRAIT_SCALE = 2;

/** Head-and-shoulders portrait for the conversation header. */
export function drawPortrait(canvas: HTMLCanvasElement, index: number, color: string): void {
  const g = canvas.getContext("2d");
  if (!g) return;
  canvas.width = PORTRAIT_SIZE * PORTRAIT_SCALE;
  canvas.height = PORTRAIT_SIZE * PORTRAIT_SCALE;
  g.setTransform(PORTRAIT_SCALE, 0, 0, PORTRAIT_SCALE, 0, 0);
  const bg = g.createLinearGradient(0, 0, 0, PORTRAIT_SIZE);
  bg.addColorStop(0, shade(color, -0.55));
  bg.addColorStop(1, shade(color, -0.8));
  g.fillStyle = bg;
  g.fillRect(0, 0, PORTRAIT_SIZE, PORTRAIT_SIZE);
  drawPerson(g, 24, 70, { ...npcLook(index, color), scale: 2.2, facing: "down", shadow: false });
}
