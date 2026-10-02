// The interview room: the witness behind their desk, seen over the detective's shoulder.
import { drawPerson, npcLook } from "./characters.ts";
import { VIEW_H, VIEW_W } from "./constants.ts";
import { pick, seededRandom, shade, type Random } from "./math.ts";
import { drawGlow } from "./props.ts";
import type { Scene } from "./types.ts";

const FLOWER_COLORS = ["#d9475e", "#f0c24a", "#e7e0d0", "#b05ad0", "#e8743b"];
const LEDGER_COLORS = ["#5a1f22", "#1f3a5a", "#2e4a2e", "#5a4a2a", "#3a2a4a"];
const JAR_COLORS = ["#c9a14a", "#8a5a2a", "#6a8a3a"];

export function drawInterior(g: CanvasRenderingContext2D, world: Scene): void {
  if (!world.interior) return;
  const index = world.interior.index;
  const npc = world.npcs[index];
  if (!npc) return;
  const t = world.t;
  // Re-seeded every frame so the random details stay in place.
  const random = seededRandom(100 + index);

  drawRoom(g, npc.color);
  drawWindow(g, random, t);
  drawShelves(g, random, index);
  drawDecor(g, npc.color);
  drawWitness(g, world, index, npc.color);
  drawDesk(g, npc.earned);
  drawRoomLight(g);
  if (world.thinking) drawThinking(g, t);
  drawDetectiveShoulder(g);
  drawCelebration(g, world);
}

function drawRoom(g: CanvasRenderingContext2D, tint: string): void {
  // wall panelling
  g.fillStyle = shade(tint, -0.78);
  g.fillRect(0, 0, VIEW_W, 330);
  g.fillStyle = shade(tint, -0.72);
  for (let x = 0; x < VIEW_W; x += 28) g.fillRect(x, 0, 12, 300);
  // wainscot
  g.fillStyle = "#2a1c14";
  g.fillRect(0, 300, VIEW_W, 100);
  g.fillStyle = "#33231a";
  for (let x = 16; x < VIEW_W; x += 120) g.fillRect(x, 314, 100, 70);
  g.fillStyle = "#4a3324";
  g.fillRect(0, 298, VIEW_W, 5);
  // floor
  g.fillStyle = "#1e150f";
  g.fillRect(0, 400, VIEW_W, 140);
  g.fillStyle = "#17100b";
  for (let y = 410; y < VIEW_H; y += 16) g.fillRect(0, y, VIEW_W, 1);
}

function drawWindow(g: CanvasRenderingContext2D, random: Random, t: number): void {
  const wx = 690;
  const wy = 70;
  g.fillStyle = "#3a281c";
  g.fillRect(wx - 10, wy - 10, 200, 220);
  const night = g.createLinearGradient(0, wy, 0, wy + 200);
  night.addColorStop(0, "#0a1322");
  night.addColorStop(1, "#18263a");
  g.fillStyle = night;
  g.fillRect(wx, wy, 180, 200);
  // houses across the canal
  g.fillStyle = "#0e1828";
  g.fillRect(wx, wy + 110, 180, 90);
  for (let k = 0; k < 9; k++) {
    g.fillStyle = random() < 0.5 ? "#e9a23b" : "#152033";
    g.fillRect(wx + 10 + k * 19, wy + 128 + (k % 3) * 18, 8, 10);
  }
  // rain on the glass
  g.save();
  g.beginPath();
  g.rect(wx, wy, 180, 200);
  g.clip();
  g.strokeStyle = "rgba(170,200,235,.35)";
  g.lineWidth = 1;
  g.beginPath();
  for (let k = 0; k < 26; k++) {
    const dx = wx + ((k * 53) % 180);
    const dy = wy + ((t * (90 + (k % 5) * 25) + k * 37) % 230) - 20;
    g.moveTo(dx, dy);
    g.lineTo(dx - 1, dy + 9);
  }
  g.stroke();
  g.restore();
  // frame and sill
  g.fillStyle = "#3a281c";
  g.fillRect(wx + 86, wy, 8, 200);
  g.fillRect(wx, wy + 96, 180, 8);
  g.fillStyle = "#5a3e2a";
  g.fillRect(wx - 16, wy + 206, 212, 8);
}

