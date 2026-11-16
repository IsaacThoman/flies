// The game's name. On this branch, candidate names, each in a few directions
// to choose between: `?name=spike&wordmark=b` in the address (or `wordname`
// and `wordmark` in the console) picks one. With no name it is the current
// glossy "flies"; a name alone shows its first direction.
// Each sits on a baseline at (x, y), centred, about `size` tall above it.

import { FONT, INK, TAU } from "@fly/ui";
import { WORDMARK_FACES } from "./wordmark-fonts.ts";

type Ctx = CanvasRenderingContext2D;
type Direction = (g: Ctx, x: number, y: number, size: number, t: number, still: boolean) => void;

const scope = globalThis as { wordname?: string; wordmark?: string };
const param = (key: string): string | null => {
  try {
    return new URLSearchParams(globalThis.location?.search ?? "").get(key);
  } catch {
    return null;
  }
};
scope.wordname ??= param("name")?.toLowerCase() ?? undefined;
scope.wordmark ??= param("wordmark")?.toLowerCase() ?? undefined;

// Typefaces load from their bytes the first time a direction asks for one, and
// the browser or the TV host draws with them as soon as they're in.
const started = new Set<string>();
function face(key: keyof typeof WORDMARK_FACES): string {
  const family = `wordmark-${key}`;
  if (!started.has(key) && typeof FontFace !== "undefined") {
    started.add(key);
    const raw = atob(WORDMARK_FACES[key]);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const loaded = new FontFace(family, bytes);
    document.fonts.add(loaded);
    loaded.load().catch((error: unknown) => console.warn(error));
  }
  return family;
}

const CORAL = "#ff5f57";
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** 0 to 1 and back: a beat that comes every `period` seconds and lasts `length`. */
const beat = (t: number, period: number, length: number) => {
  const k = (t % period) / length;
  return k < 1 ? 1 - k : 0;
};

/** A soft dark halo under light letters, so they read over a bright sky as well as a dark room. */
function halo(g: Ctx, paint: () => void, width: number, alpha: number, rgb = "10, 20, 40") {
  g.lineJoin = "round";
  for (let i = 3; i >= 1; i--) {
    g.lineWidth = width * i;
    g.strokeStyle = `rgba(${rgb}, ${((alpha * (4 - i)) / 6).toFixed(3)})`;
    paint();
  }
}

/** Letters one at a time with extra space between them, centred on x; `paint` draws each from its left edge. */
function spaced(g: Ctx, text: string, x: number, track: number, paint: (ch: string, left: number, i: number) => void) {
  g.textAlign = "left";
  const widths = [...text].map((ch) => g.measureText(ch).width);
  let left = x - (widths.reduce((a, b) => a + b, 0) + track * (text.length - 1)) / 2;
  for (let i = 0; i < text.length; i++) {
    paint(text[i], left, i);
    left += widths[i] + track;
  }
}

/** A sticker: a fat outline in ink, a thinner one in white, and the face. */
function sticker(g: Ctx, text: string, x: number, y: number, size: number, fill: string | CanvasGradient) {
  g.lineJoin = "round";
  g.fillStyle = "rgba(6, 30, 60, 0.45)";
  g.lineWidth = size * 0.3;
  g.strokeStyle = "rgba(6, 30, 60, 0.45)";
  g.strokeText(text, x + size * 0.03, y + size * 0.08);
  g.lineWidth = size * 0.3;
  g.strokeStyle = INK;
  g.strokeText(text, x, y);
  g.lineWidth = size * 0.18;
  g.strokeStyle = "#ffffff";
  g.strokeText(text, x, y);
  g.fillStyle = fill;
  g.fillText(text, x, y);
}

// Five-by-seven capitals for the grid-built directions.
const GRID: Record<string, string[]> = {
  S: [".XXXX", "X....", "X....", ".XXX.", "....X", "....X", "XXXX."],
  P: ["XXXX.", "X...X", "X...X", "XXXX.", "X....", "X....", "X...."],
  I: ["XXX", ".X.", ".X.", ".X.", ".X.", ".X.", "XXX"],
  K: ["X...X", "X..X.", "X.X..", "XX...", "X.X..", "X..X.", "X...X"],
  E: ["XXXXX", "X....", "X....", "XXXX.", "X....", "X....", "XXXXX"],
  C: [".XXXX", "X....", "X....", "X....", "X....", "X....", ".XXXX"],
};
/** The cells of a word on the grid, as [column, row], and its width in cells. */
function gridCells(word: string): { cells: [number, number][]; cols: number } {
  const cells: [number, number][] = [];
  let col = 0;
  for (const ch of word) {
    const rows = GRID[ch];
    rows.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) if (row[c] === "X") cells.push([col + c, r]);
    });
    col += rows[0].length + 1;
  }
  return { cells, cols: col - 1 };
}

// ---------------------------------------------------------------------------
// flies: the current one, round bold letters, a candy outline and a glossy face.

