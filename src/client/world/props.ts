// Street furniture and small overlays, drawn at world positions.
import { BOARD, COLORS } from "./constants.ts";

export function drawLamp(g: CanvasRenderingContext2D, x: number, y: number): void {
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

const TREE_BLOBS: readonly [number, number, number][] = [
  [0, -78, 30],
  [-22, -64, 22],
  [22, -64, 22],
  [-10, -96, 20],
  [14, -92, 20],
];

export function drawTree(g: CanvasRenderingContext2D, x: number, y: number): void {
  g.fillStyle = "rgba(0,0,0,.35)";
  g.beginPath();
  g.ellipse(x, y, 16, 4, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#2a1d14";
  g.fillRect(x - 4, y - 46, 8, 46);
  for (const [bx, by, r] of TREE_BLOBS) {
    g.fillStyle = "#16291e";
    g.beginPath();
    g.arc(x + bx, y + by, r, 0, Math.PI * 2);
    g.fill();
  }
  for (const [bx, by, r] of TREE_BLOBS) {
    g.fillStyle = "#20392a";
    g.beginPath();
    g.arc(x + bx - 3, y + by - 4, r * 0.65, 0, Math.PI * 2);
    g.fill();
  }
}

export function drawBench(g: CanvasRenderingContext2D, x: number, y: number): void {
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

export function drawBike(g: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  g.strokeStyle = "#8f959d";
  g.lineWidth = 1.2;
  g.beginPath();
  g.arc(x - 9, y - 7, 6.5, 0, Math.PI * 2);
  g.moveTo(x + 15.5, y - 7);
  g.arc(x + 9, y - 7, 6.5, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = color;
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

/** The notice board on the quay, where the briefing can be read again. */
export function drawNoticeBoard(g: CanvasRenderingContext2D): void {
  const { x, y } = BOARD;
  g.fillStyle = "#1a1410";
  g.fillRect(x - 15, y - 34, 3, 34);
  g.fillRect(x + 12, y - 34, 3, 34);
  g.fillStyle = "#3d2a1d";
  g.fillRect(x - 20, y - 60, 40, 30);
  g.fillStyle = "#2b1d13";
  g.fillRect(x - 20, y - 60, 40, 2);
  g.fillStyle = COLORS.paper;
  g.fillRect(x - 16, y - 56, 14, 18);
  g.fillRect(x + 1, y - 54, 15, 12);
  g.fillStyle = "#c2412d";
  g.fillRect(x - 10, y - 57, 2, 2);
  g.fillRect(x + 8, y - 55, 2, 2);
}

/** A floating name tag with a coloured accent bar. */
export function drawTag(g: CanvasRenderingContext2D, x: number, y: number, text: string, color: string): void {
  g.font = '600 11px "IBM Plex Sans", sans-serif';
  const w = g.measureText(text).width + 16;
  g.fillStyle = "rgba(9,12,17,.85)";
  g.fillRect(x - w / 2, y - 10, w, 20);
  g.fillStyle = color;
  g.fillRect(x - w / 2, y - 10, 2, 20);
  g.fillStyle = COLORS.text;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, x + 1, y + 0.5);
}

/** Soft radial light. Use with globalCompositeOperation = "lighter". */
export function drawGlow(g: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string): void {
  const glow = g.createRadialGradient(x, y, 0, x, y, radius);
  glow.addColorStop(0, color);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = glow;
  g.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}
