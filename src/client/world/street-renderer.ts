// One frame of the canal street: water, boats, people, lights, markers and rain.
import { drawPerson, npcLook } from "./characters.ts";
import {
  BENCHES,
  BIKES,
  BOARD,
  BRIDGES,
  CANAL,
  COLORS,
  FACADE_BASE,
  PLAYER_LOOK,
  QUAY_LAMPS,
  RENDER_SCALE,
  STATION_X,
  STREET_LAMPS,
  TREES,
  VIEW_H,
  VIEW_W,
  WORLD_W,
} from "./constants.ts";
import { isOnBridge } from "./navigation.ts";
import { drawBench, drawBike, drawGlow, drawLamp, drawNoticeBoard, drawTag, drawTree } from "./props.ts";
import type { RainDrop, Ripple, Scene } from "./types.ts";

interface Visible {
  x0: number;
  x1: number;
}

/** A lamp on a bridge would float over the water, so those are skipped. */
const VISIBLE_STREET_LAMPS = STREET_LAMPS.filter((l) => !isOnBridge(l.x));
const ALL_LAMPS = [...VISIBLE_STREET_LAMPS, ...QUAY_LAMPS];
const CULL_MARGIN = 40;
const TAG_DISTANCE = 170;

export function drawStreet(g: CanvasRenderingContext2D, world: Scene): void {
  const cam = Math.round(world.cam * RENDER_SCALE) / RENDER_SCALE;
  g.drawImage(world.scenery, cam * RENDER_SCALE, 0, VIEW_W * RENDER_SCALE, VIEW_H * RENDER_SCALE, 0, 0, VIEW_W, VIEW_H);

  g.save();
  g.translate(-cam, 0);
  const view: Visible = { x0: cam - CULL_MARGIN, x1: cam + VIEW_W + CULL_MARGIN };

  drawWater(g, world.t, view);
  drawBoats(g, world.t, view);
  drawRipples(g, world.ripples, view);
  drawBridges(g, view);
  drawEntities(g, world);
  drawLights(g, world, view);
  if (!world.attract) drawMarkers(g, world, view);
  g.restore();

  drawRain(g, world.drops);
  if (!world.attract) drawOffscreenArrows(g, world);
}

function drawWater(g: CanvasRenderingContext2D, t: number, { x0, x1 }: Visible): void {
  // shimmer
  for (let y = CANAL.top + 10, row = 0; y < CANAL.bottom - 8; y += 6, row++) {
    const speed = row % 2 ? 12 : -9;
    const offset = (((t * speed + row * 37) % 70) + 70) % 70;
    g.fillStyle = `rgba(120,170,205,${0.05 + (row % 3) * 0.025})`;
    for (let x = Math.floor(x0 / 70) * 70 - 70 + offset; x < x1; x += 70) {
      g.fillRect(x, y, 14 + ((row * 13 + Math.floor(x / 70)) % 4) * 6, 1);
    }
  }
  // lamp reflections
  for (const lamp of VISIBLE_STREET_LAMPS) {
    if (lamp.x < x0 || lamp.x > x1) continue;
    for (let y = CANAL.top + 10; y < CANAL.bottom - 10; y += 3) {
      const wobble = Math.sin(t * 2.4 + y * 0.25) * 3;
      const alpha = 0.28 * (1 - (y - CANAL.top) / (CANAL.bottom - CANAL.top));
      g.fillStyle = `rgba(245,175,85,${alpha})`;
      g.fillRect(lamp.x - 3 + wobble, y, 6 - (y % 2), 1.5);
    }
  }
}

function drawBoats(g: CanvasRenderingContext2D, t: number, { x0, x1 }: Visible): void {
  // moored houseboat
  const bob = Math.sin(t * 1.4) * 0.8;
  if (x1 > 1160 && x0 < 1420) {
    g.fillStyle = "#16261e";
    g.fillRect(1180, 408 + bob, 220, 22);
    g.fillStyle = "#24392d";
    g.fillRect(1180, 408 + bob, 220, 3);
    g.fillStyle = "#3b4e45";
    g.fillRect(1200, 388 + bob, 160, 22);
    g.fillStyle = "#1b2420";
    g.fillRect(1196, 384 + bob, 168, 5);
    for (let k = 0; k < 4; k++) {
      g.fillStyle = k === 2 ? "#151d22" : "#f0b85e";
      g.fillRect(1214 + k * 36, 393 + bob, 16, 10);
    }
    g.fillStyle = "#3d6a3a";
    g.fillRect(1226, 378 + bob, 10, 6);
    g.fillRect(1320, 377 + bob, 14, 7);
  }
  // drifting rowboat
  const bx = ((t * 14) % (WORLD_W + 300)) - 150;
  if (bx > x0 - 60 && bx < x1) {
    g.fillStyle = "#3b2618";
    g.beginPath();
    g.moveTo(bx - 26, 374);
    g.lineTo(bx + 26, 374);
    g.lineTo(bx + 18, 384);
    g.lineTo(bx - 18, 384);
    g.closePath();
    g.fill();
    g.fillStyle = "#5a3a22";
    g.fillRect(bx - 22, 374, 44, 2);
  }
}