const current: Direction = (g, x, y, size, t) => {
  const word = "flies";
  g.font = `700 ${size}px ${FONT}`;
  g.lineJoin = "round";
  g.lineWidth = size * 0.22;
  g.strokeStyle = "rgba(0, 50, 110, 0.55)";
  g.strokeText(word, x, y + size * 0.06);
  g.lineWidth = size * 0.14;
  g.strokeStyle = "#1c8fe0";
  g.strokeText(word, x, y);
  const gloss = g.createLinearGradient(0, y - size * 0.75, 0, y);
  gloss.addColorStop(0, "#ffffff");
  gloss.addColorStop(0.55, "#f2fbff");
  gloss.addColorStop(1, "#bfe9ff");
  g.fillStyle = gloss;
  g.fillText(word, x, y);
  const reach = g.measureText(word).width * 0.56;
  const a = t * 0.9;
  g.translate(x + Math.cos(a) * reach, y - size * 0.95 + Math.sin(a * 2) * size * 0.12);
  g.fillStyle = "rgba(255,255,255,0.75)";
  const flap = Math.sin(t * 40) * 0.3;
  for (const side of [-1, 1]) {
    g.beginPath();
    g.ellipse(side * size * 0.07, -size * 0.06, size * 0.09, size * 0.045, side * (0.5 + flap), 0, TAU);
    g.fill();
  }
  g.fillStyle = "#6b4a2a";
  g.beginPath();
  g.ellipse(0, 0, size * 0.09, size * 0.06, 0, 0, TAU);
  g.fill();
  g.fillStyle = "#e5262e";
  g.beginPath();
  g.arc(size * 0.08, -size * 0.01, size * 0.035, 0, TAU);
  g.fill();
};

// ---------------------------------------------------------------------------
// Spike

// A: the i is an action potential, a trace that rests on the baseline, shoots
// up past the letters and dips under before it settles; now and then it fires.
const spikeTrace: Direction = (g, x, y, size, t) => {
  g.font = `400 ${size * 1.05}px ${face("archivo")}, sans-serif`;
  g.textAlign = "left";
  const left = g.measureText("sp").width;
  const right = g.measureText("ke").width;
  const w = size * 0.78;
  const gap = size * 0.12;
  const x0 = x - (left + right + w + gap * 2) / 2;
  const sx = x0 + left + gap;
  const trace = () => {
    g.beginPath();
    g.moveTo(sx, y);
    g.lineTo(sx + w * 0.2, y);
    g.lineTo(sx + w * 0.42, y - size * 1.02);
    g.lineTo(sx + w * 0.6, y + size * 0.2);
    g.quadraticCurveTo(sx + w * 0.72, y + size * 0.04, sx + w, y);
  };
  const fire = beat(t, 2.6, 0.45);
  const letters = (paint: (s: string, at: number) => void) => {
    paint("sp", x0);
    paint("ke", sx + w + gap);
  };
  g.lineJoin = "round";
  g.lineCap = "round";
  // Shadow, outline, face.
  g.fillStyle = "rgba(6, 30, 60, 0.4)";
  letters((s, at) => g.fillText(s, at + size * 0.04, y + size * 0.06));
  g.lineWidth = size * 0.12;
  g.strokeStyle = INK;
  letters((s, at) => g.strokeText(s, at, y));
  trace();
  g.lineWidth = size * 0.2;
  g.stroke();
  g.fillStyle = "#ffffff";
  letters((s, at) => g.fillText(s, at, y));
  if (fire > 0) {
    trace();
    g.lineWidth = size * (0.2 + 0.25 * fire);
    g.strokeStyle = `rgba(255, 210, 120, ${(0.5 * fire).toFixed(3)})`;
    g.stroke();
  }
  trace();
  g.lineWidth = size * 0.1;
  g.strokeStyle = fire > 0 ? `rgb(255, ${Math.round(95 + 150 * fire)}, ${Math.round(87 + 100 * fire)})` : CORAL;
  g.stroke();
};

// B: a raster plot, the way spikes are drawn in the lab: each mark a neuron
// firing, rows of them, and the letters are where they all fire together.
const spikeRaster: Direction = (g, x, y, size, t) => {
  const { cells, cols } = gridCells("SPIKE");
  const c = size * 0.15;
  const left = x - (cols * c) / 2;
  const top = y - 7 * c;
  const lit = new Set(cells.map(([col, row]) => row * 1000 + col));
  const tick = (col: number, row: number, alpha: number, colour: string) => {
    const k = row * 97 + col * 13;
    const jitter = (hash(k) - 0.5) * c * 0.2;
    g.fillStyle = colour;
    g.globalAlpha = alpha;
    g.fillRect(left + col * c + c * 0.22 + jitter, top + row * c + c * 0.04, c * 0.56, c * 0.92);
  };
  // The rest of the population, quieter, around the word.
  for (let row = 0; row < 7; row++) {
    for (let col = -6; col < cols + 6; col++) {
      const k = row * 97 + col * 13 + 7;
      const live = (t * (0.4 + hash(k) * 0.6) + hash(k + 1)) % 1;
      if (!lit.has(row * 1000 + col) && hash(k + 2) < 0.1 && live < 0.5) tick(col, row, 0.3 * (1 - live / 0.5), "#ffffff");
    }
  }
  for (const [col, row] of cells) {
    g.save();
    g.translate(c * 0.14, c * 0.16);
    tick(col, row, 0.6, "#06203d");
    g.restore();
  }
  for (const [col, row] of cells) {
    const k = row * 97 + col * 13;
    const phase = (t * (0.5 + hash(k + 3)) + hash(k + 4)) % 1;
    tick(col, row, 1, phase < 0.06 ? CORAL : "#ffffff");
  }
  g.globalAlpha = 1;
};

