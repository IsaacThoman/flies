// The fly's stats, small in a corner: its brain at work (spikes a second,
// neurons active, how fast it runs against real time, and a trace of the
// last twenty seconds), and its day so far (stats/
// tally.ts); or what goes in and out of its brain: each sense as the body
// sends it and each command as the brain answers, with how fast the neurons
// it is read from fire. Every number is read from what is running or what
// happened: the brain's meter and state, the senses as Life
// has them, and the tally. The words are only units and names; the numbers
// and bars are what the player asked for.
//
// One draw: a quad with a small canvas, drawn with the menu kit and uploaded
// only when what it shows has changed, at most REDRAWS times a second. It is
// drawn with the overlay, under the menus and hints, and fades by itself, as
// the other pictures do. Across the screen from them, at the same edge, and
// moving round with them (ui/corners.ts); or, on a screen too narrow for
// that, under them, where there is more room.

import { TOUCH_SENSES } from "@fly/brain";
import type { BrainSenses, BrainState } from "@fly/brain";
import * as THREE from "three";
import { font, glassPanel, roundedRect, text } from "@fly/ui";
import { HISTORY_SAMPLES } from "../brain/meter.ts";
import { TV_FRAME, pixelsPerUnit } from "../display.ts";
import type { Frame } from "../display.ts";
import { INSET_PANEL, cornerScale, insetLayout } from "../eyes/inset.ts";
import { nervesLayout } from "../nerves/panel.ts";
import type { Day, ShowWhen, StatsKind } from "../settings.ts";
import { CORNERS, CornerPlacement, across } from "../ui/corners.ts";
import type { Corner, CornerDeck, CornerRect, CornerWanted } from "../ui/corners.ts";
import { hudLayout, safeRect } from "../ui/layout.ts";
import type { HudLayout } from "../ui/layout.ts";

/** The panel, design units at full size: a grid of figures over units, with a trace over the brain's. */
const RADIUS = 14;
const TOP = 12;
const FOOT = 5;
const TRACE = 26;
const CELL = { width: 72, height: 38 };
const BRAIN_CELLS = 3;
const DAY_CELLS = 5;
/** Between it and the others, design units. */
const GAP = 8;
/** The most times a second it is drawn again. */
export const REDRAWS = 4;

const VALUE = { size: 18, color: "#ffffff" };
const UNIT = { size: 14, color: "#e4f3ff" };

/** What goes in, each as the body sends it, and the light as the mean over every facet; "grounded" is 1 or 0; hunger and thirst, internal state, 1 when left out; touch, the most any part of it is touched; the rest 0 when left out. */
export const SENSES = [
  ["loomLeft", "Loom L"],
  ["loomRight", "Loom R"],
  ["touch", "Touch"],
  ["bumpLeft", "Antenna L"],
  ["bumpRight", "Antenna R"],
  ["wind", "Wind"],
  ["sweet", "Sweet"],
  ["bitter", "Bitter"],
  ["water", "Water"],
  ["grounded", "On legs"],
  ["maleTaste", "Male taste"],
  ["wingbeat", "Wingbeat"],
  ["legsLeft", "Legs L"],
  ["legsRight", "Legs R"],
  ["light", "Light"],
  ["hunger", "Hunger"],
  ["thirst", "Thirst"],
] as const;
/** What comes out, and the neurons each is read from, by their rates' names in stats.rates. */
export const COMMANDS = [
  { key: "walk", label: "Walk", rates: ["DNg100"] },
  { key: "turn", label: "Steer", rates: ["DNa02 left", "DNa02 right"] },
  { key: "back", label: "Back up", rates: ["MDN"] },
  { key: "escape", label: "Escape", rates: ["DNp01"] },
  { key: "wings", label: "Wings", rates: ["flight"] },
  { key: "groom", label: "Groom", rates: ["DNg12"] },
  { key: "feed", label: "Feed", rates: ["MN9"] },
  { key: "sing", label: "Sing", rates: ["pIP10"] },
] as const;
const RATES = COMMANDS.reduce((n, c) => n + c.rates.length, 0);
/** How many numbers in and out it shows: the senses, the commands, then each command's rates. */
export const SIGNALS = SENSES.length + COMMANDS.length + RATES;

