// Walking rules and path planning. No DOM access, so this is unit tested in Node.
import { BENCHES, BOARD, BRIDGES, CANAL, QUAY, STREET, TREES, WORLD_W, type Point } from "./constants.ts";
import { clamp } from "./math.ts";

export type Region = "street" | "bridge" | "quay";

const EDGE_MARGIN = 18;
const BRIDGE_RAIL = 16;
/** Personal space around a witness. y is squashed for the top-down perspective. */
const NPC_RADIUS = 13;
const NPC_Y_SQUASH = 1.6;

interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const OBSTACLES: readonly Rect[] = [
  ...TREES.map((t) => ({ x0: t.x - 8, x1: t.x + 8, y0: t.y - 7, y1: t.y + 4 })),
  ...BENCHES.map((b) => ({ x0: b.x - 26, x1: b.x + 26, y0: b.y - 9, y1: b.y + 2 })),
  { x0: BOARD.x - 20, x1: BOARD.x + 20, y0: BOARD.y - 7, y1: BOARD.y + 2 },
];

export function regionAt(y: number): Region {
  if (y <= STREET.bottom + 2) return "street";
  if (y >= QUAY.top - 2) return "quay";
  return "bridge";
}

export function isOnBridge(x: number): boolean {
  return BRIDGES.some((b) => x >= b.x + BRIDGE_RAIL && x <= b.x + b.w - BRIDGE_RAIL);
}

function bumpsIntoNpc(x: number, y: number, npcs: readonly Point[], margin = 0): boolean {
  return npcs.some((n) => Math.hypot(n.x - x, (n.y - y) * NPC_Y_SQUASH) < NPC_RADIUS + margin);
}

export function isWalkable(x: number, y: number, npcs: readonly Point[] = []): boolean {
  if (x < EDGE_MARGIN || x > WORLD_W - EDGE_MARGIN) return false;
  const onStreet = y >= STREET.top && y <= STREET.bottom;
  const onQuay = y >= QUAY.top && y <= QUAY.bottom;
  const onCanal = y > STREET.bottom && y < QUAY.top;
  if (!onStreet && !onQuay && !(onCanal && isOnBridge(x))) return false;
  if (OBSTACLES.some((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1)) return false;
  return !bumpsIntoNpc(x, y, npcs);
}

/** Centre x of the bridge with the shortest detour between two x positions. */
export function bestBridgeX(fromX: number, toX: number): number {
  const centres = BRIDGES.map((b) => b.x + b.w / 2);
  const detour = (cx: number) => Math.abs(fromX - cx) + Math.abs(toX - cx);
  return centres.reduce((best, cx) => (detour(cx) < detour(best) ? cx : best));
}

/** The bridge whose approach x is in, if any. Lets keyboard players slide onto it. */
export function bridgeNear(x: number, slack = 34): { x: number; w: number } | undefined {
  return BRIDGES.find((b) => Math.abs(x - (b.x + b.w / 2)) < b.w / 2 + slack);
}

function bridgeEnd(region: Region): number {
  return region === "street" ? STREET.bottom - 4 : QUAY.top + 4;
}

/** Waypoints to the target, over a bridge when needed and around witnesses in the way. */
export function planPath(from: Point, to: Point, npcs: readonly Point[] = []): Point[] {
  const start = regionAt(from.y);
  const end = regionAt(to.y);
  const waypoints: Point[] = [];
  if (start !== end && start !== "bridge" && end !== "bridge") {
    const cx = bestBridgeX(from.x, to.x);
    waypoints.push({ x: cx, y: bridgeEnd(start) }, { x: cx, y: bridgeEnd(end) });
  } else if (start === "bridge" && end !== "bridge") {
    waypoints.push({ x: from.x, y: bridgeEnd(end) });
  }

  // Witnesses stand in the street. Detour along the canal-side lane, which is always clear.
  const legStart = waypoints.at(-1) ?? from;
  if (end === "street" && isSegmentBlocked(legStart, to, npcs)) {
    const lane = STREET.bottom - 4;
    if (Math.abs(legStart.y - lane) > 1) waypoints.push({ x: legStart.x, y: lane });
    waypoints.push({ x: to.x, y: lane });
  }
  waypoints.push(to);
  return waypoints;
}

function isSegmentBlocked(a: Point, b: Point, npcs: readonly Point[]): boolean {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4);
  for (let i = 1; i <= steps; i++) {
    const x = a.x + ((b.x - a.x) * i) / steps;
    const y = a.y + ((b.y - a.y) * i) / steps;
    if (bumpsIntoNpc(x, y, npcs, 2)) return true;
  }
  return false;
}

/** Nearest sensible walk target for a click anywhere on screen. */
export function snapToWalkable(x: number, y: number): Point {
  let ty = y;
  if (ty < STREET.top) ty = STREET.top + 6;
  else if (ty > STREET.bottom && ty < QUAY.top && !isOnBridge(x)) {
    ty = ty < (CANAL.top + CANAL.bottom) / 2 ? STREET.bottom - 4 : QUAY.top + 4;
  } else if (ty > QUAY.bottom) ty = QUAY.bottom - 4;
  return { x: clamp(x, 24, WORLD_W - 24), y: ty };
}