// C: a fine Didone italic, all hairlines and sharp points, over a ruled line that spikes once.
const spikeDidone: Direction = (g, x, y, size) => {
  g.font = `400 ${size * 1.3}px ${face("bodoniItalic")}, serif`;
  const width = g.measureText("Spike").width;
  halo(g, () => g.strokeText("Spike", x, y), size * 0.05, 0.55);
  g.fillStyle = "#fffaf0";
  g.fillText("Spike", x, y);
  const ry = y + size * 0.3;
  const a = x - width * 0.6;
  const b = x + width * 0.6;
  const s = x + width * 0.36;
  const rule = () => {
    g.beginPath();
    g.moveTo(a, ry);
    g.lineTo(s - size * 0.06, ry);
    g.lineTo(s, ry - size * 0.5);
    g.lineTo(s + size * 0.06, ry + size * 0.1);
    g.lineTo(s + size * 0.1, ry);
    g.lineTo(b, ry);
  };
  g.lineJoin = "miter";
  g.lineWidth = size * 0.07;
  g.strokeStyle = "rgba(10, 20, 40, 0.3)";
  rule();
  g.stroke();
  g.lineWidth = Math.max(1, size * 0.035);
  g.strokeStyle = "#fffaf0";
  rule();
  g.stroke();
};

// D: a pet's name on its tag: soft, round, and fat, with the i's dot firing in rings.
const spikePet: Direction = (g, x, y, size, t) => {
  g.font = `400 ${size * 1.15}px ${face("fredoka")}, ${FONT}`;
  const fill = g.createLinearGradient(0, y - size * 0.8, 0, y);
  fill.addColorStop(0, "#ffb3a6");
  fill.addColorStop(1, CORAL);
  sticker(g, "spike", x, y, size, fill);
  const w = g.measureText("spike").width;
  g.textAlign = "left";
  const dotX = x - w / 2 + g.measureText("sp").width + g.measureText("i").width / 2;
  const dotY = y - size * 0.86;
  for (let i = 0; i < 2; i++) {
    const k = ((t + i * 0.9) % 1.8) / 1.8;
    g.beginPath();
    g.arc(dotX, dotY, size * (0.1 + k * 0.45), 0, TAU);
    g.lineWidth = size * 0.05 * (1 - k);
    g.strokeStyle = `rgba(255, 255, 255, ${(0.8 * (1 - k)).toFixed(3)})`;
    g.stroke();
  }
};

// ---------------------------------------------------------------------------
// Speck

// A: the name and a full stop, the speck itself, which never sits quite still.
const speckStop: Direction = (g, x, y, size, t) => {
  g.font = `400 ${size * 1.4}px ${face("cormorant")}, serif`;
  const w = g.measureText("speck").width;
  const r = size * 0.13;
  const lx = x - r * 2;
  halo(g, () => g.strokeText("speck", lx, y), size * 0.05, 0.55);
  g.fillStyle = "#fffaf0";
  g.fillText("speck", lx, y);
  const dx = lx + w / 2 + r * 2.4 + Math.sin(t * 0.7) * size * 0.04 + Math.sin(t * 1.9) * size * 0.015;
  const dy = y - r - Math.sin(t * 0.9 + 1) * size * 0.05 - Math.cos(t * 2.3) * size * 0.015;
  g.fillStyle = "rgba(10, 20, 40, 0.35)";
  g.beginPath();
  g.arc(dx + size * 0.02, dy + size * 0.04, r * 1.15, 0, TAU);
  g.fill();
  g.fillStyle = CORAL;
  g.beginPath();
  g.arc(dx, dy, r, 0, TAU);
  g.fill();
};

// B: under the microscope: a lab label in monospace, framed by a reticle's corners.
const speckLens: Direction = (g, x, y, size) => {
  g.font = `400 ${size * 0.85}px ${face("spacemono")}, monospace`;
  const track = size * 0.18;
  const half = (g.measureText("SPECK").width + track * 4) / 2;
  spaced(g, "SPECK", x, track, (ch, left) => {
    g.fillStyle = "rgba(6, 30, 60, 0.55)";
    g.fillText(ch, left + size * 0.04, y + size * 0.05);
    g.fillStyle = "#ffffff";
    g.fillText(ch, left, y);
  });
  const pad = size * 0.3;
  const l = x - half - pad;
  const r = x + half + pad;
  const top = y - size * 0.9;
  const bottom = y + size * 0.22;
  const arm = size * 0.3;
  const corners = () => {
    g.beginPath();
    g.moveTo(l, top + arm);
    g.lineTo(l, top);
    g.lineTo(l + arm, top);
    g.moveTo(r - arm, top);
    g.lineTo(r, top);
    g.lineTo(r, top + arm);
    g.moveTo(r, bottom - arm);
    g.lineTo(r, bottom);
    g.lineTo(r - arm, bottom);
    g.moveTo(l + arm, bottom);
    g.lineTo(l, bottom);
    g.lineTo(l, bottom - arm);
  };
  g.lineCap = "square";
  g.lineWidth = size * 0.09;
  g.strokeStyle = "rgba(6, 30, 60, 0.4)";
  corners();
  g.stroke();
  g.lineWidth = size * 0.04;
  g.strokeStyle = "#ffffff";
  corners();
  g.stroke();
};

