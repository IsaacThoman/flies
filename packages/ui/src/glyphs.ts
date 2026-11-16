// The buttons of whatever the player holds, as small glyphs (the remote's,
// a keyboard's keys, a game pad's), and the hint chips that pair one with
// what it does now: how the game says what each button does, at the moment it
// matters, without the player reading a manual.

import { INK, TAU, font, roundedRect } from "./draw.ts";

type Ctx = CanvasRenderingContext2D;

export type Glyph = "swipe" | "select" | "hold" | "leftRight" | "upDown" | "arrows" | "playPause" | "back";
/** Whose buttons: the Apple TV remote's, a keyboard's, or a game pad's (the standard layout: A, B, Start, the d-pad, the left stick). */
export type GlyphSet = "remote" | "keys" | "pad";

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

/** A lit arrowhead on the clickpad's ring, pointing out at `angle` (0 right, π/2 down). */
function ringArrow(g: Ctx, x: number, y: number, r: number, angle: number) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const tip = r * 0.92;
  const base = r * 0.5;
  const half = r * 0.32;
  g.beginPath();
  g.moveTo(x + c * tip, y + s * tip);
  g.lineTo(x + c * base - s * half, y + s * base + c * half);
  g.lineTo(x + c * base + s * half, y + s * base - c * half);
  g.closePath();
  g.fillStyle = LIT;
  g.fill();
}

/** Draws a glyph centred on (x, y), `size` tall (and across, but for a keyboard's wider keys). `t` (seconds) animates the moving ones. */
export function drawGlyph(g: Ctx, glyph: Glyph, x: number, y: number, size: number, t = 0, set: GlyphSet = "remote") {
  if (set === "keys") keysGlyph(g, glyph, x, y, size, t);
  else if (set === "pad") padGlyph(g, glyph, x, y, size, t);
  else remoteGlyph(g, glyph, x, y, size, t);
}

function remoteGlyph(g: Ctx, glyph: Glyph, x: number, y: number, size: number, t: number) {
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
        ringArrow(g, x, y, r, 0);
        ringArrow(g, x, y, r, Math.PI);
      }
      if (glyph !== "leftRight") {
        ringArrow(g, x, y, r, Math.PI / 2);
        ringArrow(g, x, y, r, -Math.PI / 2);
      }
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

/** What a keyboard's key says, for a glyph: the arrows are drawn, not written. */
const KEY_LABELS: Partial<Record<Glyph, string>> = { select: "Enter", hold: "Enter", playPause: "Esc", back: "Esc" };

/** A key: a rounded cap with a lip, `w` wide and `h` tall, centred on (x, y). */
function keycap(g: Ctx, x: number, y: number, w: number, h: number) {
  roundedRect(g, x - w / 2, y - h / 2 + h * 0.08, w, h, h * 0.22);
  g.fillStyle = "#9fb3c8";
  g.fill();
  roundedRect(g, x - w / 2, y - h / 2, w, h * 0.92, h * 0.22);
  const face = g.createLinearGradient(0, y - h / 2, 0, y + h / 2);
  face.addColorStop(0, "#ffffff");
  face.addColorStop(1, "#dde7f1");
  g.fillStyle = face;
  g.fill();
  g.lineWidth = 1.2;
  g.strokeStyle = EDGE;
  g.stroke();
}

/** A small filled triangle pointing at `angle` (0 right, π/2 down). */
function arrowhead(g: Ctx, x: number, y: number, r: number, angle: number, color: string) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  g.beginPath();
  g.moveTo(x + c * r, y + s * r);
  g.lineTo(x - c * r * 0.7 - s * r * 0.8, y - s * r * 0.7 + c * r * 0.8);
  g.lineTo(x - c * r * 0.7 + s * r * 0.8, y - s * r * 0.7 - c * r * 0.8);
  g.closePath();
  g.fillStyle = color;
  g.fill();
}

/** How wide a keyboard's glyph is at `size` tall: a key with a word on it is wider than it is tall, and a pair of arrows is two keys. */
function keysWidth(g: Ctx, glyph: Glyph, size: number) {
  const label = KEY_LABELS[glyph];
  if (label) {
    g.font = font(size * 0.56);
    return Math.max(size, g.measureText(label).width + size * 0.5);
  }
  return glyph === "leftRight" || glyph === "upDown" ? size * 1.9 : size;
}

function keysGlyph(g: Ctx, glyph: Glyph, x: number, y: number, size: number, t: number) {
  g.save();
  const label = KEY_LABELS[glyph];
  if (label) {
    const w = keysWidth(g, glyph, size);
    keycap(g, x, y, w, size);
    g.font = font(size * 0.56);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = INK;
    g.fillText(label, x, y - size * 0.03);
    if (glyph === "hold") {
      // A bar filling along the key: keep it pressed.
      g.fillStyle = "#ff9a2e";
      g.fillRect(x - w / 2 + size * 0.14, y + size * 0.26, (w - size * 0.28) * ((t * 0.8) % 1), size * 0.08);
    }
  } else if (glyph === "leftRight" || glyph === "upDown") {
    const k = size * 0.86;
    for (const side of [-1, 1]) {
      keycap(g, x + side * size * 0.48, y, k, k);
      const angle = glyph === "leftRight" ? (side < 0 ? Math.PI : 0) : side < 0 ? -Math.PI / 2 : Math.PI / 2;
      arrowhead(g, x + side * size * 0.48, y - k * 0.04, k * 0.22, angle, LIT);
    }
  } else if (glyph === "arrows") {
    keycap(g, x, y, size, size);
    for (let i = 0; i < 4; i++) arrowhead(g, x + Math.cos((i * Math.PI) / 2) * size * 0.26, y + Math.sin((i * Math.PI) / 2) * size * 0.26 - size * 0.04, size * 0.13, (i * Math.PI) / 2, LIT);
  } else {
    // The mouse: what moves the hand when the keys are in use.
    roundedRect(g, x - size * 0.32, y - size * 0.48, size * 0.64, size * 0.96, size * 0.32);
    g.fillStyle = FACE;
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = EDGE;
    g.stroke();
    g.beginPath();
    g.moveTo(x, y - size * 0.48);
    g.lineTo(x, y - size * 0.12);
    g.stroke();
    g.beginPath();
    g.arc(x + Math.sin(t * 2.4) * size * 0.05, y + size * 0.18, size * 0.07, 0, TAU);
    g.fillStyle = LIT;
    g.fill();
  }
  g.restore();
}