/** In and out: a heading per column, then sense/command names, bars and actual readout rates. */
export const SUB = 13;
// 11, so that the eight commands still show big enough to read on a small phone on its side.
export const ROW = 11;
export const NAME = { in: 50, out: 42 };
export const BAR = { width: 44, height: 5 };
export const HZ = 36;
const IN_WIDTH = NAME.in + BAR.width;
const OUT_WIDTH = NAME.out + BAR.width + HZ;
export const IN_COLOR = "#9fffd8";
export const OUT_COLOR = "#ffd59a";
export const IN_HEADING = { size: 10, color: IN_COLOR };
export const OUT_HEADING = { size: 10, color: OUT_COLOR };
export const RATE = { size: 9, color: "#ffffff", align: "right" as const };
export const SIGNAL_LABEL = { size: 10, color: "#e4f3ff" };
export const HZ_UNIT = { ...SIGNAL_LABEL, align: "right" as const };
/** Between its columns. */
const APART = 14;

/** A column of in or out: whether it is the commands, its first row, how many, and where it is from the panel's corner. */
type SignalColumn = { out: boolean; from: number; rows: number; x: number; y: number };

/**
 * In and out, in one column (the commands under the senses), two (side by
 * side) or three (the senses split in two, for a short screen): each column,
 * and the panel's size.
 */
function signalColumns(cols: number) {
  const half = Math.ceil(SENSES.length / 2);
  const split = (out: boolean) => (out ? [[0, COMMANDS.length]] : cols === 3 ? [[0, half], [half, SENSES.length - half]] : [[0, SENSES.length]]);
  const columns: SignalColumn[] = [];
  let x = 10, y = 27, bottom = 0;
  for (const out of [false, true]) {
    for (const [from, rows] of split(out)) {
      columns.push({ out, from, rows, x, y });
      bottom = Math.max(bottom, y + SUB + rows * ROW);
      if (cols === 1) y = bottom + 4;
      else x += (out ? OUT_WIDTH : IN_WIDTH) + APART;
    }
  }
  const width = cols === 1 ? 20 + OUT_WIDTH : x - APART + 10;
  return { columns, width, height: bottom + 5 };
}
const SIGNAL_COLUMNS = [1, 2, 3].map(signalColumns);

/**
 * How its cells are arranged: three or two to a row, and, for both its brain
 * and its day, one above the other or side by side. The layout takes
 * whichever is largest on the screen: three to a row, as wide as what it
 * sees, where there is room; two on a narrow screen; side by side on a short
 * one. What goes in and out is in `cols` columns instead (signalColumns).
 */
export type StatsShape = { kind: StatsKind; cols: number; side: boolean; width: number; height: number };

const rows = (cells: number, cols: number) => Math.ceil(cells / cols);
const brainHeight = (cols: number) => TRACE + 4 + rows(BRAIN_CELLS, cols) * CELL.height;
const dayHeight = (cols: number) => rows(DAY_CELLS, cols) * CELL.height;

/** In and out are `cols` columns: one, two or three (signalColumns). */
const signalsOf = (cols: number) => SIGNAL_COLUMNS[Math.min(3, Math.max(1, cols)) - 1];

export function statsShape(kind: StatsKind, cols: number, side: boolean): StatsShape {
  if (kind === "signals") {
    const { width, height } = signalsOf(cols);
    return { kind, cols, side: cols > 1, width, height };
  }
  const inner = cols * CELL.width;
  if (side) return { kind, cols, side, width: 20 + inner + 10 + inner, height: TOP + Math.max(brainHeight(cols), dayHeight(cols)) + FOOT };
  const height = TOP + (kind !== "day" ? brainHeight(cols) : 0) + (kind === "both" ? 4 : 0) + (kind !== "brain" ? dayHeight(cols) : 0) + FOOT;
  return { kind, cols, side, width: 20 + inner, height };
}

const shapesOf = (kind: StatsKind) =>
  kind === "signals" ? [statsShape(kind, 2, true), statsShape(kind, 1, false), statsShape(kind, 3, true)] : [statsShape(kind, 3, false), statsShape(kind, 2, false), ...(kind === "both" ? [statsShape(kind, 3, true)] : [])];

export type StatsLayout = {
  scale: number;
  shape: StatsShape;
  /** Across the screen from the other pictures; otherwise under them, at the place left by those showing (statsSlot). */
  across: boolean;
  /** At each corner the deck goes to, at each slot. */
  rects: Record<Corner, CornerRect[]>;
  origins: Record<Corner, { x: number; y: number }[]>;
  panel: { width: number; height: number };
  ppu: { x: number; y: number };
};