// C: halftone, the letters made of specks, a slow ripple passing through them.
const speckDots: Direction = (g, x, y, size, t) => {
  const { cells, cols } = gridCells("SPECK");
  const c = size * 0.15;
  const left = x - (cols * c) / 2 + c / 2;
  const top = y - 7 * c + c / 2;
  const radius = (col: number, row: number) => c * (0.44 + 0.1 * Math.sin(t * 1.4 - (col + row) * 0.45));
  g.fillStyle = "rgba(6, 30, 60, 0.5)";
  for (const [col, row] of cells) {
    g.beginPath();
    g.arc(left + col * c + c * 0.08, top + row * c + c * 0.1, radius(col, row), 0, TAU);
    g.fill();
  }
  const fill = g.createLinearGradient(0, top, 0, y);
  fill.addColorStop(0, "#ffffff");
  fill.addColorStop(1, "#cfeeff");
  g.fillStyle = fill;
  for (const [col, row] of cells) {
    g.beginPath();
    g.arc(left + col * c, top + row * c, radius(col, row), 0, TAU);
    g.fill();
  }
  // A few strays, drifting off the end of the word.
  g.fillStyle = CORAL;
  for (let i = 0; i < 4; i++) {
    const drift = (t * 0.12 + i * 0.27) % 1;
    g.globalAlpha = 1 - drift;
    g.beginPath();
    g.arc(left + (cols + 0.5 + drift * 3 + i * 0.4) * c, top + (1 + hash(i) * 4 - drift * 2) * c, c * (0.32 - i * 0.05), 0, TAU);
    g.fill();
  }
  g.globalAlpha = 1;
};

// D: written by hand with a felt pen, a flick under it and a dot of ink.
const speckHand: Direction = (g, x, y, size) => {
  g.font = `400 ${size * 1.5}px ${face("caveat")}, cursive`;
  const w = g.measureText("Speck").width;
  g.translate(x, y);
  g.rotate(-0.05);
  g.lineJoin = "round";
  g.lineCap = "round";
  const flick = () => {
    g.beginPath();
    g.moveTo(-w * 0.08, size * 0.2);
    g.quadraticCurveTo(w * 0.25, size * 0.1, w * 0.52, size * 0.06);
  };
  g.lineWidth = size * 0.17;
  g.strokeStyle = INK;
  flick();
  g.stroke();
  g.lineWidth = size * 0.08;
  g.strokeStyle = CORAL;
  flick();
  g.stroke();
  g.fillStyle = "rgba(6, 30, 60, 0.4)";
  g.fillText("Speck", size * 0.04, size * 0.06);
  g.lineWidth = size * 0.11;
  g.strokeStyle = INK;
  g.strokeText("Speck", 0, 0);
  g.fillStyle = "#ffffff";
  g.fillText("Speck", 0, 0);
  g.fillStyle = INK;
  g.beginPath();
  g.arc(w * 0.58, -size * 0.12, size * 0.1, 0, TAU);
  g.fill();
  g.fillStyle = CORAL;
  g.beginPath();
  g.arc(w * 0.58, -size * 0.12, size * 0.06, 0, TAU);
  g.fill();
};

// ---------------------------------------------------------------------------
// Mote

// A: a mote of dust in a shaft of light: thin, airy letters, the beam slanting
// through them, and one bright grain drifting in it.
const moteBeam: Direction = (g, x, y, size, t) => {
  g.font = `400 ${size * 1.2}px ${face("jost")}, sans-serif`;
  const track = size * 0.2;
  const half = (g.measureText("mote").width + track * 3) / 2;
  const beam = g.createLinearGradient(x - half, 0, x + half, 0);
  beam.addColorStop(0, "rgba(255, 246, 214, 0)");
  beam.addColorStop(0.5, "rgba(255, 246, 214, 0.28)");
  beam.addColorStop(1, "rgba(255, 246, 214, 0)");
  g.fillStyle = beam;
  g.beginPath();
  g.moveTo(x - half * 0.2, y - size * 1.5);
  g.lineTo(x + half * 0.45, y - size * 1.5);
  g.lineTo(x + half * 0.05, y + size * 0.45);
  g.lineTo(x - half * 0.9, y + size * 0.45);
  g.closePath();
  g.fill();
  spaced(g, "mote", x, track, (ch, left) => halo(g, () => g.strokeText(ch, left, y), size * 0.045, 0.5));
  g.fillStyle = "#ffffff";
  spaced(g, "mote", x, track, (ch, left) => g.fillText(ch, left, y));
  const mx = x - half * 0.15 + Math.sin(t * 0.31) * half * 0.22 + Math.sin(t * 1.3) * size * 0.04;
  const my = y - size * 0.95 + Math.sin(t * 0.23 + 2) * size * 0.25;
  for (let i = 4; i >= 1; i--) {
    g.fillStyle = `rgba(255, 240, 200, ${(0.12 * (5 - i)).toFixed(3)})`;
    g.beginPath();
    g.arc(mx, my, size * 0.025 * i * 1.5, 0, TAU);
    g.fill();
  }
  g.fillStyle = "#ffffff";
  g.beginPath();
  g.arc(mx, my, size * 0.035, 0, TAU);
  g.fill();
};

