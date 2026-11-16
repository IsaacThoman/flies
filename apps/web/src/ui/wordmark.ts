// The game's name. On this branch, a set of directions to choose from rather
// than one wordmark: `?wordmark=a` (to h) in the address, or `wordmark = "c"`
// in the console, picks one; anything else is the current glossy candy one.
// Each sits on a baseline at (x, y), centred, about `size` tall above it.

import { FONT, TAU } from "@fly/ui";
import { WORDMARK_FACES } from "./wordmark-fonts.ts";

type Ctx = CanvasRenderingContext2D;
type Direction = (g: Ctx, x: number, y: number, size: number, t: number, still: boolean) => void;

const WORD = "flies";

const chosen = (): string => {
  const scope = globalThis as { wordmark?: string };
  if (scope.wordmark === undefined) {
    let fromUrl: string | null;
    try {
      fromUrl = new URLSearchParams(globalThis.location?.search ?? "").get("wordmark");
    } catch {
      fromUrl = null;
    }
    scope.wordmark = fromUrl ?? "current";
  }
  return scope.wordmark;
};

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

/** A soft dark halo under light letters, so they read over a bright sky as well as a dark bar. */
function halo(g: Ctx, word: string, x: number, y: number, width: number, alpha: number) {
  g.lineJoin = "round";
  for (let i = 3; i >= 1; i--) {
    g.lineWidth = width * i;
    g.strokeStyle = `rgba(10, 20, 40, ${((alpha * (4 - i)) / 6).toFixed(3)})`;
    g.strokeText(word, x, y);
  }
}

// The current one: round bold letters, a candy outline and a glossy face.
const current: Direction = (g, x, y, size, t) => {
  g.font = `700 ${size}px ${FONT}`;
  g.lineJoin = "round";
  g.lineWidth = size * 0.22;
  g.strokeStyle = "rgba(0, 50, 110, 0.55)";
  g.strokeText(WORD, x, y + size * 0.06);
  g.lineWidth = size * 0.14;
  g.strokeStyle = "#1c8fe0";
  g.strokeText(WORD, x, y);
  const gloss = g.createLinearGradient(0, y - size * 0.75, 0, y);
  gloss.addColorStop(0, "#ffffff");
  gloss.addColorStop(0.55, "#f2fbff");
  gloss.addColorStop(1, "#bfe9ff");
  g.fillStyle = gloss;
  g.fillText(WORD, x, y);
  const reach = g.measureText(WORD).width * 0.56;
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

// A: the label pinned under a specimen in a museum drawer, the name in italic as a species is written.
const specimen: Direction = (g, x, y, size) => {
  g.font = `400 ${size * 1.02}px ${face("garamond")}, serif`;
  const w = g.measureText(WORD).width + size * 0.9;
  const h = size * 1.12;
  g.translate(x, y - size * 0.3);
  g.rotate(-0.025);
  const top = -h * 0.6;
  g.fillStyle = "rgba(20, 14, 6, 0.28)";
  g.fillRect(-w / 2 + size * 0.06, top + size * 0.08, w, h);
  g.fillStyle = "#f3ead3";
  g.fillRect(-w / 2, top, w, h);
  g.strokeStyle = "#3b3122";
  g.lineWidth = Math.max(1, size * 0.025);
  g.strokeRect(-w / 2 + size * 0.07, top + size * 0.07, w - size * 0.14, h - size * 0.14);
  g.lineWidth = Math.max(0.75, size * 0.012);
  g.strokeRect(-w / 2 + size * 0.12, top + size * 0.12, w - size * 0.24, h - size * 0.24);
  g.fillStyle = "#2a2116";
  g.fillText(WORD, 0, size * 0.2);
};

// B: a quiet book face, large and pale, for a picture left on for hours.
const serif: Direction = (g, x, y, size) => {
  g.font = `400 ${size * 1.45}px ${face("instrument")}, serif`;
  halo(g, WORD, x, y, size * 0.05, 0.5);
  g.fillStyle = "#fffaf0";
  g.fillText(WORD, x, y);
};

// C: signwriter's script, written out by an unseen hand each time the title comes up.
let lastT = -Infinity;
let since = 0;
const script: Direction = (g, x, y, size, t, still) => {
  if (t - lastT > 0.5 || t < lastT) since = t;
  lastT = t;
  const k = still ? 1 : Math.min(1, (t - since) / 1.6);
  const shown = 1 - (1 - k) * (1 - k) * (1 - k);
  g.font = `400 ${size * 1.4}px ${face("yellowtail")}, cursive`;
  const w = g.measureText(WORD).width;
  const left = x - w / 2 - size * 0.3;
  g.beginPath();
  // The edge leans with the writing.
  const edge = left + (w + size * 0.9) * shown;
  g.moveTo(left - size, y - size * 1.4);
  g.lineTo(edge + size * 0.35, y - size * 1.4);
  g.lineTo(edge - size * 0.25, y + size * 0.6);
  g.lineTo(left - size, y + size * 0.6);
  g.closePath();
  g.clip();
  g.fillStyle = "rgba(60, 18, 24, 0.55)";
  g.fillText(WORD, x + size * 0.05, y + size * 0.07);
  g.lineJoin = "round";
  g.lineWidth = size * 0.07;
  g.strokeStyle = "#7a1f2b";
  g.strokeText(WORD, x, y);
  g.fillStyle = "#fff4e2";
  g.fillText(WORD, x, y);
};

// D: a bitmap face of its own, set on the same chunky grid as the picture.
const BITMAP: Record<string, string[]> = {
  f: ["..XXXX", ".XX...", ".XX...", "XXXXX.", ".XX...", ".XX...", ".XX...", ".XX...", ".XX..."],
  l: ["XX", "XX", "XX", "XX", "XX", "XX", "XX", "XX", "XX"],
  i: ["XX", "XX", "..", "XX", "XX", "XX", "XX", "XX", "XX"],
  e: ["......", "......", "......", ".XXXX.", "XX..XX", "XXXXXX", "XX....", "XX..XX", ".XXXX."],
  s: ["......", "......", "......", ".XXXXX", "XX....", ".XXXX.", "....XX", "XX..XX", ".XXXX."],
};
// Built on first use: the tests load this module where there is no Path2D.
let pixelWord: { path: Path2D; cols: number; rows: number } | undefined;
const buildPixelWord = () => {
  const path = new Path2D();
  let col = 0;
  for (const ch of WORD) {
    const rows = BITMAP[ch];
    rows.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        if (row[c] !== "X") continue;
        let run = 1;
        while (row[c + run] === "X") run++;
        path.rect(col + c, r, run, 1);
        c += run - 1;
      }
    });
    col += rows[0].length + 1;
  }
  return { path, cols: col - 1, rows: 9 };
};
const pixel: Direction = (g, x, y, size, t) => {
  const cell = Math.round(size * 0.115);
  const { path, cols, rows } = (pixelWord ??= buildPixelWord());
  g.translate(Math.round(x - (cols * cell) / 2), Math.round(y - rows * cell));
  g.scale(cell, cell);
  g.translate(1, 1);
  g.fillStyle = "#24163a";
  g.fill(path);
  g.translate(-1, -1);
  const bands = g.createLinearGradient(0, 0, 0, rows);
  bands.addColorStop(0, "#fffbe9");
  bands.addColorStop(5 / 9, "#fffbe9");
  bands.addColorStop(5 / 9, "#ffd65c");
  bands.addColorStop(7 / 9, "#ffd65c");
  bands.addColorStop(7 / 9, "#ff9f3a");
  bands.addColorStop(1, "#ff9f3a");
  g.fillStyle = bands;
  g.fill(path);
  // Now and then a glint crosses the letters, a cell at a time.
  const glint = Math.floor(((t % 7) / 1.2) * (cols + rows)) - rows;
  if (glint < cols + rows) {
    g.clip(path);
    g.fillStyle = "rgba(255, 255, 255, 0.9)";
    for (let r = 0; r < rows; r++) g.fillRect(glint + rows - r - 1, r, 1, 1);
  }
};