/**
 * Where it goes with the deck at each corner. Across the screen from the
 * others, at the same edge, in the width they leave; under them, in their
 * column, where that gives it more room. At a top corner it keeps clear of
 * the caption as what it sees does, and on the left of the menu's button; at
 * the bottom, of the shelf and the label; and, at the top while playing, of
 * the hints under it.
 */
export function statsLayout(frame: Frame, hud: HudLayout = hudLayout(frame), size = 1, kind: StatsKind = "both"): StatsLayout {
  const a = safeRect(frame);
  const eyes = insetLayout(frame, hud, size);
  const nerves = nervesLayout(frame, hud, size);
  const { margin } = INSET_PANEL;
  const eyesWidth = eyes.rects["top-right"].width, nervesWidth = nerves.rects["top-right"][1].width;
  const others = nerves.across ? eyesWidth + GAP + nervesWidth : Math.max(eyesWidth, nervesWidth);
  // Where the column of pictures may reach at the top (under the caption unless there's room beside it) and at the bottom.
  const topFor = (width: number) => (a.w / 2 - 120 - margin - 8 >= width ? a.y + margin : hud.captionY + 23);
  const floorFor = (width: number) => (hud.shelfLeft > a.x + margin + width ? a.y + a.h - margin : hud.labelY - 25);
  // While playing it is at the top: clear of the menu's button on the left, and of the hints under each side.
  const reach = (left: boolean, width: number) => hud.reserveHints ? Math.min(floorFor(width), left ? hud.hintsY - 50 : hud.rightY - 20) : floorFor(width);
  const topOf = (left: boolean, width: number) => Math.max(topFor(width), left ? hud.menuY + 26 : -Infinity);
  // Under the others at the top, as they are when both show, and over them at the bottom.
  const columnTop = (left: boolean) => {
    const c: Corner = left ? "top-left" : "top-right";
    return Math.max(eyes.rects[c].y + eyes.rects[c].height, nerves.rects[c][1].y + nerves.rects[c][1].height) + GAP;
  };
  const columnFoot = (left: boolean) => {
    const c: Corner = left ? "bottom-left" : "bottom-right";
    return Math.min(eyes.rects[c].y, nerves.rects[c][1].y) - GAP;
  };
  let best = { scale: -1, shape: shapesOf(kind)[0], inColumn: false };
  for (const shape of shapesOf(kind)) {
    const { width: W, height: H } = shape;
    const full = cornerScale(a, W, size);
    // Across: as wide as the room beside the others, and as tall as the room down the side.
    let wide = Math.min(full, (a.w - 3 * margin - others) / W);
    for (const left of [true, false]) wide = Math.min(wide, (reach(left, W * wide) - topOf(left, W * wide)) / H);
    let under = full;
    for (const left of [true, false]) under = Math.min(under, (reach(left, W * under) - columnTop(left)) / H, (columnFoot(left) - topOf(left, W * under)) / H);
    const scale = Math.max(wide, under);
    // A taller grid is worthwhile only when its type gets visibly larger.
    const taller = shape.cols === 2 && !shape.side && best.shape.cols === 3 && !best.shape.side;
    if (scale > best.scale * (taller ? 1.18 : 1) + 1e-9) best = { scale, shape, inColumn: under > wide };
  }
  const { shape, inColumn } = best;
  const scale = Math.max(0.05, best.scale);
  const width = shape.width * scale, height = shape.height * scale;
  const ppu = pixelsPerUnit(frame);
  const rects = {} as StatsLayout["rects"];
  const origins = {} as StatsLayout["origins"];
  for (const c of CORNERS) {
    const left = c.endsWith("left"), up = c.startsWith("top");
    const x = left ? a.x + margin : a.x + a.w - margin - width;
    const slots: CornerRect[] = [];
    if (!inColumn) {
      // Across from the others: wherever they are, it is in the same place.
      const l = across(c).endsWith("left");
      slots.push({ x: l ? a.x + margin : a.x + a.w - margin - width, y: up ? topOf(l, width) : floorFor(width) - height, width, height });
    } else {
      // Slot: what it sees shows (1), its nervous system (2), at this corner.
      for (let slot = 0; slot < 4; slot++) {
        const above = [slot & 1 ? eyes.rects[c] : null, slot & 2 ? nerves.rects[c][slot & 1] : null];
        let y = up ? topOf(left, width) : floorFor(width) - height;
        for (const r of above) if (r) y = up ? Math.max(y, r.y + r.height + GAP) : Math.min(y, r.y - GAP - height);
        slots.push({ x, y, width, height });
      }
    }
    rects[c] = slots;
    origins[c] = slots.map((r) => ({ x: Math.round(r.x * ppu.x), y: Math.round(r.y * ppu.y) }));
  }
  return { scale, shape, across: !inColumn, rects, origins, panel: { width: Math.round(width * ppu.x), height: Math.round(height * ppu.y) }, ppu };
}