// B: a lab instrument's readout: fourteen-segment letters glowing in a dark window.
const SEGMENTS: Record<string, string[]> = { M: ["f", "e", "b", "c", "h", "j"], O: ["a", "b", "c", "d", "e", "f"], T: ["a", "i", "l"], E: ["a", "d", "e", "f", "g1"] };
const SEGMENT_ENDS: Record<string, [number, number, number, number]> = {
  a: [0, 0, 1, 0], b: [1, 0, 1, 0.5], c: [1, 0.5, 1, 1], d: [0, 1, 1, 1], e: [0, 0.5, 0, 1], f: [0, 0, 0, 0.5],
  g1: [0, 0.5, 0.5, 0.5], g2: [0.5, 0.5, 1, 0.5], h: [0, 0, 0.5, 0.5], i: [0.5, 0, 0.5, 0.5], j: [1, 0, 0.5, 0.5],
  k: [0, 1, 0.5, 0.5], l: [0.5, 0.5, 0.5, 1], m: [1, 1, 0.5, 0.5],
};
const moteReadout: Direction = (g, x, y, size, t) => {
  const cw = size * 0.6;
  const ch = size * 1.0;
  const gap = size * 0.3;
  const total = cw * 4 + gap * 3;
  const pad = size * 0.32;
  g.fillStyle = "rgba(4, 22, 40, 0.82)";
  g.beginPath();
  g.roundRect(x - total / 2 - pad, y - ch - pad, total + pad * 2, ch + pad * 2, size * 0.18);
  g.fill();
  g.lineWidth = size * 0.04;
  g.strokeStyle = "rgba(160, 230, 255, 0.35)";
  g.stroke();
  const inset = size * 0.08;
  const segment = (key: string, left: number) => {
    const [ax, ay, bx, by] = SEGMENT_ENDS[key];
    const x0 = left + ax * cw;
    const y0 = y - ch + ay * ch;
    const x1 = left + bx * cw;
    const y1 = y - ch + by * ch;
    const len = Math.hypot(x1 - x0, y1 - y0);
    const ux = (x1 - x0) / len;
    const uy = (y1 - y0) / len;
    g.moveTo(x0 + ux * inset, y0 + uy * inset);
    g.lineTo(x1 - ux * inset, y1 - uy * inset);
  };
  g.lineCap = "round";
  // Unlit segments, faintly there, as on real glass.
  g.beginPath();
  for (let i = 0; i < 4; i++) for (const key in SEGMENT_ENDS) segment(key, x - total / 2 + i * (cw + gap));
  g.lineWidth = size * 0.1;
  g.strokeStyle = "rgba(140, 240, 255, 0.07)";
  g.stroke();
  g.beginPath();
  [..."MOTE"].forEach((letter, i) => {
    for (const key of SEGMENTS[letter]) segment(key, x - total / 2 + i * (cw + gap));
  });
  // Now and then it flickers, as old displays do.
  const dim = 1 - 0.5 * beat(t, 9, 0.12);
  for (let i = 3; i >= 1; i--) {
    g.lineWidth = size * 0.1 * (1 + i * 0.7);
    g.strokeStyle = `rgba(90, 230, 255, ${((0.1 * (4 - i)) * dim).toFixed(3)})`;
    g.stroke();
  }
  g.lineWidth = size * 0.1;
  g.strokeStyle = `rgba(200, 250, 255, ${dim.toFixed(3)})`;
  g.stroke();
};

// C: a neon sign in the dark restaurant window, inline letters humming pink.
const moteNeon: Direction = (g, x, y, size, t) => {
  g.font = `400 ${size * 1.05}px ${face("monoton")}, sans-serif`;
  const hum = 1 - 0.55 * beat(t, 7.3, 0.08) - 0.35 * beat(t + 0.18, 7.3, 0.06);
  g.lineJoin = "round";
  g.fillStyle = "rgba(20, 4, 24, 0.4)";
  g.fillText("mote", x + size * 0.03, y + size * 0.05);
  for (let i = 4; i >= 1; i--) {
    g.lineWidth = size * 0.05 * i;
    g.strokeStyle = `rgba(255, 70, 170, ${((0.12 * (5 - i)) * hum).toFixed(3)})`;
    g.strokeText("mote", x, y);
  }
  g.fillStyle = `rgba(255, 235, 248, ${(0.55 + 0.45 * hum).toFixed(3)})`;
  g.fillText("mote", x, y);
};

// D: a plate in the menu's own glass, the name engraved in fine spaced capitals.
const motePlate: Direction = (g, x, y, size) => {
  g.font = `400 ${size * 0.95}px ${face("bodoni")}, serif`;
  const track = size * 0.32;
  const width = g.measureText("MOTE").width + track * 3;
  const w = width + size * 1.1;
  const h = size * 1.25;
  const top = y - size * 0.98;
  g.fillStyle = "rgba(4, 40, 90, 0.25)";
  g.beginPath();
  g.roundRect(x - w / 2, top + size * 0.07, w, h, h / 2);
  g.fill();
  const glass = g.createLinearGradient(0, top, 0, top + h);
  glass.addColorStop(0, "rgba(255, 255, 255, 0.95)");
  glass.addColorStop(0.5, "rgba(226, 243, 255, 0.9)");
  glass.addColorStop(1, "rgba(190, 226, 250, 0.9)");
  g.fillStyle = glass;
  g.beginPath();
  g.roundRect(x - w / 2, top, w, h, h / 2);
  g.fill();
  g.lineWidth = size * 0.035;
  g.strokeStyle = "rgba(255, 255, 255, 0.9)";
  g.stroke();
  g.fillStyle = INK;
  spaced(g, "MOTE", x, track, (ch, left) => g.fillText(ch, left, y - size * 0.03));
};

// ---------------------------------------------------------------------------
// Pip