function drawRipples(g: CanvasRenderingContext2D, ripples: readonly Ripple[], { x0, x1 }: Visible): void {
  g.lineWidth = 1;
  for (const r of ripples) {
    if (r.x < x0 || r.x > x1) continue;
    const k = r.life / r.duration;
    g.strokeStyle = r.water ? `rgba(150,190,220,${0.35 * (1 - k)})` : `rgba(160,175,195,${0.22 * (1 - k)})`;
    g.beginPath();
    g.ellipse(r.x, r.y, 2 + k * (r.water ? 9 : 5), 0.6 + k * (r.water ? 2.4 : 1.4), 0, 0, Math.PI * 2);
    g.stroke();
  }
}

function drawBridges(g: CanvasRenderingContext2D, { x0, x1 }: Visible): void {
  const span = CANAL.bottom - CANAL.top;
  for (const b of BRIDGES) {
    if (b.x + b.w < x0 || b.x > x1) continue;
    g.fillStyle = "rgba(0,0,0,.45)";
    g.fillRect(b.x - 8, CANAL.top + 6, 8, span - 12);
    g.fillRect(b.x + b.w, CANAL.top + 6, 8, span - 12);
    g.fillStyle = "#4a4440";
    g.fillRect(b.x, CANAL.top - 6, b.w, span + 14);
    g.fillStyle = "#423c38";
    for (let y = CANAL.top - 4; y < CANAL.bottom + 8; y += 6) g.fillRect(b.x + 8, y, b.w - 16, 1);
    g.fillStyle = "#1c1e23";
    g.fillRect(b.x, CANAL.top - 10, 7, span + 20);
    g.fillRect(b.x + b.w - 7, CANAL.top - 10, 7, span + 20);
    g.fillStyle = "#3a3d44";
    for (let y = CANAL.top - 8; y < CANAL.bottom + 10; y += 14) {
      g.fillRect(b.x + 1, y, 5, 3);
      g.fillRect(b.x + b.w - 6, y, 5, 3);
    }
  }
}

/** Props and people, sorted by y so nearer things overlap farther ones. */
function drawEntities(g: CanvasRenderingContext2D, world: Scene): void {
  const { t, player } = world;
  const entities: { y: number; draw: () => void }[] = [];
  for (const l of ALL_LAMPS) entities.push({ y: l.y, draw: () => drawLamp(g, l.x, l.y) });
  for (const tr of TREES) entities.push({ y: tr.y, draw: () => drawTree(g, tr.x, tr.y) });
  for (const bn of BENCHES) entities.push({ y: bn.y, draw: () => drawBench(g, bn.x, bn.y) });
  for (const bk of BIKES) entities.push({ y: bk.y, draw: () => drawBike(g, bk.x, bk.y, bk.color) });
  entities.push({ y: BOARD.y, draw: () => drawNoticeBoard(g) });

  world.npcs.forEach((n, i) => {
    const facing = player.x < n.x - 20 ? "left" : player.x > n.x + 20 ? "right" : ("down" as const);
    entities.push({
      y: n.y,
      draw: () =>
        drawPerson(g, n.x, n.y, {
          ...npcLook(i, n.color),
          scale: 2,
          facing,
          bob: Math.sin(t * 2 + i) > 0.6 ? 0.5 : 0,
          blink: world.isBlinking(0.12),
        }),
    });
  });

  if (!world.attract) {
    entities.push({
      y: player.y,
      draw: () =>
        drawPerson(g, player.x, player.y, {
          ...PLAYER_LOOK,
          scale: 2,
          facing: player.facing,
          moving: player.moving,
          phase: player.phase,
          bob: player.moving && Math.sin(player.phase * 2) > 0 ? 0.5 : 0,
        }),
    });
  }

  entities.sort((a, b) => a.y - b.y).forEach((e) => e.draw());
}