/** Whether it should be up: as the other pictures, only in play, never over a menu or the full picture through its eyes. */
export function statsWanted(setting: ShowWhen, screen: string, wallpaper: boolean, fullPicture: boolean): CornerWanted {
  if (setting === "off" || screen !== "play" || fullPicture) return "hide";
  return setting === "always" || wallpaper ? "show" : "fade";
}

/** Its place: under whichever of the others show, in the column; anywhere across from them. */
export const statsSlot = (layout: StatsLayout, eyes: CornerWanted, nerves: CornerWanted) => (layout.across ? 0 : (eyes === "show" ? 1 : 0) | (nerves === "show" ? 2 : 0));

/** What it shows, as the game has it now. */
export type StatsState = {

  spikes: number;
  active: number;
  speed: number;
  /** Spikes a second, oldest first from `head`, as the brain's meter keeps them. */
  history: Float32Array;
  head: number;
  day: Day;
  /** What went to the brain last, and its latest answer: read only when the panel shows them. */
  sensed: BrainSenses;
  brain: BrainState | null;
};

/** A count in three figures: 412, 41.2k, 1.24M. */
export function figures(n: number) {
  if (!(n >= 0)) return "0";
  if (n < 999.5) return String(Math.round(n));
  const k = n / 1000;
  if (Number(k.toPrecision(3)) < 1000) return `${k.toPrecision(3)}k`;
  return `${(n / 1e6).toPrecision(3)}M`;
}

/** A distance in mm: 142 mm, 1.42 m. */
export function distance(mm: number) {
  if (mm < 999.5) return `${Math.round(Math.max(0, mm))} mm`;
  const m = mm / 1000;
  return m < 999.5 ? `${m.toPrecision(3)} m` : `${Math.round(m)} m`;
}