// A: drawn with a compass: one round stroke, circles and stems, and the i's
// dot a pip that bounces.
const pipCompass: Direction = (g, x, y, size, t) => {
  const s = size * 0.2;
  const h = size * 0.62;
  const r = (h - s) / 2;
  const gap = size * 0.2;
  const pw = s + 2 * r;
  const total = pw * 2 + s + gap * 2;
  const p1 = x - total / 2 + s / 2;
  const i = p1 - s / 2 + pw + gap + s / 2;
  const p2 = i + s / 2 + gap + s / 2;
  const strokes = () => {
    g.beginPath();
    for (const p of [p1, p2]) {
      g.moveTo(p, y - h + s / 2);
      g.lineTo(p, y + size * 0.32);
      g.moveTo(p + r * 2, y - h / 2);
      g.arc(p + r, y - h / 2, r, 0, TAU);
    }
    g.moveTo(i, y - h + s / 2);
    g.lineTo(i, y - s / 2);
  };
  g.lineCap = "round";
  g.save();
  g.translate(size * 0.04, size * 0.07);
  strokes();
  g.lineWidth = s + size * 0.1;
  g.strokeStyle = "rgba(6, 30, 60, 0.4)";
  g.stroke();
  g.restore();
  strokes();
  g.lineWidth = s + size * 0.1;
  g.strokeStyle = INK;
  g.stroke();
  g.lineWidth = s;
  g.strokeStyle = "#ffffff";
  g.stroke();
  const k = Math.abs(Math.sin(t * 2.2));
  const squash = k < 0.15 ? 0.15 - k : 0;
  const dy = y - h - size * 0.28 - k * size * 0.12;
  g.fillStyle = INK;
  g.beginPath();
  g.ellipse(i, dy + squash * size * 0.4, s * 0.85 * (1 + squash * 2), s * 0.85 * (1 - squash * 2), 0, 0, TAU);
  g.fill();
  g.fillStyle = CORAL;
  g.beginPath();
  g.ellipse(i, dy + squash * size * 0.4, s * 0.6 * (1 + squash * 2), s * 0.6 * (1 - squash * 2), 0, 0, TAU);
  g.fill();
};

// B: a chunky bitmap, small letters on a grid, the i's dot a light that pips.
const PIXELS: Record<string, string[]> = {
  p: ["......", "......", "......", "XXXXX.", "XX..XX", "XX..XX", "XX..XX", "XX..XX", "XXXXX.", "XX....", "XX...."],
  i: ["..", "..", "..", "XX", "XX", "XX", "XX", "XX", "XX", "..", ".."],
};
const pipPixel: Direction = (g, x, y, size, t) => {
  const c = Math.max(1, Math.round(size * 0.13));
  const cols = 6 + 1 + 2 + 1 + 6;
  const ox = Math.round(x - (cols * c) / 2);
  const oy = Math.round(y - 9 * c);
  const cells = (paint: (col: number, row: number) => void) => {
    let col = 0;
    for (const ch of "pip") {
      PIXELS[ch].forEach((row, r) => {
        for (let k = 0; k < row.length; k++) if (row[k] === "X") paint(col + k, r);
      });
      col += PIXELS[ch][0].length + 1;
    }
  };
  g.fillStyle = INK;
  cells((col, row) => g.fillRect(ox + (col + 1) * c, oy + (row + 1) * c, c, c));
  cells((col, row) => g.fillRect(ox + col * c, oy + row * c, c, c));
  g.fillStyle = "#ffffff";
  cells((col, row) => g.fillRect(ox + col * c, oy + row * c, c - Math.max(1, c * 0.12), c - Math.max(1, c * 0.12)));
  // The dot: two cells that light up in a short double pip.
  const on = beat(t, 2, 0.15) > 0 || beat(t - 0.3, 2, 0.15) > 0;
  const dx = ox + 7 * c;
  const dy = oy;
  g.fillStyle = INK;
  g.fillRect(dx + c, dy + c, c * 2, c * 2);
  g.fillStyle = on ? "#fff3a8" : CORAL;
  g.fillRect(dx, dy, c * 2, c * 2);
  if (on) {
    g.fillStyle = "rgba(255, 240, 160, 0.35)";
    g.fillRect(dx - c, dy - c, c * 4, c * 4);
  }
};

// C: a sticker, fat italic letters with a white edge, peeled on a little crooked.
const pipSticker: Direction = (g, x, y, size, t) => {
  g.font = `400 ${size * 1.25}px ${face("shrikhand")}, serif`;
  g.translate(x, y + Math.sin(t * 1.1) * size * 0.02);
  g.rotate(-0.07 + Math.sin(t * 0.8) * 0.01);
  const fill = g.createLinearGradient(0, -size * 0.9, 0, 0);
  fill.addColorStop(0, "#ffe07a");
  fill.addColorStop(1, "#ff9a2e");
  sticker(g, "pip", 0, 0, size, fill);
};

// D: a Swiss poster: heavy grotesque letters set tight over a big red disc.
const pipDisc: Direction = (g, x, y, size) => {
  g.font = `400 ${size * 1.25}px ${face("archivo")}, sans-serif`;
  const w = g.measureText("pip").width;
  g.fillStyle = "rgba(6, 30, 60, 0.3)";
  g.beginPath();
  g.arc(x - w * 0.12 + size * 0.04, y - size * 0.42 + size * 0.06, size * 0.72, 0, TAU);
  g.fill();
  g.fillStyle = "#e8463c";
  g.beginPath();
  g.arc(x - w * 0.12, y - size * 0.42, size * 0.72, 0, TAU);
  g.fill();
  g.lineJoin = "round";
  g.lineWidth = size * 0.1;
  g.strokeStyle = INK;
  g.strokeText("pip", x, y);
  g.fillStyle = "#ffffff";
  g.fillText("pip", x, y);
};

