// Street layout in world units. The viewport is 960x540 and scrolls horizontally.

export interface Point {
  x: number;
  y: number;
}

export interface Band {
  top: number;
  bottom: number;
}

export const VIEW_W = 960;
export const VIEW_H = 540;
export const WORLD_W = 2400;
/** Internal resolution multiplier for crisp text and edges. */
export const RENDER_SCALE = 2;

export const FACADE_BASE = 262;
export const STREET: Band = { top: 274, bottom: 338 };
export const CANAL: Band = { top: 350, bottom: 438 };
export const QUAY: Band = { top: 454, bottom: 528 };
export const BRIDGES: readonly { x: number; w: number }[] = [
  { x: 760, w: 120 },
  { x: 1780, w: 120 },
];

/** Shop centre per witness; each witness stands just right of their door. */
export const NPC_HOUSE_X = [430, 1090, 1560] as const;
export const NPC_OFFSET_X = 46;
export const NPC_Y = 300;
export const STATION_X = 2150;
export const BOARD: Point = { x: 300, y: 462 };
export const SPAWN: Point = { x: 210, y: 492 };

/** World units per second. */
export const WALK_SPEED = 170;
export const NPC_REACH = 64;

export const TREES: readonly Point[] = [110, 540, 1010, 1330, 1650, 2060, 2330].map((x) => ({ x, y: 512 }));
export const BENCHES: readonly Point[] = [680, 1250, 2000].map((x) => ({ x, y: 480 }));
const BIKE_COLORS = ["#7a2a2a", "#2a4a7a", "#c9b37a", "#3a3a3a", "#5a7a3a", "#7a5a2a"];
export const BIKES: readonly (Point & { color: string })[] = [300, 610, 1230, 1400, 1990, 2280].map((x, i) => ({
  x,
  y: 343,
  color: BIKE_COLORS[i] ?? "#3a3a3a",
}));
export const STREET_LAMPS: readonly Point[] = [150, 450, 700, 1000, 1300, 1700, 2000, 2350].map((x) => ({ x, y: 344 }));
export const QUAY_LAMPS: readonly Point[] = [420, 900, 1500, 1920, 2240].map((x) => ({ x, y: 451 }));

export interface Look {
  skin: string;
  hair: string;
  pants: string;
  coat?: string;
  coatDark?: string;
  collar?: string;
  tie?: string;
  hat?: string;
  band?: string;
  cap?: boolean;
  longHair?: boolean;
  beard?: boolean;
}

export const PLAYER_LOOK: Look & { coat: string } = {
  hat: "#2b2119",
  band: "#5a3d22",
  hair: "#3b2a1e",
  skin: "#e6c29a",
  coat: "#a98250",
  coatDark: "#7c5d36",
  pants: "#22262d",
  collar: "#ddd5c2",
};

/** Appearance per witness slot. The coat colour comes from the case. */
export const NPC_LOOKS: readonly [Look, ...Look[]] = [
  { hair: "#8b3f22", longHair: true, skin: "#ecc8a4", pants: "#2a2a33", collar: "#efe6d2" },
  { hat: "#16191f", band: "#3a3f4a", hair: "#55504a", skin: "#dcb894", tie: "#8a1f2a", collar: "#e9e9e9", pants: "#1b1e24" },
  { hat: "#5e4a30", cap: true, hair: "#9a8a6a", beard: true, skin: "#d2a37a", collar: "#c8bfa8", pants: "#3a3326" },
];

export interface ShopFront {
  sign: string;
  color: string;
}

/** Shown on the title screen backdrop before a case is loaded. */
export const DEFAULT_SHOPS: readonly ShopFront[] = [
  { sign: "BLOEMEN", color: "#c2416b" },
  { sign: "BANK", color: "#3b6ea5" },
  { sign: "BOERDERIJ", color: "#5f8a35" },
];

export const COLORS = {
  amber: "#e7a93a",
  amberInk: "#1b1306",
  green: "#79b86f",
  ink: "#0b0f14",
  text: "#e9e2d4",
  dim: "#5f6b7c",
  paper: "#e7dcc3",
} as const;
