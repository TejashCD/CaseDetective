// Static street layer: sky, houses, shops, police station, cobbles and canal.
// Drawn once per case into an offscreen canvas, then copied every frame.
import { CANAL, DEFAULT_SHOPS, FACADE_BASE, NPC_HOUSE_X, RENDER_SCALE, STATION_X, VIEW_H, WORLD_W, type ShopFront } from "./constants.ts";
import { pick, seededRandom, shade, type Random } from "./math.ts";

const CITY_SEED = 417;
const STATION_SEED = 9;
const HOUSE_COLORS = ["#4a2a24", "#3a3540", "#5a3d2c", "#2d3a3d", "#4b3033", "#40382f", "#33303a", "#553226", "#36402f"];
type Gable = "step" | "bell" | "neck" | "spout" | "flat";
const GABLES: readonly Gable[] = ["step", "bell", "neck", "spout", "flat"];
const SHOP_GABLES: readonly Gable[] = ["step", "bell", "neck"];
const SHOP_COLORS = ["#5a2e2a", "#2f3a48", "#4a3f2c"];
const SHOP_WIDTH = 164;
const STATION_WIDTH = 248;

/** A light source that gets a glow in the street renderer. */
export interface LitWindow {
  x: number;
  y: number;
  big?: boolean;
  /** Blue-white instead of warm. */
  cold?: boolean;
}

export interface Scenery {
  canvas: HTMLCanvasElement;
  litWindows: LitWindow[];
}

export function buildScenery(shops: readonly ShopFront[], reuse: HTMLCanvasElement | null = null): Scenery {
  const canvas = reuse ?? document.createElement("canvas");
  canvas.width = WORLD_W * RENDER_SCALE;
  canvas.height = VIEW_H * RENDER_SCALE;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("Canvas 2D is not supported");
  g.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);

  const painter = new SceneryPainter(g, seededRandom(CITY_SEED), shops);
  painter.paint();
  return { canvas, litWindows: painter.litWindows };
}

class SceneryPainter {
  readonly litWindows: LitWindow[] = [];
  readonly g: CanvasRenderingContext2D;
  readonly random: Random;
  readonly shops: readonly ShopFront[];

  constructor(g: CanvasRenderingContext2D, random: Random, shops: readonly ShopFront[]) {
    this.g = g;
    this.random = random;
    this.shops = shops;
  }

  paint(): void {
    this.sky();
    this.facades();
    this.streetAndCanal();
  }

  sky(): void {
    const { g, random: r } = this;
    const sky = g.createLinearGradient(0, 0, 0, FACADE_BASE);
    sky.addColorStop(0, "#070b14");
    sky.addColorStop(1, "#16223a");
    g.fillStyle = sky;
    g.fillRect(0, 0, WORLD_W, FACADE_BASE);

    // Moon
    const moon = g.createRadialGradient(1690, 44, 4, 1690, 44, 90);
    moon.addColorStop(0, "rgba(220,215,195,.35)");
    moon.addColorStop(1, "rgba(220,215,195,0)");
    g.fillStyle = moon;
    g.fillRect(1590, 0, 200, 140);
    g.fillStyle = "#d9d3bf";
    g.beginPath();
    g.arc(1690, 44, 13, 0, Math.PI * 2);
    g.fill();

    // Distant skyline and a church tower
    g.fillStyle = "#0e1626";
    for (let x = 0; x < WORLD_W; x += 40 + r() * 40) g.fillRect(x, 120 + r() * 40, 50 + r() * 40, 200);
    g.fillRect(1196, 40, 28, 200);
    g.beginPath();
    g.moveTo(1190, 42);
    g.lineTo(1210, -6);
    g.lineTo(1230, 42);
    g.fill();
  }

  /** Random canal houses, leaving gaps for the shops and the station. */
  facades(): void {
    const r = this.random;
    const landmarks = [
      ...NPC_HOUSE_X.map((x, i) => ({ x0: x - 82, x1: x + 82, draw: () => this.shopHouse(x, i) })),
      { x0: STATION_X - 124, x1: STATION_X + 124, draw: () => this.station(STATION_X) },
    ].sort((a, b) => a.x0 - b.x0);
    const end = { x0: WORLD_W + 40, x1: WORLD_W + 40, draw: () => {} };

    let x = -30;
    for (const landmark of [...landmarks, end]) {
      while (x < landmark.x0 - 4) {
        let w = 92 + Math.floor(r() * 56);
        if (landmark.x0 - x - w < 70) w = landmark.x0 - x;
        this.house(x, w, 170 + r() * 60, pick(r, HOUSE_COLORS), pick(r, GABLES));
        x += w;
      }
      landmark.draw();
      x = landmark.x1;
    }
  }