// ---------------------------------------------------------------------------
// Blip

// A: an oscilloscope: the name written by a green beam that runs on as a trace
// with a blip in it, brighter where the beam has just passed.
const blipScope: Direction = (g, x, y, size, t) => {
  g.font = `400 ${size * 1.45}px ${face("sacramento")}, cursive`;
  const w = g.measureText("blip").width;
  const reach = w / 2 + size * 1.0;
  const line = y - size * 0.02;
  const trace = () => {
    g.beginPath();
    g.moveTo(x - reach, line);
    g.lineTo(x - reach + size * 0.3, line);
    g.lineTo(x - reach + size * 0.38, line - size * 0.35);
    g.lineTo(x - reach + size * 0.46, line + size * 0.12);
    g.lineTo(x - reach + size * 0.52, line);
    g.lineTo(x - w / 2, line);
    g.moveTo(x + w / 2 - size * 0.05, line);
    g.lineTo(x + reach, line);
  };
  const sweep = x - reach + ((t % 3) / 3) * reach * 2.4;
  const bright = g.createLinearGradient(sweep - reach, 0, sweep, 0);
  bright.addColorStop(0, "rgba(170, 255, 190, 0.55)");
  bright.addColorStop(1, "rgba(235, 255, 235, 1)");
  g.lineJoin = "round";
  g.lineCap = "round";
  g.fillStyle = "rgba(2, 20, 12, 0.5)";
  g.fillText("blip", x + size * 0.03, y + size * 0.05);
  for (let i = 3; i >= 1; i--) {
    g.lineWidth = size * 0.07 * i;
    g.strokeStyle = `rgba(60, 255, 130, ${(0.12 * (4 - i)).toFixed(3)})`;
    g.strokeText("blip", x, y);
    trace();
    g.stroke();
  }
  g.lineWidth = size * 0.035;
  g.strokeStyle = bright;
  g.fillStyle = bright;
  g.fillText("blip", x, y);
  g.strokeText("blip", x, y);
  trace();
  g.stroke();
};

// B: a radar scope as the mark beside the word, its sweep going round and a blip coming up where it passes.
const blipRadar: Direction = (g, x, y, size, t) => {
  g.font = `400 ${size * 1.05}px ${face("archivo")}, sans-serif`;
  const w = g.measureText("blip").width;
  const R = size * 0.5;
  const gap = size * 0.25;
  const left = x - (w + R * 2 + gap) / 2;
  const cx = left + R;
  const cy = y - size * 0.4;
  g.fillStyle = "rgba(6, 30, 60, 0.4)";
  g.beginPath();
  g.arc(cx + size * 0.04, cy + size * 0.06, R + size * 0.06, 0, TAU);
  g.fill();
  g.fillStyle = INK;
  g.beginPath();
  g.arc(cx, cy, R + size * 0.06, 0, TAU);
  g.fill();
  g.fillStyle = "#06261f";
  g.beginPath();
  g.arc(cx, cy, R, 0, TAU);
  g.fill();
  g.lineWidth = size * 0.025;
  g.strokeStyle = "rgba(110, 255, 170, 0.5)";
  g.beginPath();
  g.moveTo(cx + R * 0.5, cy);
  g.arc(cx, cy, R * 0.5, 0, TAU);
  g.moveTo(cx - R, cy);
  g.lineTo(cx + R, cy);
  g.moveTo(cx, cy - R);
  g.lineTo(cx, cy + R);
  g.stroke();
  const a = (t * 1.6) % TAU;
  for (let i = 0; i < 6; i++) {
    g.fillStyle = `rgba(90, 255, 160, ${(0.09 * (6 - i)).toFixed(3)})`;
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, R, a - (i + 1) * 0.14, a - i * 0.14);
    g.closePath();
    g.fill();
  }
  const blipAt = 5.4;
  const since = (a - blipAt + TAU) % TAU;
  const glow = since < 3 ? 1 - since / 3 : 0;
  g.fillStyle = `rgba(210, 255, 220, ${(0.15 + 0.85 * glow).toFixed(3)})`;
  g.beginPath();
  g.arc(cx + Math.cos(blipAt) * R * 0.62, cy + Math.sin(blipAt) * R * 0.62, size * 0.075, 0, TAU);
  g.fill();
  g.textAlign = "left";
  const wx = left + R * 2 + gap;
  g.fillStyle = "rgba(6, 30, 60, 0.4)";
  g.fillText("blip", wx + size * 0.04, y + size * 0.06);
  g.lineJoin = "round";
  g.lineWidth = size * 0.12;
  g.strokeStyle = INK;
  g.strokeText("blip", wx, y);
  g.fillStyle = "#ffffff";
  g.fillText("blip", wx, y);
};