/** A time: 12 s, 3 min, 1.5 h. */
export function duration(seconds: number) {
  if (seconds < 60) return `${Math.floor(Math.max(0, seconds))} s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  return `${(seconds / 3600).toFixed(1)} h`;
}

/** How bright the world is to its eyes: the mean over every facet, 0 with them shut. */
export function meanLight(light: BrainSenses["light"]) {
  if (!light) return 0;
  let sum = 0;
  for (let i = 0; i < light.left.length; i++) sum += light.left[i];
  for (let i = 0; i < light.right.length; i++) sum += light.right[i];
  const n = light.left.length + light.right.length;
  return n > 0 ? sum / n : 0;
}

/** The most any part of it is touched, as the brain is told: each part feels the stronger of its own touch and `touch`, all of it at once. */
function touchOf(sensed: BrainSenses) {
  let most = sensed.touch;
  for (let k = 0; k < TOUCH_SENSES.length; k++) most = Math.max(most, sensed[TOUCH_SENSES[k]] ?? 0);
  return most;
}

/** A bar's length in whole design units of its width: the steps it is drawn in, so only a change that shows counts. */
const step = (v: number) => Math.round(Math.max(-1, Math.min(1, Number.isFinite(v) ? v : 0)) * BAR.width) / BAR.width;

/** What it shows of what goes in and out, in `out` (SIGNALS long), each to the step it is drawn in: the senses, the commands, then each command's rates in whole Hz. */
export function readSignals(s: StatsState, out: Float32Array) {
  const sensed = s.sensed;
  let i = 0;
  for (let k = 0; k < SENSES.length; k++) {
    const key = SENSES[k][0];
    out[i++] = step(
      key === "grounded" ? (sensed.grounded ? 1 : 0) : key === "light" ? meanLight(sensed.light) : key === "hunger" || key === "thirst" ? (sensed[key] ?? 1) : key === "touch" ? touchOf(sensed) : (sensed[key] ?? 0),
    );
  }
  const command = s.brain?.command;
  for (let k = 0; k < COMMANDS.length; k++) out[i++] = command ? step(command[COMMANDS[k].key]) : 0;
  const rates = s.brain?.stats.rates;
  for (let k = 0; k < COMMANDS.length; k++) for (let j = 0; j < COMMANDS[k].rates.length; j++) out[i++] = Math.round(rates?.[COMMANDS[k].rates[j]] ?? 0);
  return out;
}

/** A bar in a dark well, `v` of it lit; a signed one from its middle. */
export function bar(g: CanvasRenderingContext2D, x: number, y: number, v: number, color: string, signed: boolean) {
  const { width: w, height: h } = BAR;
  roundedRect(g, x, y, w, h, h / 2);
  g.fillStyle = "rgba(0, 16, 50, 0.5)";
  g.fill();
  if (Math.abs(v) < 0.01) return;
  const len = signed ? (Math.abs(v) * w) / 2 : v * w;
  const from = signed ? (v < 0 ? x + w / 2 - len : x + w / 2) : x;
  roundedRect(g, from, y, Math.max(h, len), h, h / 2);
  g.fillStyle = color;
  g.fill();
}

/** A column of in or out: a heading at the top of each (and the commands' unit over each of theirs), then a row each, a name and a bar, and for a command its neurons' rates. Steering is signed, from the middle. */
function signalColumn(g: CanvasRenderingContext2D, c: SignalColumn, v: Float32Array) {
  const { out, x, y } = c;
  if (c.from === 0) text(g, out ? "Out" : "In", x, y + 9, out ? OUT_HEADING : IN_HEADING);
  if (out) text(g, "Hz", x + OUT_WIDTH, y + 9, HZ_UNIT);
  // Each command's rates follow the commands, in order: to this column's first.
  let r = SENSES.length + COMMANDS.length;
  for (let i = 0; out && i < c.from; i++) r += COMMANDS[i].rates.length;
  for (let i = c.from; i < c.from + c.rows; i++) {
    const ry = y + SUB + (i - c.from) * ROW;
    if (!out) {
      text(g, SENSES[i][1], x, ry + 8, SIGNAL_LABEL);
      bar(g, x + NAME.in, ry + 3, v[i], IN_COLOR, false);
      continue;
    }
    const command = COMMANDS[i];
    text(g, command.label, x, ry + 8, SIGNAL_LABEL);
    bar(g, x + NAME.out, ry + 3, v[SENSES.length + i], OUT_COLOR, command.key === "turn");
    text(g, command.rates.length === 2 ? `${v[r]}·${v[r + 1]}` : String(v[r]), x + OUT_WIDTH, ry + 8, RATE);
    r += command.rates.length;
  }
}

/** The `i`th cell of a grid `cols` across from (x, y): a number over what it counts. A unit after the number ("142 mm") is in the small type, to fit. */
function cell(g: CanvasRenderingContext2D, x: number, y: number, cols: number, i: number, value: string, what: string) {
  const cx = x + 2 + (i % cols) * CELL.width;
  const cy = y + Math.floor(i / cols) * CELL.height;
  const space = value.lastIndexOf(" ");
  const figure = space < 0 ? value : value.slice(0, space);
  text(g, figure, cx, cy + 17, VALUE);
  if (space >= 0) {
    g.font = font(VALUE.size);
    text(g, value.slice(space + 1), cx + g.measureText(figure).width + 2, cy + 17, UNIT);
  }
  text(g, what, cx, cy + 34, UNIT);
}

/** The panel in its own design units at full size: the glass, then what it shows, as the game has it now. */
export function drawStatsPanel(g: CanvasRenderingContext2D, shape: StatsShape, s: StatsState, signalsNow?: Float32Array) {
  const { kind, cols, side, width, height } = shape;
  glassPanel(g, 1, 1, width - 2, height - 2, RADIUS, { tint: "night", shadow: false });

  if (kind === "signals") {
    const v = signalsNow ?? readSignals(s, new Float32Array(SIGNALS));
    for (const c of signalsOf(cols).columns) signalColumn(g, c, v);
    return;
  }
  const inner = cols * CELL.width;
  let y = TOP;
  if (kind !== "day") {
    // The trace of spikes a second, in a dark well.
    const w = inner, h = TRACE;
    roundedRect(g, 10, y, w, h, 6);
    g.fillStyle = "rgba(0, 16, 50, 0.5)";
    g.fill();
    let peak = 1;
    for (let i = 0; i < HISTORY_SAMPLES; i++) peak = Math.max(peak, s.history[i]);
    peak *= 1.15;
    g.beginPath();
    g.moveTo(14, y + h - 3);
    for (let i = 0; i < HISTORY_SAMPLES; i++) g.lineTo(14 + ((w - 8) * i) / (HISTORY_SAMPLES - 1), y + h - 3 - (h - 6) * (s.history[(s.head + i) % HISTORY_SAMPLES] / peak));
    g.lineTo(10 + w - 4, y + h - 3);
    g.closePath();
    g.fillStyle = "rgba(120, 255, 200, 0.6)";
    g.fill();
    const cy = y + h + 4;
    cell(g, 10, cy, cols, 0, figures(s.spikes), "spikes/s");
    cell(g, 10, cy, cols, 1, figures(s.active), "active");
    cell(g, 10, cy, cols, 2, `${s.speed.toFixed(2)}×`, "real time");
    if (!side) y += brainHeight(cols) + 4;
  }
  if (kind !== "brain") {
    const d = s.day;
    const x = side ? 20 + inner : 10;
    cell(g, x, y, cols, 0, distance(d.walked), "walked");
    cell(g, x, y, cols, 1, String(d.meals), "meals");
    cell(g, x, y, cols, 2, String(d.takeOffs), "take-offs");
    cell(g, x, y, cols, 3, duration(d.flown), "flying");
    cell(g, x, y, cols, 4, duration(d.groomed), "grooming");
  }
}

export const STATS_VS = /* glsl */ `
uniform vec2 origin;
uniform vec2 panelSize;
uniform vec2 frame;
varying vec2 vUv;
void main() {
  vec2 px = origin + position.xy * panelSize;
  gl_Position = vec4(px.x / (frame.x * 0.5) - 1.0, 1.0 - px.y / (frame.y * 0.5), 0.0, 1.0);
  vUv = vec2(position.x, 1.0 - position.y);
}`;

export const STATS_FS = /* glsl */ `
uniform sampler2D panel;
uniform float alpha;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(panel, vUv);
  gl_FragColor = vec4(c.rgb, c.a * alpha);
}`;

export class StatsPanel {
  readonly placement = new CornerPlacement();
  /** Drawn with the overlay (the game adds it to the overlay's scene), before the menus and hints. */
  readonly mesh: THREE.Mesh;
  readonly #material: THREE.ShaderMaterial;
  readonly #canvas: HTMLCanvasElement;
  readonly #g: CanvasRenderingContext2D;
  #texture: THREE.CanvasTexture;
  #layout: StatsLayout = statsLayout(TV_FRAME);
  #kind: StatsKind = "both";
  #since = 1;
  /** What it last drew, to tell when it has changed; what goes in and out as last drawn, and as it is now. */
  readonly #drawn = { kind: "", head: -1, walked: -1, meals: -1, takeOffs: -1, flown: -1, groomed: -1, date: "" };
  #signalsDrawn = new Float32Array(SIGNALS);
  #signalsNow = new Float32Array(SIGNALS);

  constructor() {
    this.#canvas = document.createElement("canvas");
    const g = this.#canvas.getContext("2d");
    if (!g) throw new Error("No 2D canvas for the stats");
    this.#g = g;
    this.#texture = this.#makeTexture();
    this.#material = new THREE.ShaderMaterial({
      vertexShader: STATS_VS,
      fragmentShader: STATS_FS,
      uniforms: {
        panel: { value: this.#texture },
        alpha: { value: 0 },
        origin: { value: new THREE.Vector2() },
        panelSize: { value: new THREE.Vector2() },
        frame: { value: new THREE.Vector2(TV_FRAME.width, TV_FRAME.height) },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]), 3));
    geometry.setIndex([0, 2, 1, 2, 3, 1]);
    this.mesh = new THREE.Mesh(geometry, this.#material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    // Under the overlay's quad: both are in the transparent list, drawn in this order.
    this.mesh.renderOrder = -1;
    this.layout(TV_FRAME, hudLayout(TV_FRAME), 1, "both");
  }

  get layoutNow(): StatsLayout {
    return this.#layout;
  }

  /** The screen changed shape, or the pictures' size, or what it shows: its size and places follow, and it is drawn again. */
  layout(frame: Frame, hud: HudLayout, size: number, kind: StatsKind) {
    const layout = statsLayout(frame, hud, size, kind);
    this.#layout = layout;
    this.#kind = kind;
    const { width, height } = layout.panel;
    if (this.#canvas.width !== width || this.#canvas.height !== height) {
      this.#canvas.width = width;
      this.#canvas.height = height;
      // A texture's storage is its first size: a new one for the new size.
      this.#texture.dispose();
      this.#texture = this.#makeTexture();
      this.#material.uniforms.panel.value = this.#texture;
    }
    (this.#material.uniforms.panelSize.value as THREE.Vector2).set(width, height);
    (this.#material.uniforms.frame.value as THREE.Vector2).set(frame.width, frame.height);
    this.#drawn.kind = "";
    this.#since = 1;
  }

  /** Where it is: the corner it is in, or "hidden". */
  get state(): Corner | "hidden" {
    return this.mesh.visible ? (this.#layout.across ? across(this.placement.corner) : this.placement.corner) : "hidden";
  }

  /** Where it is with the deck at a corner, at its place there (statsSlot). */
  at(corner: Corner, slot: number) {
    const slots = this.#layout.rects[corner];
    return slots[Math.min(slot, slots.length - 1)];
  }

  /** Once a frame, after the corner deck, with its place there; `opacity` is Settings'. */
  update(dt: number, wanted: CornerWanted, deck: CornerDeck, slot: number, opacity: number, s: StatsState) {
    this.placement.update(dt, wanted, deck.goal, slot);
    this.#since += dt;
    this.mesh.visible = this.placement.alpha > 0;
    if (!this.mesh.visible) return;
    // Looked at, and drawn if anything has changed, at most REDRAWS times a second: what goes in and out moves all the time.
    if (this.#since >= 1 / REDRAWS) {
      if (this.#changed(s)) this.#draw(s);
      else this.#since = 0;
    }
    const uniforms = this.#material.uniforms;
    uniforms.alpha.value = this.placement.alpha * opacity;
    const slots = this.#layout.origins[this.placement.corner];
    const origin = slots[Math.min(this.placement.slot, slots.length - 1)];
    (uniforms.origin.value as THREE.Vector2).set(origin.x, origin.y);
  }

  /** Whether anything it shows has changed since it was drawn, to the figure it is shown to. */
  #changed(s: StatsState) {
    const d = this.#drawn, day = s.day, kind = this.#kind;
    if (d.kind !== kind) {
      if (kind === "signals") readSignals(s, this.#signalsNow);
      return true;
    }
    if (kind === "signals") {
      const now = readSignals(s, this.#signalsNow), drawn = this.#signalsDrawn;
      for (let i = 0; i < SIGNALS; i++) if (now[i] !== drawn[i]) return true;
      return false;
    }
    if (kind !== "brain" && (d.date !== day.date || d.meals !== day.meals || d.takeOffs !== day.takeOffs || d.walked !== Math.round(day.walked) || d.flown !== Math.floor(day.flown) || d.groomed !== Math.floor(day.groomed))) return true;
    // The trace moves on with each sample the meter takes, and the figures with it.
    return kind !== "day" && d.head !== s.head;
  }

  #draw(s: StatsState) {
    const d = this.#drawn, day = s.day;
    d.kind = this.#kind;

    d.head = s.head;
    d.date = day.date;
    d.walked = Math.round(day.walked);
    d.meals = day.meals;
    d.takeOffs = day.takeOffs;
    d.flown = Math.floor(day.flown);
    d.groomed = Math.floor(day.groomed);
    this.#since = 0;
    const g = this.#g;
    const { panel, ppu, scale: k } = this.#layout;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, panel.width, panel.height);
    g.setTransform(ppu.x * k, 0, 0, ppu.y * k, 0, 0);
    // What goes in and out as it was read to tell it had changed, and kept as drawn.
    const now = this.#signalsNow;
    this.#signalsNow = this.#signalsDrawn;
    this.#signalsDrawn = now;
    drawStatsPanel(g, this.#layout.shape, s, now);
    this.#texture.needsUpdate = true;
  }

  #makeTexture() {
    const texture = new THREE.CanvasTexture(this.#canvas);
    // Texel for pixel: the panel is placed on whole pixels.
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    return texture;
  }
}