  streetAndCanal(): void {
    const { g, random: r } = this;
    // Sidewalk slabs
    g.fillStyle = "#2a2e35";
    g.fillRect(0, FACADE_BASE, WORLD_W, 14);
    g.fillStyle = "#23272d";
    for (let sx = 0; sx < WORLD_W; sx += 34) g.fillRect(sx, FACADE_BASE, 1, 14);
    // Street cobbles
    this.cobbles(r, FACADE_BASE + 14, CANAL.top - 6, ["#2f343c", "#2b3038", "#33383f", "#2d3239"], "#1d2026");
    // Curb, canal walls, water
    g.fillStyle = "#4b4d53";
    g.fillRect(0, CANAL.top - 6, WORLD_W, 6);
    g.fillStyle = "#5a5c62";
    g.fillRect(0, CANAL.top - 6, WORLD_W, 1.5);
    this.brick(CANAL.top, 6);
    const water = g.createLinearGradient(0, CANAL.top + 6, 0, CANAL.bottom);
    water.addColorStop(0, "#08161f");
    water.addColorStop(1, "#0d2430");
    g.fillStyle = water;
    g.fillRect(0, CANAL.top + 6, WORLD_W, CANAL.bottom - CANAL.top - 12);
    this.brick(CANAL.bottom - 6, 6);
    g.fillStyle = "#4b4d53";
    g.fillRect(0, CANAL.bottom, WORLD_W, 8);
    g.fillStyle = "#5a5c62";
    g.fillRect(0, CANAL.bottom, WORLD_W, 1.5);
    // Quay
    this.cobbles(r, CANAL.bottom + 8, VIEW_H, ["#2a2e35", "#272b31", "#2d3138", "#25292f"], "#1a1d22");
  }

  cobbles(r: Random, y0: number, y1: number, colors: readonly string[], gap: string): void {
    const g = this.g;
    g.fillStyle = gap;
    g.fillRect(0, y0, WORLD_W, y1 - y0);
    for (let y = y0, row = 0; y < y1; y += 8, row++) {
      for (let x = row % 2 ? -6 : 0; x < WORLD_W; x += 12) {
        g.fillStyle = pick(r, colors);
        g.fillRect(x + 1, y + 1, 10, Math.min(6.5, y1 - y - 1));
      }
    }
  }

  brick(y: number, h: number): void {
    const g = this.g;
    g.fillStyle = "#3a2c26";
    g.fillRect(0, y, WORLD_W, h);
    g.fillStyle = "#2a1f1b";
    for (let x = 0; x < WORLD_W; x += 10) g.fillRect(x, y, 1, h);
    g.fillRect(0, y + h / 2, WORLD_W, 1);
  }

  windows(r: Random, x: number, w: number, top: number, bottom: number, litChance = 0.38): void {
    const g = this.g;
    const cols = Math.max(2, Math.floor((w - 14) / 32));
    const spacing = w / cols;
    for (let wy = top; wy < bottom - 30; wy += 44) {
      for (let c = 0; c < cols; c++) {
        const wx = x + spacing * (c + 0.5) - 9;
        const lit = r() < litChance;
        if (lit) {
          const glass = g.createLinearGradient(0, wy, 0, wy + 28);
          glass.addColorStop(0, "#f7c86d");
          glass.addColorStop(1, "#d9892c");
          g.fillStyle = glass;
          this.litWindows.push({ x: wx + 9, y: wy + 14 });
        } else {
          g.fillStyle = "#121a26";
        }
        g.fillRect(wx, wy, 18, 28);
        if (!lit) {
          g.fillStyle = "#1f2c40";
          g.fillRect(wx + 2, wy + 2, 3, 10);
        }
        // Frame and sill
        g.fillStyle = lit ? "#5a3a1a" : "#0a0f16";
        g.fillRect(wx + 8.5, wy, 1, 28);
        g.fillRect(wx, wy + 11, 18, 1);
        g.fillStyle = "rgba(200,190,170,.35)";
        g.fillRect(wx - 1, wy + 28, 20, 1.5);
      }
    }
  }