// C: a terminal, the name typed in a monospace with the cursor still blinking after it.
const blipTerminal: Direction = (g, x, y, size, t) => {
  g.font = `400 ${size * 1.1}px ${face("spacemono")}, monospace`;
  const w = g.measureText("blip").width;
  const cw = size * 0.55;
  const left = x - (w + cw * 1.3) / 2;
  g.textAlign = "left";
  g.fillStyle = "rgba(6, 30, 60, 0.55)";
  g.fillText("blip", left + size * 0.05, y + size * 0.06);
  g.fillStyle = "#ffffff";
  g.fillText("blip", left, y);
  if (t % 1.1 < 0.6) {
    g.fillStyle = "rgba(6, 30, 60, 0.55)";
    g.fillRect(left + w + cw * 0.3 + size * 0.05, y - size * 0.72 + size * 0.06, cw, size * 0.82);
    g.fillStyle = "#7dffb0";
    g.fillRect(left + w + cw * 0.3, y - size * 0.72, cw, size * 0.82);
  }
};

// ---------------------------------------------------------------------------
// Flit

// A: a fine italic, with one long translucent stroke lifting off the t like a wing in passing.
const flitWing: Direction = (g, x, y, size, t) => {
  g.font = `400 ${size * 1.45}px ${face("cormorant")}, serif`;
  const w = g.measureText("flit").width;
  const lx = x - size * 0.35;
  halo(g, () => g.strokeText("flit", lx, y), size * 0.05, 0.55);
  g.fillStyle = "#fffaf0";
  g.fillText("flit", lx, y);
  const sway = Math.sin(t * 1.3) * 0.05;
  const ox = lx + w * 0.4;
  const oy = y - size * 0.5;
  g.translate(ox, oy);
  g.rotate(-0.35 + sway);
  const wing = g.createLinearGradient(0, 0, size * 1.6, 0);
  wing.addColorStop(0, "rgba(255, 255, 255, 0.85)");
  wing.addColorStop(1, "rgba(200, 235, 255, 0)");
  g.fillStyle = wing;
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(size * 0.8, -size * 0.32, size * 1.7, -size * 0.05);
  g.quadraticCurveTo(size * 0.8, -size * 0.08, 0, size * 0.06);
  g.closePath();
  g.fill();
};

// B: a quick marker scrawl, capitals in a hurry with speed lines behind.
const flitMarker: Direction = (g, x, y, size) => {
  g.font = `400 ${size * 1.15}px ${face("marker")}, cursive`;
  const w = g.measureText("FLIT").width;
  g.translate(x + size * 0.2, y);
  g.rotate(-0.06);
  g.lineCap = "round";
  const lines = () => {
    g.beginPath();
    for (const [dy, len] of [[-0.65, 0.5], [-0.38, 0.8], [-0.11, 0.45]]) {
      g.moveTo(-w / 2 - size * 0.15, dy * size);
      g.lineTo(-w / 2 - size * (0.15 + len), dy * size);
    }
  };
  g.lineWidth = size * 0.14;
  g.strokeStyle = INK;
  lines();
  g.stroke();
  g.lineWidth = size * 0.07;
  g.strokeStyle = "#ffffff";
  lines();
  g.stroke();
  g.fillStyle = "rgba(6, 30, 60, 0.45)";
  g.fillText("FLIT", size * 0.05, size * 0.07);
  g.lineJoin = "round";
  g.lineWidth = size * 0.1;
  g.strokeStyle = INK;
  g.strokeText("FLIT", 0, 0);
  g.fillStyle = "#ffffff";
  g.fillText("FLIT", 0, 0);
};

// C: tall condensed capitals leaning into a dart, leaving copies of themselves behind.
const flitDart: Direction = (g, x, y, size, t) => {
  g.font = `400 ${size * 1.35}px ${face("bebas")}, sans-serif`;
  const pulse = (t % 3.2) / 3.2;
  const ease = pulse < 0.25 ? 1 - (1 - pulse / 0.25) ** 3 : 1;
  g.translate(x, y);
  g.transform(1, 0, -0.25, 1, 0, 0);
  for (let i = 4; i >= 1; i--) {
    g.fillStyle = `rgba(255, 255, 255, ${(0.12 * (5 - i) * ease).toFixed(3)})`;
    g.fillText("FLIT", -i * size * 0.16 * ease, 0);
  }
  g.fillStyle = "rgba(6, 30, 60, 0.45)";
  g.fillText("FLIT", size * 0.05, size * 0.06);
  g.lineJoin = "round";
  g.lineWidth = size * 0.08;
  g.strokeStyle = INK;
  g.strokeText("FLIT", 0, 0);
  g.fillStyle = "#ffffff";
  g.fillText("FLIT", 0, 0);
};

/** The candidate names, each with its directions. */
export const NAMES: Record<string, Record<string, Direction>> = {
  spike: { a: spikeTrace, b: spikeRaster, c: spikeDidone, d: spikePet },
  speck: { a: speckStop, b: speckLens, c: speckDots, d: speckHand },
  mote: { a: moteBeam, b: moteReadout, c: moteNeon, d: motePlate },
  pip: { a: pipCompass, b: pipPixel, c: pipSticker, d: pipDisc },
  blip: { a: blipScope, b: blipRadar, c: blipTerminal },
  flit: { a: flitWing, b: flitMarker, c: flitDart },
};

/** `still` draws it as it settles, for a single picture (the launch image) rather than a moving one. */
export function drawWordmark(g: Ctx, x: number, y: number, size: number, t: number, still = false) {
  const directions = scope.wordname ? NAMES[scope.wordname] : undefined;
  const direction = directions ? (directions[scope.wordmark ?? "a"] ?? directions.a) : current;
  g.save();
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  direction(g, x, y, size, t, still);
  g.restore();
}