/** Shelves themed per witness: flower pots, ledgers, or jars and crates. */
function drawShelves(g: CanvasRenderingContext2D, random: Random, index: number): void {
  const theme = index % 3;
  for (let s = 0; s < 3; s++) {
    const sy = 120 + s * 62;
    g.fillStyle = "#4a3324";
    g.fillRect(60, sy, 250, 6);
    g.fillStyle = "rgba(0,0,0,.3)";
    g.fillRect(60, sy + 6, 250, 3);
    let x = 70;
    while (x < 296) {
      if (theme === 0) x += drawFlowerPot(g, random, x, sy);
      else if (theme === 1) x += drawLedger(g, random, x, sy);
      else x += random() < 0.5 ? drawJar(g, random, x, sy) : drawCrate(g, x, sy);
    }
  }
}

function drawFlowerPot(g: CanvasRenderingContext2D, random: Random, x: number, sy: number): number {
  g.fillStyle = "#7a4a2e";
  g.fillRect(x, sy - 16, 14, 16);
  const flower = pick(random, FLOWER_COLORS);
  g.fillStyle = "#3d6a3a";
  g.fillRect(x + 6, sy - 28, 2, 12);
  g.fillStyle = flower;
  g.fillRect(x + 2, sy - 34, 10, 8);
  return 22;
}

function drawLedger(g: CanvasRenderingContext2D, random: Random, x: number, sy: number): number {
  const h = 26 + random() * 18;
  g.fillStyle = pick(random, LEDGER_COLORS);
  g.fillRect(x, sy - h, 9, h);
  g.fillStyle = "rgba(230,200,120,.5)";
  g.fillRect(x + 2, sy - h + 5, 5, 1);
  return 10 + (random() < 0.15 ? 12 : 0);
}

function drawJar(g: CanvasRenderingContext2D, random: Random, x: number, sy: number): number {
  g.fillStyle = "rgba(180,200,170,.35)";
  g.fillRect(x, sy - 22, 14, 22);
  g.fillStyle = pick(random, JAR_COLORS);
  g.fillRect(x + 1, sy - 14, 12, 13);
  g.fillStyle = "#3a2a1a";
  g.fillRect(x - 1, sy - 25, 16, 3);
  return 20;
}

function drawCrate(g: CanvasRenderingContext2D, x: number, sy: number): number {
  g.fillStyle = "#6b4a2a";
  g.fillRect(x, sy - 24, 26, 24);
  g.fillStyle = "#4a321c";
  g.fillRect(x, sy - 13, 26, 2);
  g.fillRect(x + 12, sy - 24, 2, 24);
  return 32;
}

function drawDecor(g: CanvasRenderingContext2D, tint: string): void {
  // framed picture
  g.fillStyle = "#5a3e2a";
  g.fillRect(400, 80, 120, 86);
  g.fillStyle = shade(tint, -0.45);
  g.fillRect(408, 88, 104, 70);
  g.fillStyle = shade(tint, -0.2);
  g.fillRect(420, 120, 80, 30);

  // hanging lamp
  g.fillStyle = "#111";
  g.fillRect(479, 0, 2, 54);
  g.fillStyle = "#2a3a2a";
  g.beginPath();
  g.moveTo(460, 70);
  g.lineTo(500, 70);
  g.lineTo(490, 54);
  g.lineTo(470, 54);
  g.closePath();
  g.fill();
  g.fillStyle = "#ffe0a0";
  g.fillRect(470, 70, 20, 3);
}