const PAD_FACES: Partial<Record<Glyph, { letter: string; color: string }>> = {
  select: { letter: "A", color: "#4cbf3a" },
  hold: { letter: "A", color: "#4cbf3a" },
  back: { letter: "B", color: "#e8463c" },
};

function padGlyph(g: Ctx, glyph: Glyph, x: number, y: number, size: number, t: number) {
  const r = size / 2;
  g.save();
  const face = PAD_FACES[glyph];
  if (face) {
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
    g.font = font(size * 0.62);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = face.color;
    g.fillText(face.letter, x, y + size * 0.03);
    if (glyph === "hold") {
      g.beginPath();
      g.arc(x, y, r * 0.84, -Math.PI / 2, -Math.PI / 2 + ((t * 0.8) % 1) * TAU);
      g.lineWidth = r * 0.14;
      g.strokeStyle = "#ff9a2e";
      g.stroke();
    }
  } else if (glyph === "leftRight" || glyph === "upDown" || glyph === "arrows") {
    // The d-pad: a cross, its arms lit the ways that do something.
    const arm = r * 0.36;
    g.beginPath();
    g.rect(x - arm, y - r, arm * 2, size);
    g.rect(x - r, y - arm, size, arm * 2);
    g.fillStyle = FACE;
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = EDGE;
    g.stroke();
    for (let i = 0; i < 4; i++) {
      const across = i % 2 === 0;
      if ((glyph === "leftRight" && !across) || (glyph === "upDown" && across)) continue;
      const a = (i * Math.PI) / 2;
      arrowhead(g, x + Math.cos(a) * r * 0.66, y + Math.sin(a) * r * 0.66, r * 0.24, a, LIT);
    }
  } else if (glyph === "playPause") {
    // Start, or Menu: a small pill with three lines.
    roundedRect(g, x - r * 0.9, y - r * 0.6, r * 1.8, r * 1.2, r * 0.6);
    g.fillStyle = FACE;
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = EDGE;
    g.stroke();
    g.fillStyle = INK;
    for (let i = -1; i <= 1; i++) g.fillRect(x - r * 0.42, y + i * r * 0.3 - r * 0.06, r * 0.84, r * 0.12);
  } else {
    // The left stick, rolling round.
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fillStyle = "#c9d8e6";
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = EDGE;
    g.stroke();
    g.beginPath();
    g.arc(x + Math.sin(t * 2.4) * r * 0.3, y + Math.cos(t * 1.7) * r * 0.2, r * 0.58, 0, TAU);
    g.fillStyle = FACE;
    g.fill();
    g.stroke();
  }
  g.restore();
}

/** The room a chip gives its glyph, at a chip `h` tall. */
function glyphSlot(g: Ctx, glyph: Glyph, h: number, set: GlyphSet) {
  return set === "keys" ? Math.max(h, keysWidth(g, glyph, h * 0.72) + h * 0.28) : h;
}

/**
 * A hint chip: a glyph and what it does, on a small pane of glass. Returns
 * its width. `x` is its left edge, `y` its vertical centre.
 */
export function hintChip(g: Ctx, x: number, y: number, glyph: Glyph, label: string, t = 0, size = 15, set: GlyphSet = "remote") {
  const h = size * 1.75;
  const slot = glyphSlot(g, glyph, h, set);
  g.font = font(size);
  const w = slot + g.measureText(label).width + size * 0.9;
  roundedRect(g, x, y - h / 2, w, h, h / 2);
  const body = g.createLinearGradient(0, y - h / 2, 0, y + h / 2);
  body.addColorStop(0, "rgba(255, 255, 255, 0.88)");
  body.addColorStop(1, "rgba(200, 230, 252, 0.82)");
  g.fillStyle = body;
  g.fill();
  g.lineWidth = 1.2;
  g.strokeStyle = "rgba(30, 100, 170, 0.45)";
  g.stroke();
  drawGlyph(g, glyph, x + slot / 2, y, h * 0.72, t, set);
  g.font = font(size);
  g.textAlign = "left";
  g.textBaseline = "middle";
  g.fillStyle = INK;
  g.fillText(label, x + slot - h * 0.05, y + 1);
  return w;
}

/** How wide a hint chip will be (with the remote's glyph, unless another `glyph` and `set` are given). */
export function hintWidth(g: Ctx, label: string, size = 15, glyph: Glyph = "select", set: GlyphSet = "remote") {
  const h = size * 1.75;
  const slot = glyphSlot(g, glyph, h, set);
  g.font = font(size);
  return slot + g.measureText(label).width + size * 0.9;
}