  gable(x: number, w: number, top: number, bodyTop: number, kind: Gable): void {
    const g = this.g;
    g.beginPath();
    if (kind === "step") {
      const sw = w * 0.12;
      g.moveTo(x, bodyTop);
      for (let k = 0; k < 3; k++) {
        g.lineTo(x + sw * k, bodyTop - 11 * (k + 1));
        g.lineTo(x + sw * (k + 1), bodyTop - 11 * (k + 1));
      }
      g.lineTo(x + sw * 3, top);
      g.lineTo(x + w - sw * 3, top);
      for (let k = 2; k >= 0; k--) {
        g.lineTo(x + w - sw * (k + 1), bodyTop - 11 * (k + 1));
        g.lineTo(x + w - sw * k, bodyTop - 11 * (k + 1));
      }
      g.lineTo(x + w, bodyTop);
    } else if (kind === "bell") {
      g.moveTo(x, bodyTop);
      g.quadraticCurveTo(x + w * 0.28, bodyTop, x + w * 0.3, top + 14);
      g.lineTo(x + w * 0.3, top + 6);
      g.quadraticCurveTo(x + w / 2, top - 8, x + w * 0.7, top + 6);
      g.lineTo(x + w * 0.7, top + 14);
      g.quadraticCurveTo(x + w * 0.72, bodyTop, x + w, bodyTop);
    } else if (kind === "neck") {
      g.moveTo(x, bodyTop);
      g.lineTo(x, bodyTop - 10);
      g.quadraticCurveTo(x + w * 0.25, bodyTop - 10, x + w * 0.3, bodyTop - 24);
      g.lineTo(x + w * 0.3, top);
      g.lineTo(x + w * 0.7, top);
      g.lineTo(x + w * 0.7, bodyTop - 24);
      g.quadraticCurveTo(x + w * 0.75, bodyTop - 10, x + w, bodyTop - 10);
      g.lineTo(x + w, bodyTop);
    } else if (kind === "spout") {
      g.moveTo(x, bodyTop);
      g.lineTo(x + w / 2, top);
      g.lineTo(x + w, bodyTop);
    } else {
      g.rect(x, bodyTop - 8, w, 8);
    }
    g.closePath();
    g.fill();
  }

  house(x: number, w: number, h: number, color: string, kind: Gable): void {
    const { g, random: r } = this;
    const top = FACADE_BASE - h;
    const bodyTop = kind === "flat" ? top + 8 : top + 46;
    g.fillStyle = color;
    g.fillRect(x, bodyTop, w, FACADE_BASE - bodyTop);
    this.gable(x, w, top, bodyTop, kind);
    // Brick texture
    g.fillStyle = "rgba(0,0,0,.12)";
    for (let y = bodyTop + 4; y < FACADE_BASE; y += 6) g.fillRect(x, y, w, 1);
    // Party wall shadow
    g.fillStyle = "rgba(0,0,0,.35)";
    g.fillRect(x, top, 2, h);
    // Cornice
    g.fillStyle = "#77706a";
    g.fillRect(x - 1, bodyTop - 2, w + 2, 3);
    if (kind !== "flat") {
      // Hoist beam
      g.fillStyle = "#17110d";
      g.fillRect(x + w / 2 - 2, top + 10, 4, 9);
      g.fillRect(x + w / 2 - 1, top + 19, 2, 4);
      // Gable window
      const lit = r() < 0.35;
      g.fillStyle = lit ? "#e9a23b" : "#121a26";
      g.fillRect(x + w / 2 - 6, bodyTop - 30, 12, 16);
      if (lit) this.litWindows.push({ x: x + w / 2, y: bodyTop - 22 });
    }
    this.windows(r, x, w, bodyTop + 12, FACADE_BASE - 46);
    // Door and steps
    const dx = x + w / 2 - 10;
    g.fillStyle = "#1e140e";
    g.fillRect(dx, FACADE_BASE - 40, 20, 40);
    g.fillStyle = r() < 0.5 ? "#d9a14a" : "#2a3446";
    g.fillRect(dx + 2, FACADE_BASE - 38, 16, 6);
    g.fillStyle = "#3a2216";
    g.fillRect(dx + 3, FACADE_BASE - 29, 6, 27);
    g.fillRect(dx + 11, FACADE_BASE - 29, 6, 27);
    g.fillStyle = "#55504a";
    g.fillRect(dx - 4, FACADE_BASE - 3, 28, 3);
  }