function drawWitness(g: CanvasRenderingContext2D, world: Scene, index: number, color: string): void {
  const t = world.t;
  const mouth = world.speaking ? (Math.sin(t * 22) > 0 ? 1 : 0.4) : 0;
  const breathe = Math.sin(t * 1.8) > 0.3 ? 0.4 : 0;
  drawPerson(g, 480, 444, {
    ...npcLook(index, color),
    scale: 8,
    facing: "down",
    bob: breathe,
    blink: world.isBlinking(0.13),
    mouth: mouth || 0.01,
    shadow: false,
  });
}

function drawDesk(g: CanvasRenderingContext2D, clueEarned: boolean): void {
  g.fillStyle = "#4a3122";
  g.fillRect(150, 392, 660, 148);
  g.fillStyle = "#6b4a33";
  g.fillRect(140, 384, 680, 12);
  g.fillStyle = "#3a2619";
  g.fillRect(170, 410, 290, 110);
  g.fillRect(500, 410, 290, 110);
  g.fillStyle = "#2a1b12";
  g.fillRect(300, 460, 30, 4);
  g.fillRect(630, 460, 30, 4);

  // papers
  g.save();
  g.translate(600, 380);
  g.rotate(-0.06);
  g.fillStyle = "#e7dcc3";
  g.fillRect(0, -6, 70, 10);
  g.fillStyle = "#d8cbb0";
  g.fillRect(8, -9, 64, 6);
  g.restore();

  // desk lamp
  g.fillStyle = "#1b1d22";
  g.fillRect(232, 350, 4, 36);
  g.fillRect(222, 382, 24, 4);
  g.fillStyle = "#2f4a3a";
  g.beginPath();
  g.moveTo(214, 352);
  g.lineTo(254, 352);
  g.lineTo(244, 336);
  g.lineTo(224, 336);
  g.closePath();
  g.fill();

  // stamped evidence, once earned
  if (clueEarned) {
    g.save();
    g.translate(380, 374);
    g.rotate(0.05);
    g.fillStyle = "#efe6d2";
    g.fillRect(0, 0, 70, 12);
    g.fillStyle = "#2f7a3a";
    g.fillRect(48, 2, 16, 8);
    g.restore();
  }
}

function drawRoomLight(g: CanvasRenderingContext2D): void {
  g.globalCompositeOperation = "lighter";
  drawGlow(g, 480, 80, 330, "rgba(255,180,90,.18)");
  drawGlow(g, 234, 360, 120, "rgba(255,190,110,.2)");
  drawGlow(g, 780, 170, 160, "rgba(110,150,220,.07)");
  g.globalCompositeOperation = "source-over";
}

/** Pulsing dots while waiting for the server. */
function drawThinking(g: CanvasRenderingContext2D, t: number): void {
  for (let k = 0; k < 3; k++) {
    const alpha = 0.35 + 0.65 * (Math.sin(t * 6 - k * 0.9) * 0.5 + 0.5);
    g.fillStyle = `rgba(233,226,212,${alpha})`;
    g.beginPath();
    g.arc(560 + k * 18, 170 - k * 8, 5 + k, 0, Math.PI * 2);
    g.fill();
  }
}

function drawDetectiveShoulder(g: CanvasRenderingContext2D): void {
  g.fillStyle = "#07090c";
  g.beginPath();
  g.ellipse(160, 600, 190, 120, 0, 0, Math.PI * 2);
  g.fill();
  g.fillRect(96, 382, 128, 120);
  g.beginPath();
  g.ellipse(160, 434, 104, 16, -0.05, 0, Math.PI * 2);
  g.fill();
  g.fillRect(110, 376, 100, 60);
  g.fillStyle = "#1a140f";
  g.fillRect(110, 418, 100, 8);
}

/** Sparks and a warm flash when a clue is earned. */
function drawCelebration(g: CanvasRenderingContext2D, world: Scene): void {
  for (const s of world.sparks) {
    g.fillStyle = `rgba(255,${190 + Math.floor(s.life * 40)},90,${Math.min(1, s.life)})`;
    g.fillRect(s.x, s.y, 3, 3);
  }
  if (world.flash > 0) {
    g.fillStyle = `rgba(255,236,190,${world.flash * 0.35})`;
    g.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}
