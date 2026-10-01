// The game world: a rainy Amsterdam canal street at night, and the interview room.
// Everything is drawn procedurally on a canvas; no image assets.

const VW = 960;
const VH = 540;
const WW = 2400;
const K = 2; // internal resolution multiplier for crisp text and edges

const FACADE_BASE = 262;
const STREET = { top: 274, bottom: 338 };
const CANAL = { top: 350, bottom: 438 };
const QUAY = { top: 454, bottom: 528 };
const BRIDGES = [{ x: 760, w: 120 }, { x: 1780, w: 120 }];
const NPC_X = [430, 1090, 1560];
const NPC_Y = 300;
const STATION_X = 2150;
const BOARD = { x: 300, y: 462 };
const SPAWN = { x: 210, y: 492 };
const SPEED = 170;

const TREES = [110, 540, 1010, 1330, 1650, 2060, 2330].map((x) => ({ x, y: 512 }));
const BENCHES = [680, 1250, 2000].map((x) => ({ x, y: 480 }));
const BIKES = [300, 610, 1230, 1400, 1990, 2280].map((x, i) => ({ x, y: 343, c: ["#7a2a2a", "#2a4a7a", "#c9b37a", "#3a3a3a", "#5a7a3a", "#7a5a2a"][i] }));
const STREET_LAMPS = [150, 450, 700, 1000, 1300, 1700, 2000, 2350].map((x) => ({ x, y: 344 }));
const QUAY_LAMPS = [420, 900, 1500, 1920, 2240].map((x) => ({ x, y: 451 }));