// E: a heavy, wide poster face in flat colour, the block cut in the menu's ink.
const poster: Direction = (g, x, y, size) => {
  g.font = `400 ${size * 0.92}px ${face("unbounded")}, sans-serif`;
  const depth = size * 0.07;
  g.fillStyle = "#0d3b66";
  for (let i = 4; i >= 1; i--) g.fillText(WORD, x + (depth * i) / 4, y + (depth * i) / 4);
  g.fillStyle = "#ffffff";
  g.fillText(WORD, x, y);
};

// F: a soft, slightly wonky serif whose letters never quite stand still.
const SWAY = [-0.07, 0.05, -0.03, 0.06, -0.05];
const playful: Direction = (g, x, y, size, t) => {
  g.font = `400 ${size * 1.1}px ${face("fraunces")}, serif`;
  g.textAlign = "left";
  const widths = [...WORD].map((ch) => g.measureText(ch).width);
  const track = -size * 0.02;
  let at = x - (widths.reduce((a, b) => a + b, 0) + track * 4) / 2;
  g.lineJoin = "round";
  for (let i = 0; i < WORD.length; i++) {
    const bob = Math.sin(t * 0.9 + i * 1.7) * size * 0.025;
    g.save();
    g.translate(at + widths[i] / 2, y + bob);
    g.rotate(SWAY[i] + Math.sin(t * 0.6 + i * 2.3) * 0.02);
    g.fillStyle = "rgba(70, 30, 10, 0.4)";
    g.fillText(WORD[i], -widths[i] / 2 + size * 0.04, size * 0.06);
    g.lineWidth = size * 0.09;
    g.strokeStyle = "#5b2a14";
    g.strokeText(WORD[i], -widths[i] / 2, 0);
    g.fillStyle = "#ffe9c7";
    g.fillText(WORD[i], -widths[i] / 2, 0);
    g.restore();
    at += widths[i] + track;
  }
};

