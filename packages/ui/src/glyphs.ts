// The remote's buttons as small glyphs, and the hint chips that pair one with
// what it does now: how the game says what each button does, at the moment it
// matters, without the player reading a manual.

import { INK, TAU, font, roundedRect } from "./draw.ts";

type Ctx = CanvasRenderingContext2D;

export type Glyph = "swipe" | "select" | "hold" | "leftRight" | "upDown" | "arrows" | "playPause" | "back";

const FACE = "#f4f8fc";
const EDGE = "#24456b";
const LIT = "#2bb8f0";

function pad(g: Ctx, x: number, y: number, r: number) {
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  const body = g.createLinearGradient(0, y - r, 0, y + r);
  body.addColorStop(0, "#ffffff");
  body.addColorStop(1, "#c9d8e6");
  g.fillStyle = body;
  g.fill();
  g.lineWidth = 1.5;
  g.strokeStyle = EDGE;
  g.stroke();
}

function ringArc(g: Ctx, x: number, y: number, r: number, centre: number) {
  g.beginPath();
  g.arc(x, y, r * 0.78, centre - 0.5, centre + 0.5);
  g.lineWidth = r * 0.3;
  g.lineCap = "round";
  g.strokeStyle = LIT;
  g.stroke();
}

/** Draws a glyph centred on (x, y), `size` across. `t` (seconds) animates the moving ones. */
export function drawGlyph(g: Ctx, glyph: Glyph, x: number, y: number, size: number, t = 0) {
  const r = size / 2;
  g.save();
  switch (glyph) {
    case "swipe": {
      // The touch surface with a finger gliding across it.
      roundedRect(g, x - r, y - r, size, size, r * 0.45);
      g.fillStyle = FACE;
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = EDGE;
      g.stroke();
      const s = Math.sin(t * 2.4);
      const fx = x + s * r * 0.45;
      const fy = y + Math.cos(t * 1.7) * r * 0.25;
      g.beginPath();
      g.moveTo(fx - s * r * 0.5, fy);
      g.lineTo(fx, fy);
      g.lineWidth = r * 0.22;
      g.lineCap = "round";
      g.strokeStyle = "rgba(43, 184, 240, 0.35)";
      g.stroke();
      g.beginPath();
      g.arc(fx, fy, r * 0.24, 0, TAU);
      g.fillStyle = LIT;
      g.fill();
      break;
    }
    case "select":
    case "hold": {
      pad(g, x, y, r);
      g.beginPath();
      g.arc(x, y, r * 0.42, 0, TAU);
      g.fillStyle = LIT;
      g.fill();
      if (glyph === "hold") {
        // A ring filling round the centre: keep it pressed.
        g.beginPath();
        g.arc(x, y, r * 0.62, -Math.PI / 2, -Math.PI / 2 + ((t * 0.8) % 1) * TAU);
        g.lineWidth = r * 0.14;
        g.strokeStyle = "#ff9a2e";
        g.stroke();
      }
      break;
    }
    case "leftRight":
    case "upDown":
    case "arrows": {
      pad(g, x, y, r);
      if (glyph !== "upDown") {
        ringArc(g, x, y, r, 0);
        ringArc(g, x, y, r, Math.PI);
      }
      if (glyph !== "leftRight") {
        ringArc(g, x, y, r, Math.PI / 2);
        ringArc(g, x, y, r, -Math.PI / 2);
      }
      g.beginPath();
      g.arc(x, y, r * 0.3, 0, TAU);
      g.fillStyle = "#dfe8f1";
      g.fill();
      break;
    }
    case "playPause": {
      pad(g, x, y, r);
      g.fillStyle = INK;
      const k = r * 0.38;
      g.beginPath();
      g.moveTo(x - k * 1.1, y - k);
      g.lineTo(x + k * 0.1, y);
      g.lineTo(x - k * 1.1, y + k);
      g.closePath();
      g.fill();
      g.fillRect(x + k * 0.35, y - k, k * 0.32, k * 2);
      g.fillRect(x + k * 0.85, y - k, k * 0.32, k * 2);
      break;
    }
    case "back": {
      pad(g, x, y, r);
      g.beginPath();
      g.moveTo(x + r * 0.15, y - r * 0.35);
      g.lineTo(x - r * 0.22, y);
      g.lineTo(x + r * 0.15, y + r * 0.35);
      g.lineWidth = r * 0.18;
      g.lineCap = "round";
      g.lineJoin = "round";
      g.strokeStyle = INK;
      g.stroke();
      break;
    }
  }
  g.restore();
}

/**
 * A hint chip: a glyph and what it does, on a small pane of glass. Returns
 * its width. `x` is its left edge, `y` its vertical centre.
 */
export function hintChip(g: Ctx, x: number, y: number, glyph: Glyph, label: string, t = 0, size = 15) {
  const h = size * 1.75;
  g.font = font(size);
  const w = h + g.measureText(label).width + size * 0.9;
  roundedRect(g, x, y - h / 2, w, h, h / 2);
  const body = g.createLinearGradient(0, y - h / 2, 0, y + h / 2);
  body.addColorStop(0, "rgba(255, 255, 255, 0.88)");
  body.addColorStop(1, "rgba(200, 230, 252, 0.82)");
  g.fillStyle = body;
  g.fill();
  g.lineWidth = 1.2;
  g.strokeStyle = "rgba(30, 100, 170, 0.45)";
  g.stroke();
  drawGlyph(g, glyph, x + h / 2, y, h * 0.72, t);
  g.font = font(size);
  g.textAlign = "left";
  g.textBaseline = "middle";
  g.fillStyle = INK;
  g.fillText(label, x + h * 0.95, y + 1);
  return w;
}

/** How wide a hint chip will be. */
export function hintWidth(g: Ctx, label: string, size = 15) {
  g.font = font(size);
  return size * 1.75 + g.measureText(label).width + size * 0.9;
}