function drawLights(g: CanvasRenderingContext2D, world: Scene, { x0, x1 }: Visible): void {
  const t = world.t;
  const glow = (x: number, y: number, radius: number, color: string) => {
    if (x < x0 - radius || x > x1 + radius) return;
    drawGlow(g, x, y, radius, color);
  };

  g.globalCompositeOperation = "lighter";
  for (const l of ALL_LAMPS) {
    const flicker = 0.95 + Math.sin(t * 9 + l.x) * 0.03;
    glow(l.x, l.y - 80, 120, `rgba(255,170,70,${0.2 * flicker})`);
    glow(l.x, l.y - 80, 22, "rgba(255,210,140,.45)");
    glow(l.x, l.y - 2, 46, "rgba(255,170,70,.1)");
  }
  for (const w of world.litWindows) {
    glow(w.x, w.y, w.big ? 56 : 22, w.cold ? "rgba(140,180,255,.16)" : `rgba(255,170,70,${w.big ? 0.16 : 0.1})`);
  }
  const policeBlue = 0.25 + (Math.sin(t * 3) * 0.5 + 0.5) * 0.25;
  glow(STATION_X, FACADE_BASE - 125, 90, `rgba(70,130,255,${policeBlue})`);
  g.globalCompositeOperation = "source-over";
}

/** "?" or check marks over witnesses, the "!" over the station, and name tags near the player. */
function drawMarkers(g: CanvasRenderingContext2D, world: Scene, { x0, x1 }: Visible): void {
  const { t, player, npcs } = world;
  const allEarned = world.allCluesEarned;

  for (const n of npcs) {
    if (n.x < x0 || n.x > x1) continue;
    const y = n.y - 74 + Math.sin(t * 3 + n.x) * 2.5;
    if (n.earned) drawCheckMarker(g, n.x, y);
    else drawQuestionMarker(g, n.x, y);
    if (n.name && Math.hypot(player.x - n.x, player.y - n.y) < TAG_DISTANCE) drawTag(g, n.x, n.y - 94, n.name, n.color);
  }

  if (STATION_X > x0 && STATION_X < x1) {
    const y = FACADE_BASE - 152 + Math.sin(t * 3) * 2.5;
    if (allEarned) {
      g.fillStyle = COLORS.amber;
      g.beginPath();
      g.arc(STATION_X, y, 10, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = COLORS.amberInk;
      g.font = '700 14px "IBM Plex Sans", sans-serif';
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("!", STATION_X, y + 0.5);
    }
    if (Math.abs(player.x - STATION_X) < 220) {
      drawTag(
        g,
        STATION_X,
        FACADE_BASE - 172,
        allEarned ? "Politiebureau: make your case" : "Politiebureau: needs 3 clues",
        allEarned ? COLORS.amber : COLORS.dim,
      );
    }
  }

  if (Math.hypot(player.x - BOARD.x, player.y - BOARD.y) < 140) drawTag(g, BOARD.x, BOARD.y - 76, "Case notice", COLORS.paper);
}

function drawCheckMarker(g: CanvasRenderingContext2D, x: number, y: number): void {
  g.fillStyle = COLORS.green;
  g.beginPath();
  g.arc(x, y, 8, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = COLORS.ink;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(x - 3.5, y);
  g.lineTo(x - 1, y + 3);
  g.lineTo(x + 4, y - 3);
  g.stroke();
}

function drawQuestionMarker(g: CanvasRenderingContext2D, x: number, y: number): void {
  g.save();
  g.translate(x, y);
  g.rotate(Math.PI / 4);
  g.fillStyle = COLORS.amber;
  g.fillRect(-7, -7, 14, 14);
  g.restore();
  g.fillStyle = COLORS.amberInk;
  g.font = '700 12px "IBM Plex Sans", sans-serif';
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("?", x, y + 0.5);
}

/** Rain streaks, in screen space. */
function drawRain(g: CanvasRenderingContext2D, drops: readonly RainDrop[]): void {
  g.strokeStyle = "rgba(175,195,225,.26)";
  g.lineWidth = 1;
  g.beginPath();
  for (const d of drops) {
    g.moveTo(d.x, d.y);
    g.lineTo(d.x + d.vx * 0.022, d.y - d.len);
  }
  g.stroke();
}

/** Edge-of-screen arrows to the witnesses still needed, then to the station. */
function drawOffscreenArrows(g: CanvasRenderingContext2D, world: Scene): void {
  const targets = world.allCluesEarned
    ? [{ x: STATION_X, color: COLORS.amber }]
    : world.npcs.filter((n) => !n.earned).map((n) => ({ x: n.x, color: n.color }));
  const pulse = 0.65 + Math.sin(world.t * 4) * 0.25;
  const ay = 300;

  for (const target of targets) {
    const sx = target.x - world.cam;
    if (sx > -10 && sx < VIEW_W + 10) continue;
    const left = sx < 0;
    const ax = left ? 16 : VIEW_W - 16;
    g.globalAlpha = pulse;
    g.fillStyle = target.color;
    g.beginPath();
    g.moveTo(ax + (left ? -6 : 6), ay);
    g.lineTo(ax + (left ? 8 : -8), ay - 9);
    g.lineTo(ax + (left ? 8 : -8), ay + 9);
    g.closePath();
    g.fill();
    g.globalAlpha = 1;
  }
}