// G: hairline letters spaced wide, there if you look and gone if you don't.
const airy: Direction = (g, x, y, size, t) => {
  // An unknown family on the Apple TV is its system font, here at its thinnest.
  g.font = `200 ${size * 1.05}px system-ui, -apple-system, "Helvetica Neue", sans-serif`;
  g.textAlign = "left";
  const space = size * 0.32;
  let width = space * (WORD.length - 1);
  for (const ch of WORD) width += g.measureText(ch).width;
  let at = x - width / 2;
  const alpha = 0.82 + Math.sin((t * TAU) / 14) * 0.08;
  for (const ch of WORD) {
    halo(g, ch, at, y, size * 0.03, 0.35);
    g.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
    g.fillText(ch, at, y);
    at += g.measureText(ch).width + space;
  }
};

// H: the letters as neurons under a microscope, single fibres from glowing cell bodies, with spikes running along them.
const X_HEIGHT = 0.52;
const ASCENT = 0.82;
let neuralWord: { strokes: Path2D; twigs: Path2D; somata: Path2D; width: number } | undefined;
const buildNeuralWord = () => {
  const strokes = new Path2D();
  strokes.moveTo(0.42, -ASCENT + 0.05);
  strokes.quadraticCurveTo(0.12, -ASCENT - 0.06, 0.12, -ASCENT + 0.24);
  strokes.lineTo(0.12, 0);
  strokes.moveTo(0, -X_HEIGHT);
  strokes.lineTo(0.3, -X_HEIGHT);
  strokes.moveTo(0.58, -ASCENT);
  strokes.lineTo(0.58, -0.1);
  strokes.quadraticCurveTo(0.58, 0, 0.7, 0);
  strokes.moveTo(0.86, -X_HEIGHT);
  strokes.lineTo(0.86, 0);
  const r = X_HEIGHT / 2;
  strokes.moveTo(1.02, -r);
  strokes.lineTo(1.02 + 2 * r, -r);
  strokes.arc(1.02 + r, -r, r, 0, 0.75, true);
  strokes.moveTo(2.08, -X_HEIGHT + 0.08);
  strokes.bezierCurveTo(2.02, -X_HEIGHT - 0.02, 1.7, -X_HEIGHT - 0.02, 1.7, -X_HEIGHT + 0.13);
  strokes.bezierCurveTo(1.7, -0.29, 2.08, -0.25, 2.08, -0.12);
  strokes.bezierCurveTo(2.08, 0.03, 1.76, 0.04, 1.68, -0.06);
  // Fine branches where the fibres end, as dendrites fork.
  const twigs = new Path2D();
  const fork = (fx: number, fy: number, angle: number) => {
    for (const turn of [-0.55, 0.5]) {
      twigs.moveTo(fx, fy);
      twigs.lineTo(fx + Math.cos(angle + turn) * 0.13, fy + Math.sin(angle + turn) * 0.13);
    }
  };
  fork(0.12, 0, Math.PI / 2);
  fork(0, -X_HEIGHT, Math.PI);
  fork(0.7, 0, 0);
  fork(0.86, 0, Math.PI / 2);
  const somata = new Path2D();
  const ends: [number, number, number][] = [
    [0.42, -ASCENT + 0.05, 0.075],
    [0.58, -ASCENT, 0.075],
    [0.86, -ASCENT + 0.08, 0.09],
    [1.02 + r + r * Math.cos(0.75), -r + r * Math.sin(0.75), 0.07],
    [2.08, -X_HEIGHT + 0.08, 0.075],
  ];
  for (const [ex, ey, er] of ends) {
    somata.moveTo(ex + er, ey);
    somata.arc(ex, ey, er, 0, TAU);
  }
  return { strokes, twigs, somata, width: 2.08 };
};
const neural: Direction = (g, x, y, size, t) => {
  const { strokes, twigs, somata, width } = (neuralWord ??= buildNeuralWord());
  g.translate(x - (width * size) / 2, y);
  g.scale(size, size);
  g.lineCap = "round";
  g.lineJoin = "round";
  g.strokeStyle = "rgba(4, 16, 24, 0.5)";
  g.lineWidth = 0.17;
  g.stroke(strokes);
  g.fillStyle = "rgba(4, 16, 24, 0.5)";
  g.fill(somata);
  g.strokeStyle = "rgba(90, 255, 170, 0.3)";
  g.lineWidth = 0.11;
  g.stroke(strokes);
  g.strokeStyle = "#8cffc4";
  g.lineWidth = 0.055;
  g.stroke(strokes);
  g.lineWidth = 0.03;
  g.stroke(twigs);
  g.fillStyle = "#eafff3";
  g.fill(somata);
  g.setLineDash([0.16, 1.1]);
  g.lineDashOffset = -t * 0.7;
  g.strokeStyle = "#fffbd0";
  g.lineWidth = 0.1;
  g.stroke(strokes);
};

const DIRECTIONS: Record<string, Direction> = { a: specimen, b: serif, c: script, d: pixel, e: poster, f: playful, g: airy, h: neural };

/** `still` draws it as it settles, for a single picture (the launch image) rather than a moving one. */
export function drawWordmark(g: Ctx, x: number, y: number, size: number, t: number, still = false) {
  g.save();
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  (DIRECTIONS[chosen()] ?? current)(g, x, y, size, t, still);
  g.restore();
}