  /** A witness's shop: lit windows, an awning in their colour and a sign over the door. */
  shopHouse(cx: number, i: number): void {
    const g = this.g;
    const shop = this.shops[i] ?? DEFAULT_SHOPS[i] ?? { sign: "", color: "#555555" };
    const w = SHOP_WIDTH;
    const x = cx - w / 2;
    this.house(x, w, 214, SHOP_COLORS[i] ?? "#4a3f2c", SHOP_GABLES[i] ?? "step");

    // Shop front
    g.fillStyle = "#16100c";
    g.fillRect(x + 8, FACADE_BASE - 64, w - 16, 64);
    const glass = g.createLinearGradient(0, FACADE_BASE - 56, 0, FACADE_BASE);
    glass.addColorStop(0, "#ffd486");
    glass.addColorStop(1, "#c4752a");
    g.fillStyle = glass;
    g.fillRect(x + 14, FACADE_BASE - 54, 46, 42);
    g.fillRect(x + w - 60, FACADE_BASE - 54, 46, 42);
    this.litWindows.push({ x: x + 37, y: FACADE_BASE - 34, big: true }, { x: x + w - 37, y: FACADE_BASE - 34, big: true });
    g.fillStyle = "rgba(60,30,10,.55)";
    for (let k = 0; k < 4; k++) {
      g.fillRect(x + 18 + k * 11, FACADE_BASE - 24 - (k % 2) * 6, 7, 12 + (k % 2) * 6);
      g.fillRect(x + w - 56 + k * 11, FACADE_BASE - 26 + (k % 2) * 4, 7, 14 - (k % 2) * 4);
    }

    // Lit doorway
    g.fillStyle = "#f2b75a";
    g.fillRect(cx - 12, FACADE_BASE - 46, 24, 46);
    g.fillStyle = "#3a2216";
    g.fillRect(cx - 12, FACADE_BASE - 46, 24, 3);
    g.fillStyle = "rgba(90,50,20,.45)";
    g.fillRect(cx - 9, FACADE_BASE - 40, 18, 40);
    this.litWindows.push({ x: cx, y: FACADE_BASE - 24, big: true });

    // Awning in the witness colour
    for (let k = 0; k < w - 8; k += 12) {
      g.fillStyle = k % 24 ? shade(shop.color, -0.15) : "#d8cfbf";
      g.fillRect(x + 4 + k, FACADE_BASE - 76, 12, 10);
    }
    g.fillStyle = "rgba(0,0,0,.3)";
    g.fillRect(x + 4, FACADE_BASE - 66, w - 8, 2);

    // Sign
    g.font = '600 11px "IBM Plex Mono", monospace';
    const sw = Math.max(70, g.measureText(shop.sign).width + 22);
    g.fillStyle = "#15100c";
    g.fillRect(cx - sw / 2 - 2, FACADE_BASE - 104, sw + 4, 24);
    g.fillStyle = "#2a1f17";
    g.fillRect(cx - sw / 2, FACADE_BASE - 102, sw, 20);
    g.fillStyle = shop.color;
    g.fillRect(cx - sw / 2, FACADE_BASE - 102, 3, 20);
    g.fillStyle = "#f3c66b";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(shop.sign, cx + 1, FACADE_BASE - 91.5);
  }

  station(cx: number): void {
    const g = this.g;
    const w = STATION_WIDTH;
    const x = cx - w / 2;
    const top = FACADE_BASE - 196;
    g.fillStyle = "#2f2b2c";
    g.fillRect(x, top, w, 196);
    g.fillStyle = "rgba(0,0,0,.18)";
    for (let y = top + 3; y < FACADE_BASE; y += 5) g.fillRect(x, y, w, 1);
    g.fillStyle = "#5c5853";
    g.fillRect(x - 3, top - 6, w + 6, 8);
    this.windows(seededRandom(STATION_SEED), x + 6, w - 12, top + 18, FACADE_BASE - 100, 0.55);

    // Blue band sign
    g.fillStyle = "#13305f";
    g.fillRect(x + 20, FACADE_BASE - 104, w - 40, 30);
    g.fillStyle = "#e8eef7";
    g.fillRect(x + 20, FACADE_BASE - 104, w - 40, 2);
    g.fillStyle = "#c63a2c";
    g.fillRect(x + 20, FACADE_BASE - 76, w - 40, 2);
    g.font = '700 16px "IBM Plex Sans", sans-serif';
    g.fillStyle = "#f1f4f9";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("P O L I T I E", cx, FACADE_BASE - 89);

    // Glass doors
    g.fillStyle = "#1a1f27";
    g.fillRect(cx - 30, FACADE_BASE - 64, 60, 64);
    g.fillStyle = "#bfd3ea";
    g.fillRect(cx - 26, FACADE_BASE - 60, 25, 60);
    g.fillRect(cx + 1, FACADE_BASE - 60, 25, 60);
    g.fillStyle = "rgba(20,40,70,.35)";
    g.fillRect(cx - 26, FACADE_BASE - 30, 52, 30);
    this.litWindows.push({ x: cx, y: FACADE_BASE - 32, big: true, cold: true });
    g.fillStyle = "#55504a";
    g.fillRect(cx - 40, FACADE_BASE - 3, 80, 3);

    // Lamp box
    g.fillStyle = "#1a1d22";
    g.fillRect(cx - 5, FACADE_BASE - 132, 10, 16);
    g.fillStyle = "#4a8bf0";
    g.fillRect(cx - 3, FACADE_BASE - 130, 6, 9);
  }
}