const PLAYER_LOOK = { hat: "#2b2119", band: "#5a3d22", hair: "#3b2a1e", skin: "#e6c29a", coat: "#a98250", coatDark: "#7c5d36", pants: "#22262d", collar: "#ddd5c2" };
const NPC_LOOKS = [
  { hair: "#8b3f22", longHair: true, skin: "#ecc8a4", pants: "#2a2a33", collar: "#efe6d2" },
  { hat: "#16191f", band: "#3a3f4a", hair: "#55504a", skin: "#dcb894", tie: "#8a1f2a", collar: "#e9e9e9", pants: "#1b1e24" },
  { hat: "#5e4a30", cap: true, hair: "#9a8a6a", beard: true, skin: "#d2a37a", collar: "#c8bfa8", pants: "#3a3326" },
];
const DEFAULT_NPCS = [
  { sign: "BLOEMEN", color: "#c2416b", name: "" },
  { sign: "BANK", color: "#3b6ea5", name: "" },
  { sign: "BOERDERIJ", color: "#5f8a35", name: "" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function inRect(x, y, r) {
  return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
}

const OBSTACLES = [
  ...TREES.map((t) => ({ x0: t.x - 8, x1: t.x + 8, y0: t.y - 7, y1: t.y + 4 })),
  ...BENCHES.map((b) => ({ x0: b.x - 26, x1: b.x + 26, y0: b.y - 9, y1: b.y + 2 })),
  { x0: BOARD.x - 20, x1: BOARD.x + 20, y0: BOARD.y - 7, y1: BOARD.y + 2 },
];

function region(y) {
  if (y <= STREET.bottom + 2) return "street";
  if (y >= QUAY.top - 2) return "quay";
  return "bridge";
}

function onBridge(x) {
  return BRIDGES.some((b) => x >= b.x + 16 && x <= b.x + b.w - 16);
}

function walkable(x, y, npcs) {
  if (x < 18 || x > WW - 18) return false;
  let ok = false;
  if (y >= STREET.top && y <= STREET.bottom) ok = true;
  else if (y >= QUAY.top && y <= QUAY.bottom) ok = true;
  else if (y > STREET.bottom && y < QUAY.top) ok = onBridge(x);
  if (!ok) return false;
  if (OBSTACLES.some((r) => inRect(x, y, r))) return false;
  if (npcs && npcs.some((n) => Math.hypot(n.x - x, (n.y - y) * 1.6) < 13)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Characters
// ---------------------------------------------------------------------------

/** Draws a person with feet at (x, y). Units are scaled by o.scale. */
export function drawPerson(g, x, y, o) {
  const u = o.scale;
  const b = o.bob || 0;
  const R = (ux, uy, w, h, c) => {
    g.fillStyle = c;
    g.fillRect(x + ux * u, y - (uy + h) * u, w * u, h * u);
  };
  const facing = o.facing || "down";
  const dir = facing === "left" ? -1 : 1;
  const walk = o.moving ? Math.sin(o.phase || 0) : 0;
  const l1 = walk > 0.25 ? 1 : 0;
  const l2 = walk < -0.25 ? 1 : 0;
  const swing = o.moving ? walk * 0.8 : 0;
  const coatDark = o.coatDark || shade(o.coat, -0.32);

  if (o.shadow !== false) {
    g.fillStyle = "rgba(0,0,0,.38)";
    g.beginPath();
    g.ellipse(x, y, 6 * u, 1.7 * u, 0, 0, Math.PI * 2);
    g.fill();
  }
  // legs and shoes
  R(-3, l1, 2, 6 - l1, o.pants);
  R(1, l2, 2, 6 - l2, o.pants);
  R(-3.3, l1, 2.6, 1, "#121014");
  R(0.7, l2, 2.6, 1, "#121014");
  // arms (behind coat when walking sideways)
  R(-5.6, 8 + b + swing, 1.6, 8.5, coatDark);
  R(4, 8 + b - swing, 1.6, 8.5, coatDark);
  R(-5.6, 7.2 + b + swing, 1.6, 1, o.skin);
  R(4, 7.2 + b - swing, 1.6, 1, o.skin);
  // coat
  R(-4.5, 5 + b, 9, 12, o.coat);
  R(-4.5, 5 + b, 9, 1, coatDark);
  R(-4.5, 10.5 + b, 9, 1, coatDark);
  if (facing !== "up") {
    R(-0.4, 5 + b, 0.8, 10.5, coatDark);
    R(-1.8, 15 + b, 3.6, 2, o.collar || "#ddd");
    if (o.tie) R(-0.5, 12.2 + b, 1, 4, o.tie);
    R(-4.5, 15.2 + b, 2.2, 1.8, coatDark);
    R(2.3, 15.2 + b, 2.2, 1.8, coatDark);
  } else {
    R(-4.5, 15.5 + b, 9, 1.5, coatDark);
  }
  // head
  R(-1, 17 + b, 2, 1, o.skin);
  R(-3, 18 + b, 6, 6, o.skin);
  if (facing === "up") {
    R(-3, 18.5 + b, 6, 5.5, o.hair);
  } else {
    R(-3, 22.6 + b, 6, 1.4, o.hair);
    if (o.longHair) {
      R(-3.6, 16.5 + b, 1.2, 7, o.hair);
      R(2.4, 16.5 + b, 1.2, 7, o.hair);
      R(-3.6, 22.4 + b, 7.2, 2.2, o.hair);
    }
    if (o.beard) R(-3, 18 + b, 6, 1.7, o.hair);
    const eh = o.blink ? 0.35 : 1;
    const ey = 20.6 + b + (o.blink ? 0.3 : 0);
    if (facing === "down") {
      R(-2, ey, 1, eh, "#16171b");
      R(1, ey, 1, eh, "#16171b");
      if (o.mouth) R(-0.9, 18.9 + b, 1.8, o.mouth, "#5a2620");
    } else {
      R(dir > 0 ? 1.4 : -2.4, ey, 1, eh, "#16171b");
    }
  }
  // hat
  if (o.hat) {
    if (o.cap) {
      R(-3.3, 23.8 + b, 6.6, 2.2, o.hat);
      R(dir > 0 ? 1.5 : -4.5, 23.8 + b, 3, 0.7, shade(o.hat, -0.3));
    } else {
      R(-4.6, 23.6 + b, 9.2, 1, o.hat);
      R(-3, 24.6 + b, 6, 3, o.hat);
      R(-3, 24.6 + b, 6, 0.8, o.band || "#111");
    }
  }
}

function npcLook(i, color) {
  const L = NPC_LOOKS[i % NPC_LOOKS.length];
  return { ...L, coat: color, coatDark: shade(color, -0.35) };
}

/** Small head-and-shoulders portrait for the chat header. */
export function drawPortrait(canvas, i, color) {
  const g = canvas.getContext("2d");
  const k = 2;
  canvas.width = 48 * k;
  canvas.height = 48 * k;
  g.setTransform(k, 0, 0, k, 0, 0);
  const grad = g.createLinearGradient(0, 0, 0, 48);
  grad.addColorStop(0, shade(color, -0.55));
  grad.addColorStop(1, shade(color, -0.8));
  g.fillStyle = grad;
  g.fillRect(0, 0, 48, 48);
  drawPerson(g, 24, 70, { ...npcLook(i, color), scale: 2.2, facing: "down", shadow: false });
}

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------

export class World {
  constructor(canvas, { attract = false, onNear = () => {}, onInteract = () => {} } = {}) {
    this.canvas = canvas;
    this.g = canvas.getContext("2d");
    canvas.width = VW * K;
    canvas.height = VH * K;
    this.attract = attract;
    this.onNear = onNear;
    this.onInteract = onInteract;
    this.npcs = DEFAULT_NPCS.map((n, i) => ({ ...n, x: NPC_X[i] + 46, y: NPC_Y, earned: false }));
    this.player = { ...SPAWN, facing: "up", moving: false, phase: 0 };
    this.cam = attract ? 600 : 0;
    this.keys = { up: false, down: false, left: false, right: false };
    this.path = null;
    this.pending = null;
    this.stuck = 0;
    this.near = null;
    this.interior = null;
    this.thinking = false;
    this.speaking = false;
    this.flash = 0;
    this.sparks = [];
    this.shakeT = 0;
    this.drops = Array.from({ length: 150 }, () => this.newDrop(true));
    this.ripples = [];
    this.t = 0;
    this.blinkAt = 2;
    this.running = false;
    this.static = null;
    this.vignette = this.makeVignette();
    this.build();
    if (!attract) this.bindPointer();
  }

  // ---- public API --------------------------------------------------------

  setCase(view) {
    this.npcs = view.npcs.map((n, i) => ({ sign: n.sign, color: n.color, name: n.name, x: NPC_X[i] + 46, y: NPC_Y, earned: Boolean(n.clue) }));
    this.player = { ...SPAWN, facing: "up", moving: false, phase: 0 };
    this.cam = 0;
    this.path = null;
    this.pending = null;
    this.interior = null;
    this.build();
  }

  setClues(clues) {
    clues.forEach((c, i) => {
      if (this.npcs[i]) this.npcs[i].earned = Boolean(c);
    });
  }

  enterInterior(i) {
    this.interior = { i, t: 0 };
    this.path = null;
    this.pending = null;
    for (const k in this.keys) this.keys[k] = false;
    this.canvas.parentElement?.classList.add("interior");
  }

  exitInterior() {
    if (this.interior) {
      const n = this.npcs[this.interior.i];
      this.player.x = n.x - 34;
      this.player.y = NPC_Y + 4;
      this.player.facing = "right";
    }
    this.interior = null;
    this.thinking = false;
    this.speaking = false;
    this.canvas.parentElement?.classList.remove("interior");
  }

  setThinking(v) { this.thinking = v; }
  setSpeaking(v) { this.speaking = v; }
  celebrate() {
    this.flash = 1;
    for (let i = 0; i < 46; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const s = 120 + Math.random() * 260;
      this.sparks.push({ x: 480, y: 410, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.8 + Math.random() * 0.6 });
    }
  }
  shake() { this.shakeT = 0.4; }

  setKey(name, down) {
    if (name in this.keys) this.keys[name] = down;
  }

  interact() {
    if (this.interior || !this.near) return;
    this.onInteract(this.near);
  }

  walkToNpc(i) {
    const n = this.npcs[i];
    // Approach from the side the player will arrive on (via a bridge when coming from the quay).
    const arriveX = region(this.player.y) === "street" ? this.player.x : this.bridgeFor(this.player.x, n.x);
    const side = arriveX > n.x ? 32 : -34;
    this.walkTo({ x: n.x + side, y: NPC_Y + 4 }, { type: "npc", index: i });
  }

  walkToStation() {
    this.walkTo({ x: STATION_X, y: STREET.top + 6 }, { type: "station" });
  }

  start() {
    if (this.running) return;
    this.running = true;
    let last = performance.now();
    const frame = (now) => {
      if (!this.running) return;
      // Fixed sub-steps keep movement correct on slow or throttled frames without tunnelling.
      let elapsed = Math.min(0.25, (now - last) / 1000);
      last = now;
      while (elapsed > 0) {
        const dt = Math.min(1 / 60, elapsed);
        this.update(dt);
        elapsed -= dt;
      }
      this.draw();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  stop() { this.running = false; }

  // ---- movement ----------------------------------------------------------

  bridgeFor(fromX, toX) {
    return BRIDGES.map((b) => b.x + b.w / 2).sort((a, b) => Math.abs(fromX - a) + Math.abs(toX - a) - (Math.abs(fromX - b) + Math.abs(toX - b)))[0];
  }

  walkTo(target, interactWith = null) {
    const from = region(this.player.y);
    const to = region(target.y);
    const pts = [];
    if (from !== to && from !== "bridge" && to !== "bridge") {
      const cx = this.bridgeFor(this.player.x, target.x);
      const edge = (r) => (r === "street" ? STREET.bottom - 4 : QUAY.top + 4);
      pts.push({ x: cx, y: edge(from) }, { x: cx, y: edge(to) });
    } else if (from === "bridge" && to !== "bridge") {
      pts.push({ x: this.player.x, y: to === "street" ? STREET.bottom - 4 : QUAY.top + 4 });
    }
    pts.push(target);
    this.path = pts;
    this.pending = interactWith;
    this.stuck = 0;
  }

  bindPointer() {
    this.canvas.addEventListener("pointerdown", (e) => {
      if (this.interior) return;
      this.canvas.focus({ preventScroll: true });
      const r = this.canvas.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * VW + this.cam;
      const y = ((e.clientY - r.top) / r.height) * VH;
      // Clicked a witness?
      const hit = this.npcs.findIndex((n) => Math.abs(x - n.x) < 22 && y > n.y - 64 && y < n.y + 8);
      if (hit >= 0) return this.walkToNpc(hit);
      // Clicked the station door?
      if (Math.abs(x - STATION_X) < 70 && y > FACADE_BASE - 120 && y < STREET.top + 20) return this.walkToStation();
      // Clicked the notice board?
      if (Math.abs(x - BOARD.x) < 26 && y > BOARD.y - 60 && y < BOARD.y + 8) return this.walkTo({ x: BOARD.x, y: BOARD.y + 14 }, { type: "board" });
      // Otherwise walk to the nearest walkable spot.
      let ty = y;
      if (ty < STREET.top) ty = STREET.top + 6;
      else if (ty > STREET.bottom && ty < QUAY.top && !onBridge(x)) ty = ty < (CANAL.top + CANAL.bottom) / 2 ? STREET.bottom - 4 : QUAY.top + 4;
      else if (ty > QUAY.bottom) ty = QUAY.bottom - 4;
      this.walkTo({ x: clamp(x, 24, WW - 24), y: ty });
    });
  }

  update(dt) {
    this.t += dt;
    if (this.shakeT > 0) this.shakeT -= dt;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 1.6);
    this.sparks = this.sparks.filter((s) => (s.life -= dt) > 0);
    for (const s of this.sparks) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 380 * dt;
    }
    if (this.t > this.blinkAt) this.blinkAt = this.t + 2.5 + Math.random() * 2.5;

    // rain
    for (const d of this.drops) {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.y > VH + 20 || d.x < -20) Object.assign(d, this.newDrop(false));
    }
    if (Math.random() < dt * 14) {
      const x = this.cam + Math.random() * VW;
      const pick = Math.random();
      const y = pick < 0.45 ? CANAL.top + 8 + Math.random() * (CANAL.bottom - CANAL.top - 14) : pick < 0.75 ? STREET.top - 6 + Math.random() * 70 : QUAY.top + Math.random() * 80;
      this.ripples.push({ x, y, life: 0, water: pick < 0.45 });
    }
    this.ripples = this.ripples.filter((r) => (r.life += dt) < 0.7);

    if (this.attract) {
      this.cam = 300 + (Math.sin(this.t * 0.035) * 0.5 + 0.5) * (WW - VW - 300);
      return;
    }
    if (this.interior) {
      this.interior.t += dt;
      return;
    }

    const p = this.player;
    const k = this.keys;
    let dx = (k.right ? 1 : 0) - (k.left ? 1 : 0);
    let dy = (k.down ? 1 : 0) - (k.up ? 1 : 0);
    if (dx || dy) {
      this.path = null;
      this.pending = null;
    } else if (this.path) {
      const wp = this.path[0];
      const vx = wp.x - p.x;
      const vy = wp.y - p.y;
      const d = Math.hypot(vx, vy);
      if (d < 4) {
        this.path.shift();
        if (!this.path.length) {
          this.path = null;
          if (this.pending) {
            const it = this.pending;
            this.pending = null;
            if (it.type === "npc") p.facing = this.npcs[it.index].x > p.x ? "right" : "left";
            if (it.type === "station") p.facing = "up";
            this.computeNear();
            if (this.near && this.near.type === it.type && this.near.index === it.index) this.onInteract(this.near);
          }
        }
      } else {
        dx = vx / d;
        dy = vy / d;
      }
    }

    p.moving = false;
    if (dx || dy) {
      const len = Math.hypot(dx, dy);
      dx /= len;
      dy /= len;
      const step = SPEED * dt;
      const nx = p.x + dx * step;
      const ny = p.y + dy * step;
      let moved = false;
      if (dx && walkable(nx, p.y, this.npcs)) {
        p.x = nx;
        moved = true;
      }
      if (dy && walkable(p.x, ny, this.npcs)) {
        p.y = ny;
        moved = true;
      } else if (dy && !moved) {
        // Slide toward a nearby bridge so keyboard players don't snag on the canal edge.
        const b = BRIDGES.find((b) => Math.abs(p.x - (b.x + b.w / 2)) < b.w / 2 + 34);
        if (b) {
          const cx = b.x + b.w / 2;
          const sx = p.x + Math.sign(cx - p.x) * step;
          if (walkable(sx, p.y, this.npcs)) {
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
        this.stuck = 0;
      } else if (this.path && (this.stuck += dt) > 0.3) {
        // Blocked short of the target: still talk if we're close enough.
        const it = this.pending;
        this.path = null;
        this.pending = null;
        this.computeNear();
        if (it && this.near && this.near.type === it.type && this.near.index === it.index) this.onInteract(this.near);
      }
    }

    const target = clamp(p.x - VW / 2, 0, WW - VW);
    this.cam += (target - this.cam) * Math.min(1, dt * 6);
    this.computeNear();
  }

  computeNear() {
    const p = this.player;
    let best = null;
    let bestD = Infinity;
    this.npcs.forEach((n, i) => {
      const d = Math.hypot(n.x - p.x, (n.y - p.y) * 1.4);
      if (d < 64 && d < bestD) {
        best = { type: "npc", index: i, name: n.name };
        bestD = d;
      }
    });
    if (!best && Math.abs(p.x - STATION_X) < 60 && p.y < STREET.top + 40) best = { type: "station" };
    if (!best && Math.hypot(p.x - BOARD.x, p.y - BOARD.y) < 50) best = { type: "board" };
    const key = (n) => (n ? `${n.type}${n.index ?? ""}` : "");
    if (key(best) !== key(this.near)) {
      this.near = best;
      this.onNear(best);
    }
  }

  newDrop(anywhere) {
    return {
      x: Math.random() * (VW + 120),
      y: anywhere ? Math.random() * VH : -20 - Math.random() * 60,
      vx: -110,
      vy: 560 + Math.random() * 200,
      len: 9 + Math.random() * 10,
    };
  }

  // ---- static layer ------------------------------------------------------

  build() {
    const c = this.static || document.createElement("canvas");
    c.width = WW * K;
    c.height = VH * K;
    const g = c.getContext("2d");
    g.setTransform(K, 0, 0, K, 0, 0);
    const r = rng(417);
    this.litWindows = [];

    // sky
    const sky = g.createLinearGradient(0, 0, 0, FACADE_BASE);
    sky.addColorStop(0, "#070b14");
    sky.addColorStop(1, "#16223a");
    g.fillStyle = sky;
    g.fillRect(0, 0, WW, FACADE_BASE);
    // moon
    const moon = g.createRadialGradient(1690, 44, 4, 1690, 44, 90);
    moon.addColorStop(0, "rgba(220,215,195,.35)");
    moon.addColorStop(1, "rgba(220,215,195,0)");
    g.fillStyle = moon;
    g.fillRect(1590, 0, 200, 140);
    g.fillStyle = "#d9d3bf";
    g.beginPath();
    g.arc(1690, 44, 13, 0, Math.PI * 2);
    g.fill();
    // distant skyline and a church tower
    g.fillStyle = "#0e1626";
    for (let x = 0; x < WW; x += 40 + r() * 40) g.fillRect(x, 120 + r() * 40, 50 + r() * 40, 200);
    g.fillRect(1196, 40, 28, 200);
    g.beginPath();
    g.moveTo(1190, 42);
    g.lineTo(1210, -6);
    g.lineTo(1230, 42);
    g.fill();

    // facades
    const specials = [
      ...NPC_X.map((x, i) => ({ x0: x - 82, x1: x + 82, draw: () => this.drawNpcHouse(g, r, x, i) })),
      { x0: STATION_X - 124, x1: STATION_X + 124, draw: () => this.drawStation(g, STATION_X) },
    ].sort((a, b) => a.x0 - b.x0);
    const palette = ["#4a2a24", "#3a3540", "#5a3d2c", "#2d3a3d", "#4b3033", "#40382f", "#33303a", "#553226", "#36402f"];
    const kinds = ["step", "bell", "neck", "spout", "flat"];
    let x = -30;
    for (const s of [...specials, { x0: WW + 40, x1: WW + 40, draw: () => {} }]) {
      while (x < s.x0 - 4) {
        let w = 92 + Math.floor(r() * 56);
        if (s.x0 - x - w < 70) w = s.x0 - x;
        this.drawHouse(g, r, x, w, 170 + r() * 60, palette[Math.floor(r() * palette.length)], kinds[Math.floor(r() * kinds.length)]);
        x += w;
      }
      s.draw();
      x = s.x1;
    }

    // sidewalk slabs
    g.fillStyle = "#2a2e35";
    g.fillRect(0, FACADE_BASE, WW, 14);
    g.fillStyle = "#23272d";
    for (let sx = 0; sx < WW; sx += 34) g.fillRect(sx, FACADE_BASE, 1, 14);
    // street cobbles
    this.cobbles(g, r, FACADE_BASE + 14, CANAL.top - 6, ["#2f343c", "#2b3038", "#33383f", "#2d3239"], "#1d2026");
    // curb, canal walls, water base
    g.fillStyle = "#4b4d53";
    g.fillRect(0, CANAL.top - 6, WW, 6);
    g.fillStyle = "#5a5c62";
    g.fillRect(0, CANAL.top - 6, WW, 1.5);
    this.brick(g, CANAL.top, 6);
    const water = g.createLinearGradient(0, CANAL.top + 6, 0, CANAL.bottom);
    water.addColorStop(0, "#08161f");
    water.addColorStop(1, "#0d2430");
    g.fillStyle = water;
    g.fillRect(0, CANAL.top + 6, WW, CANAL.bottom - CANAL.top - 12);
    this.brick(g, CANAL.bottom - 6, 6);
    g.fillStyle = "#4b4d53";
    g.fillRect(0, CANAL.bottom, WW, 8);
    g.fillStyle = "#5a5c62";
    g.fillRect(0, CANAL.bottom, WW, 1.5);
    // quay
    this.cobbles(g, r, CANAL.bottom + 8, VH, ["#2a2e35", "#272b31", "#2d3138", "#25292f"], "#1a1d22");

    this.static = c;
  }

  cobbles(g, r, y0, y1, colors, gap) {
    g.fillStyle = gap;
    g.fillRect(0, y0, WW, y1 - y0);
    for (let y = y0, row = 0; y < y1; y += 8, row++) {
      for (let x = row % 2 ? -6 : 0; x < WW; x += 12) {
        g.fillStyle = colors[Math.floor(r() * colors.length)];
        g.fillRect(x + 1, y + 1, 10, Math.min(6.5, y1 - y - 1));
      }
    }
  }

  brick(g, y, h) {
    g.fillStyle = "#3a2c26";
    g.fillRect(0, y, WW, h);
    g.fillStyle = "#2a1f1b";
    for (let x = 0; x < WW; x += 10) g.fillRect(x, y, 1, h);
    g.fillRect(0, y + h / 2, WW, 1);
  }

  drawWindows(g, r, x, w, top, bottom, litChance = 0.38) {
    const cols = Math.max(2, Math.floor((w - 14) / 32));
    const sp = w / cols;
    for (let wy = top; wy < bottom - 30; wy += 44) {
      for (let c = 0; c < cols; c++) {
        const wx = x + sp * (c + 0.5) - 9;
        const lit = r() < litChance;
        if (lit) {
          const gr = g.createLinearGradient(0, wy, 0, wy + 28);
          gr.addColorStop(0, "#f7c86d");
          gr.addColorStop(1, "#d9892c");
          g.fillStyle = gr;
          this.litWindows.push({ x: wx + 9, y: wy + 14 });
        } else {
          g.fillStyle = "#121a26";
        }
        g.fillRect(wx, wy, 18, 28);
        if (!lit) {
          g.fillStyle = "#1f2c40";
          g.fillRect(wx + 2, wy + 2, 3, 10);
        }
        g.fillStyle = lit ? "#5a3a1a" : "#0a0f16";
        g.fillRect(wx + 8.5, wy, 1, 28);
        g.fillRect(wx, wy + 11, 18, 1);
        g.fillStyle = "rgba(200,190,170,.35)";
        g.fillRect(wx - 1, wy + 28, 20, 1.5);
      }
    }
  }

  gable(g, x, w, top, bodyTop, kind) {
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

  drawHouse(g, r, x, w, h, color, kind) {
    const top = FACADE_BASE - h;
    const bodyTop = kind === "flat" ? top + 8 : top + 46;
    g.fillStyle = color;
    g.fillRect(x, bodyTop, w, FACADE_BASE - bodyTop);
    this.gable(g, x, w, top, bodyTop, kind);
    // brick texture
    g.fillStyle = "rgba(0,0,0,.12)";
    for (let y = bodyTop + 4; y < FACADE_BASE; y += 6) g.fillRect(x, y, w, 1);
    // party wall shadow
    g.fillStyle = "rgba(0,0,0,.35)";
    g.fillRect(x, top, 2, h);
    // cornice
    g.fillStyle = "#77706a";
    g.fillRect(x - 1, bodyTop - 2, w + 2, 3);
    // hoist beam
    if (kind !== "flat") {
      g.fillStyle = "#17110d";
      g.fillRect(x + w / 2 - 2, top + 10, 4, 9);
      g.fillRect(x + w / 2 - 1, top + 19, 2, 4);
      // gable window
      const lit = r() < 0.35;
      g.fillStyle = lit ? "#e9a23b" : "#121a26";
      g.fillRect(x + w / 2 - 6, bodyTop - 30, 12, 16);
      if (lit) this.litWindows.push({ x: x + w / 2, y: bodyTop - 22 });
    }
    this.drawWindows(g, r, x, w, bodyTop + 12, FACADE_BASE - 46);
    // door and steps
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

  drawNpcHouse(g, r, cx, i) {
    const n = this.npcs[i] || DEFAULT_NPCS[i];
    const w = 164;
    const x = cx - w / 2;
    const kinds = ["step", "bell", "neck"];
    const colors = ["#5a2e2a", "#2f3a48", "#4a3f2c"];
    this.drawHouse(g, r, x, w, 214, colors[i], kinds[i]);
    // shop front
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
    // lit doorway
    g.fillStyle = "#f2b75a";
    g.fillRect(cx - 12, FACADE_BASE - 46, 24, 46);
    g.fillStyle = "#3a2216";
    g.fillRect(cx - 12, FACADE_BASE - 46, 24, 3);
    g.fillStyle = "rgba(90,50,20,.45)";
    g.fillRect(cx - 9, FACADE_BASE - 40, 18, 40);
    this.litWindows.push({ x: cx, y: FACADE_BASE - 24, big: true });
    // awning in the witness colour
    for (let k = 0; k < w - 8; k += 12) {
      g.fillStyle = k % 24 ? shade(n.color, -0.15) : "#d8cfbf";
      g.fillRect(x + 4 + k, FACADE_BASE - 76, 12, 10);
    }
    g.fillStyle = "rgba(0,0,0,.3)";
    g.fillRect(x + 4, FACADE_BASE - 66, w - 8, 2);
    // sign
    g.font = '600 11px "IBM Plex Mono", monospace';
    const sw = Math.max(70, g.measureText(n.sign).width + 22);
    g.fillStyle = "#15100c";
    g.fillRect(cx - sw / 2 - 2, FACADE_BASE - 104, sw + 4, 24);
    g.fillStyle = "#2a1f17";
    g.fillRect(cx - sw / 2, FACADE_BASE - 102, sw, 20);
    g.fillStyle = n.color;
    g.fillRect(cx - sw / 2, FACADE_BASE - 102, 3, 20);
    g.fillStyle = "#f3c66b";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(n.sign, cx + 1, FACADE_BASE - 91.5);
  }

  drawStation(g, cx) {
    const w = 248;
    const x = cx - w / 2;
    const top = FACADE_BASE - 196;
    g.fillStyle = "#2f2b2c";
    g.fillRect(x, top, w, 196);
    g.fillStyle = "rgba(0,0,0,.18)";
    for (let y = top + 3; y < FACADE_BASE; y += 5) g.fillRect(x, y, w, 1);
    g.fillStyle = "#5c5853";
    g.fillRect(x - 3, top - 6, w + 6, 8);
    const r = rng(9);
    this.drawWindows(g, r, x + 6, w - 12, top + 18, FACADE_BASE - 100, 0.55);
    // blue band sign
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
    // glass doors
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
    // lamp box
    g.fillStyle = "#1a1d22";
    g.fillRect(cx - 5, FACADE_BASE - 132, 10, 16);
    g.fillStyle = "#4a8bf0";
    g.fillRect(cx - 3, FACADE_BASE - 130, 6, 9);
  }

  makeVignette() {
    const c = document.createElement("canvas");
    c.width = VW;
    c.height = VH;
    const g = c.getContext("2d");
    const v = g.createRadialGradient(VW / 2, VH / 2, VH * 0.35, VW / 2, VH / 2, VH * 0.95);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,.6)");
    g.fillStyle = v;
    g.fillRect(0, 0, VW, VH);
    return c;
  }

  // ---- drawing -----------------------------------------------------------

  draw() {
    const g = this.g;
    g.setTransform(K, 0, 0, K, 0, 0);
    g.imageSmoothingEnabled = false;
    if (this.shakeT > 0) {
      const m = this.shakeT * 18;
      g.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }
    if (this.interior) this.drawInterior(g);
    else this.drawStreet(g);
    g.setTransform(K, 0, 0, K, 0, 0);
    g.drawImage(this.vignette, 0, 0);
    if (this.attract) {
      const s = g.createLinearGradient(0, 0, VW, 0);
      s.addColorStop(0, "rgba(9,12,17,.9)");
      s.addColorStop(0.55, "rgba(9,12,17,.62)");
      s.addColorStop(1, "rgba(9,12,17,.5)");
      g.fillStyle = s;
      g.fillRect(0, 0, VW, VH);
    }
  }

  drawStreet(g) {
    const cam = Math.round(this.cam * K) / K;
    const t = this.t;
    g.drawImage(this.static, cam * K, 0, VW * K, VH * K, 0, 0, VW, VH);
    g.save();
    g.translate(-cam, 0);
    const x0 = cam - 40;
    const x1 = cam + VW + 40;

    // water shimmer
    for (let y = CANAL.top + 10, row = 0; y < CANAL.bottom - 8; y += 6, row++) {
      const sp = row % 2 ? 12 : -9;
      const off = ((t * sp + row * 37) % 70 + 70) % 70;
      g.fillStyle = `rgba(120,170,205,${0.05 + (row % 3) * 0.025})`;
      for (let x = Math.floor(x0 / 70) * 70 - 70 + off; x < x1; x += 70) g.fillRect(x, y, 14 + ((row * 13 + Math.floor(x / 70)) % 4) * 6, 1);
    }
    // lamp reflections
    for (const l of STREET_LAMPS) {
      if (l.x < x0 || l.x > x1 || onBridge(l.x)) continue;
      for (let y = CANAL.top + 10; y < CANAL.bottom - 10; y += 3) {
        const wob = Math.sin(t * 2.4 + y * 0.25) * 3;
        const a = 0.28 * (1 - (y - CANAL.top) / (CANAL.bottom - CANAL.top));
        g.fillStyle = `rgba(245,175,85,${a})`;
        g.fillRect(l.x - 3 + wob, y, 6 - (y % 2), 1.5);
      }
    }
    // houseboat
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
    const bx = ((t * 14) % (WW + 300)) - 150;
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
    // ripples
    for (const r of this.ripples) {
      if (r.x < x0 || r.x > x1) continue;
      const k = r.life / 0.7;
      g.strokeStyle = r.water ? `rgba(150,190,220,${0.35 * (1 - k)})` : `rgba(160,175,195,${0.22 * (1 - k)})`;
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(r.x, r.y, 2 + k * (r.water ? 9 : 5), 0.6 + k * (r.water ? 2.4 : 1.4), 0, 0, Math.PI * 2);
      g.stroke();
    }
    // bridges
    for (const b of BRIDGES) {
      if (b.x + b.w < x0 || b.x > x1) continue;
      g.fillStyle = "rgba(0,0,0,.45)";
      g.fillRect(b.x - 8, CANAL.top + 6, 8, CANAL.bottom - CANAL.top - 12);
      g.fillRect(b.x + b.w, CANAL.top + 6, 8, CANAL.bottom - CANAL.top - 12);
      g.fillStyle = "#4a4440";
      g.fillRect(b.x, CANAL.top - 6, b.w, CANAL.bottom - CANAL.top + 14);
      g.fillStyle = "#423c38";
      for (let y = CANAL.top - 4; y < CANAL.bottom + 8; y += 6) g.fillRect(b.x + 8, y, b.w - 16, 1);
      g.fillStyle = "#1c1e23";
      g.fillRect(b.x, CANAL.top - 10, 7, CANAL.bottom - CANAL.top + 20);
      g.fillRect(b.x + b.w - 7, CANAL.top - 10, 7, CANAL.bottom - CANAL.top + 20);
      g.fillStyle = "#3a3d44";
      for (let y = CANAL.top - 8; y < CANAL.bottom + 10; y += 14) {
        g.fillRect(b.x + 1, y, 5, 3);
        g.fillRect(b.x + b.w - 6, y, 5, 3);
      }
    }

    // y-sorted entities
    const ents = [];
    for (const l of STREET_LAMPS) if (!onBridge(l.x)) ents.push({ y: l.y, d: () => this.lamp(g, l.x, l.y) });
    for (const l of QUAY_LAMPS) ents.push({ y: l.y, d: () => this.lamp(g, l.x, l.y) });
    for (const tr of TREES) ents.push({ y: tr.y, d: () => this.tree(g, tr.x, tr.y) });
    for (const bn of BENCHES) ents.push({ y: bn.y, d: () => this.bench(g, bn.x, bn.y) });
    for (const bk of BIKES) ents.push({ y: bk.y, d: () => this.bike(g, bk.x, bk.y, bk.c) });
    ents.push({ y: BOARD.y, d: () => this.board(g) });
    this.npcs.forEach((n, i) => {
      const breathe = Math.sin(t * 2 + i) > 0.6 ? 0.5 : 0;
      ents.push({
        y: n.y,
        d: () => drawPerson(g, n.x, n.y, { ...npcLook(i, n.color), scale: 2, facing: this.player.x < n.x - 20 ? "left" : this.player.x > n.x + 20 ? "right" : "down", bob: breathe, blink: this.t > this.blinkAt - 0.12 }),
      });
    });
    if (!this.attract) {
      const p = this.player;
      ents.push({ y: p.y, d: () => drawPerson(g, p.x, p.y, { ...PLAYER_LOOK, scale: 2, facing: p.facing, moving: p.moving, phase: p.phase, bob: p.moving && Math.sin(p.phase * 2) > 0 ? 0.5 : 0 }) });
    }
    ents.sort((a, b) => a.y - b.y).forEach((e) => e.d());

    // light
    g.globalCompositeOperation = "lighter";
    const glow = (x, y, rad, col) => {
      if (x < x0 - rad || x > x1 + rad) return;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, col);
      gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    };
    for (const l of [...STREET_LAMPS.filter((l) => !onBridge(l.x)), ...QUAY_LAMPS]) {
      const fl = 0.95 + Math.sin(t * 9 + l.x) * 0.03;
      glow(l.x, l.y - 80, 120, `rgba(255,170,70,${0.2 * fl})`);
      glow(l.x, l.y - 80, 22, "rgba(255,210,140,.45)");
      glow(l.x, l.y - 2, 46, "rgba(255,170,70,.1)");
    }
    for (const w of this.litWindows) glow(w.x, w.y, w.big ? 56 : 22, w.cold ? "rgba(140,180,255,.16)" : `rgba(255,170,70,${w.big ? 0.16 : 0.1})`);
    const blue = 0.25 + (Math.sin(t * 3) * 0.5 + 0.5) * 0.25;
    glow(STATION_X, FACADE_BASE - 125, 90, `rgba(70,130,255,${blue})`);
    g.globalCompositeOperation = "source-over";

    if (!this.attract) this.drawMarkers(g, x0, x1);
    g.restore();

    // rain (screen space)
    g.strokeStyle = "rgba(175,195,225,.26)";
    g.lineWidth = 1;
    g.beginPath();
    for (const d of this.drops) {
      g.moveTo(d.x, d.y);
      g.lineTo(d.x + d.vx * 0.022, d.y - d.len);
    }
    g.stroke();

    if (!this.attract) this.drawOffscreenArrows(g);
  }

  lamp(g, x, y) {
    g.fillStyle = "#14171b";
    g.fillRect(x - 1.5, y - 76, 3, 76);
    g.fillRect(x - 3.5, y - 5, 7, 5);
    g.fillRect(x - 6, y - 90, 12, 3);
    g.fillStyle = "#ffd98f";
    g.fillRect(x - 4, y - 87, 8, 9);
    g.fillStyle = "#14171b";
    g.fillRect(x - 0.5, y - 87, 1, 9);
    g.fillRect(x - 5, y - 78, 10, 2);
  }

  tree(g, x, y) {
    g.fillStyle = "rgba(0,0,0,.35)";
    g.beginPath();
    g.ellipse(x, y, 16, 4, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#2a1d14";
    g.fillRect(x - 4, y - 46, 8, 46);
    const blobs = [[0, -78, 30], [-22, -64, 22], [22, -64, 22], [-10, -96, 20], [14, -92, 20]];
    for (const [bx, by, r] of blobs) {
      g.fillStyle = "#16291e";
      g.beginPath();
      g.arc(x + bx, y + by, r, 0, Math.PI * 2);
      g.fill();
    }
    for (const [bx, by, r] of blobs) {
      g.fillStyle = "#20392a";
      g.beginPath();
      g.arc(x + bx - 3, y + by - 4, r * 0.65, 0, Math.PI * 2);
      g.fill();
    }
  }

  bench(g, x, y) {
    g.fillStyle = "#15171b";
    g.fillRect(x - 24, y - 6, 3, 6);
    g.fillRect(x + 21, y - 6, 3, 6);
    g.fillStyle = "#4a3326";
    g.fillRect(x - 26, y - 10, 52, 4);
    g.fillRect(x - 26, y - 20, 52, 4);
    g.fillStyle = "#15171b";
    g.fillRect(x - 24, y - 20, 2, 14);
    g.fillRect(x + 22, y - 20, 2, 14);
  }

  bike(g, x, y, c) {
    g.strokeStyle = "#8f959d";
    g.lineWidth = 1.2;
    g.beginPath();
    g.arc(x - 9, y - 7, 6.5, 0, Math.PI * 2);
    g.moveTo(x + 15.5, y - 7);
    g.arc(x + 9, y - 7, 6.5, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = c;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x - 9, y - 7);
    g.lineTo(x - 2, y - 16);
    g.lineTo(x + 7, y - 16);
    g.lineTo(x + 9, y - 7);
    g.moveTo(x - 2, y - 16);
    g.lineTo(x, y - 7);
    g.lineTo(x - 9, y - 7);
    g.stroke();
    g.fillStyle = "#111";
    g.fillRect(x - 5, y - 19, 6, 2);
    g.fillRect(x + 6, y - 20, 2, 5);
  }

  board(g) {
    const { x, y } = BOARD;
    g.fillStyle = "#1a1410";
    g.fillRect(x - 15, y - 34, 3, 34);
    g.fillRect(x + 12, y - 34, 3, 34);
    g.fillStyle = "#3d2a1d";
    g.fillRect(x - 20, y - 60, 40, 30);
    g.fillStyle = "#2b1d13";
    g.fillRect(x - 20, y - 60, 40, 2);
    g.fillStyle = "#e7dcc3";
    g.fillRect(x - 16, y - 56, 14, 18);
    g.fillRect(x + 1, y - 54, 15, 12);
    g.fillStyle = "#c2412d";
    g.fillRect(x - 10, y - 57, 2, 2);
    g.fillRect(x + 8, y - 55, 2, 2);
  }

  drawMarkers(g, x0, x1) {
    const t = this.t;
    const p = this.player;
    const all = this.npcs.length && this.npcs.every((n) => n.earned);
    this.npcs.forEach((n) => {
      if (n.x < x0 || n.x > x1) return;
      const y = n.y - 74 + Math.sin(t * 3 + n.x) * 2.5;
      if (n.earned) {
        g.fillStyle = "#79b86f";
        g.beginPath();
        g.arc(n.x, y, 8, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "#0b0f14";
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(n.x - 3.5, y);
        g.lineTo(n.x - 1, y + 3);
        g.lineTo(n.x + 4, y - 3);
        g.stroke();
      } else {
        g.save();
        g.translate(n.x, y);
        g.rotate(Math.PI / 4);
        g.fillStyle = "#e7a93a";
        g.fillRect(-7, -7, 14, 14);
        g.restore();
        g.fillStyle = "#1b1306";
        g.font = '700 12px "IBM Plex Sans", sans-serif';
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("?", n.x, y + 0.5);
      }
      if (Math.hypot(p.x - n.x, p.y - n.y) < 170 && n.name) this.tag(g, n.x, n.y - 94, n.name, n.color);
    });
    // station
    if (STATION_X > x0 && STATION_X < x1) {
      const y = FACADE_BASE - 152 + Math.sin(t * 3) * 2.5;
      if (all) {
        g.fillStyle = "#e7a93a";
        g.beginPath();
        g.arc(STATION_X, y, 10, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#1b1306";
        g.font = '700 14px "IBM Plex Sans", sans-serif';
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("!", STATION_X, y + 0.5);
      }
      if (Math.abs(p.x - STATION_X) < 220) this.tag(g, STATION_X, FACADE_BASE - 172, all ? "Politiebureau: make your case" : "Politiebureau: needs 3 clues", all ? "#e7a93a" : "#5f6b7c");
    }
    if (Math.hypot(p.x - BOARD.x, p.y - BOARD.y) < 140) this.tag(g, BOARD.x, BOARD.y - 76, "Case notice", "#e7dcc3");
  }

  tag(g, x, y, text, color) {
    g.font = '600 11px "IBM Plex Sans", sans-serif';
    const w = g.measureText(text).width + 16;
    g.fillStyle = "rgba(9,12,17,.85)";
    g.fillRect(x - w / 2, y - 10, w, 20);
    g.fillStyle = color;
    g.fillRect(x - w / 2, y - 10, 2, 20);
    g.fillStyle = "#e9e2d4";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, x + 1, y + 0.5);
  }

  drawOffscreenArrows(g) {
    const all = this.npcs.every((n) => n.earned);
    const targets = all ? [{ x: STATION_X, color: "#e7a93a" }] : this.npcs.filter((n) => !n.earned).map((n) => ({ x: n.x, color: n.color }));
    const pulse = 0.65 + Math.sin(this.t * 4) * 0.25;
    for (const tg of targets) {
      const sx = tg.x - this.cam;
      if (sx > -10 && sx < VW + 10) continue;
      const left = sx < 0;
      const ax = left ? 16 : VW - 16;
      const ay = 300;
      g.globalAlpha = pulse;
      g.fillStyle = tg.color;
      g.beginPath();
      g.moveTo(ax + (left ? -6 : 6), ay);
      g.lineTo(ax + (left ? 8 : -8), ay - 9);
      g.lineTo(ax + (left ? 8 : -8), ay + 9);
      g.closePath();
      g.fill();
      g.globalAlpha = 1;
    }
  }

  // ---- interview room ----------------------------------------------------

  drawInterior(g) {
    const i = this.interior.i;
    const n = this.npcs[i];
    const t = this.t;
    const r = rng(100 + i);
    const tint = n.color;

    // wall
    g.fillStyle = shade(tint, -0.78);
    g.fillRect(0, 0, VW, 330);
    g.fillStyle = shade(tint, -0.72);
    for (let x = 0; x < VW; x += 28) g.fillRect(x, 0, 12, 300);
    g.fillStyle = "#2a1c14";
    g.fillRect(0, 300, VW, 100);
    g.fillStyle = "#33231a";
    for (let x = 16; x < VW; x += 120) g.fillRect(x, 314, 100, 70);
    g.fillStyle = "#4a3324";
    g.fillRect(0, 298, VW, 5);
    // floor
    g.fillStyle = "#1e150f";
    g.fillRect(0, 400, VW, 140);
    g.fillStyle = "#17100b";
    for (let y = 410; y < VH; y += 16) g.fillRect(0, y, VW, 1);

    // window with rain
    const wx = 690;
    const wy = 70;
    g.fillStyle = "#3a281c";
    g.fillRect(wx - 10, wy - 10, 200, 220);
    const night = g.createLinearGradient(0, wy, 0, wy + 200);
    night.addColorStop(0, "#0a1322");
    night.addColorStop(1, "#18263a");
    g.fillStyle = night;
    g.fillRect(wx, wy, 180, 200);
    g.fillStyle = "#0e1828";
    g.fillRect(wx, wy + 110, 180, 90);
    for (let k = 0; k < 9; k++) {
      g.fillStyle = r() < 0.5 ? "#e9a23b" : "#152033";
      g.fillRect(wx + 10 + k * 19, wy + 128 + (k % 3) * 18, 8, 10);
    }
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
    g.fillStyle = "#3a281c";
    g.fillRect(wx + 86, wy, 8, 200);
    g.fillRect(wx, wy + 96, 180, 8);
    g.fillStyle = "#5a3e2a";
    g.fillRect(wx - 16, wy + 206, 212, 8);

    // shelves on the left, themed by witness
    for (let s = 0; s < 3; s++) {
      const sy = 120 + s * 62;
      g.fillStyle = "#4a3324";
      g.fillRect(60, sy, 250, 6);
      g.fillStyle = "rgba(0,0,0,.3)";
      g.fillRect(60, sy + 6, 250, 3);
      let x = 70;
      while (x < 296) {
        if (i % 3 === 0) {
          // flower pots
          g.fillStyle = "#7a4a2e";
          g.fillRect(x, sy - 16, 14, 16);
          const fc = ["#d9475e", "#f0c24a", "#e7e0d0", "#b05ad0", "#e8743b"][Math.floor(r() * 5)];
          g.fillStyle = "#3d6a3a";
          g.fillRect(x + 6, sy - 28, 2, 12);
          g.fillStyle = fc;
          g.fillRect(x + 2, sy - 34, 10, 8);
          x += 22;
        } else if (i % 3 === 1) {
          // ledgers
          const h = 26 + r() * 18;
          g.fillStyle = ["#5a1f22", "#1f3a5a", "#2e4a2e", "#5a4a2a", "#3a2a4a"][Math.floor(r() * 5)];
          g.fillRect(x, sy - h, 9, h);
          g.fillStyle = "rgba(230,200,120,.5)";
          g.fillRect(x + 2, sy - h + 5, 5, 1);
          x += 10 + (r() < 0.15 ? 12 : 0);
        } else {
          // jars and crates
          if (r() < 0.5) {
            g.fillStyle = "rgba(180,200,170,.35)";
            g.fillRect(x, sy - 22, 14, 22);
            g.fillStyle = ["#c9a14a", "#8a5a2a", "#6a8a3a"][Math.floor(r() * 3)];
            g.fillRect(x + 1, sy - 14, 12, 13);
            g.fillStyle = "#3a2a1a";
            g.fillRect(x - 1, sy - 25, 16, 3);
            x += 20;
          } else {
            g.fillStyle = "#6b4a2a";
            g.fillRect(x, sy - 24, 26, 24);
            g.fillStyle = "#4a321c";
            g.fillRect(x, sy - 13, 26, 2);
            g.fillRect(x + 12, sy - 24, 2, 24);
            x += 32;
          }
        }
      }
    }
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

    // the witness
    const mouth = this.speaking ? (Math.sin(t * 22) > 0 ? 1 : 0.4) : 0;
    const breathe = Math.sin(t * 1.8) > 0.3 ? 0.4 : 0;
    const look = npcLook(i, n.color);
    drawPerson(g, 480, 444, { ...look, scale: 8, facing: "down", bob: breathe, blink: t > this.blinkAt - 0.13, mouth: mouth || 0.01, shadow: false });

    // desk
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
    // papers and desk lamp
    g.save();
    g.translate(600, 380);
    g.rotate(-0.06);
    g.fillStyle = "#e7dcc3";
    g.fillRect(0, -6, 70, 10);
    g.fillStyle = "#d8cbb0";
    g.fillRect(8, -9, 64, 6);
    g.restore();
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
    // earned evidence on the desk
    if (n.earned) {
      g.save();
      g.translate(380, 374);
      g.rotate(0.05);
      g.fillStyle = "#efe6d2";
      g.fillRect(0, 0, 70, 12);
      g.fillStyle = "#2f7a3a";
      g.fillRect(48, 2, 16, 8);
      g.restore();
    }

    // light
    g.globalCompositeOperation = "lighter";
    const gl = (x, y, rad, col) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, col);
      gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    };
    gl(480, 80, 330, "rgba(255,180,90,.18)");
    gl(234, 360, 120, "rgba(255,190,110,.2)");
    gl(780, 170, 160, "rgba(110,150,220,.07)");
    g.globalCompositeOperation = "source-over";

    // thinking bubble
    if (this.thinking) {
      for (let k = 0; k < 3; k++) {
        const a = 0.35 + 0.65 * (Math.sin(t * 6 - k * 0.9) * 0.5 + 0.5);
        g.fillStyle = `rgba(233,226,212,${a})`;
        g.beginPath();
        g.arc(560 + k * 18, 170 - k * 8, 5 + k, 0, Math.PI * 2);
        g.fill();
      }
    }

    // detective, over the shoulder
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

    // sparks and flash
    for (const s of this.sparks) {
      g.fillStyle = `rgba(255,${190 + Math.floor(s.life * 40)},90,${Math.min(1, s.life)})`;
      g.fillRect(s.x, s.y, 3, 3);
    }
    if (this.flash > 0) {
      g.fillStyle = `rgba(255,236,190,${this.flash * 0.35})`;
      g.fillRect(0, 0, VW, VH);
    }
  }
}
