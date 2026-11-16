// The fly's stats, small in a corner: its brain at work (spikes a second,
// neurons active, how fast it runs against real time, and a trace of the
// last twenty seconds), what it is doing now, and its day so far (stats/
// tally.ts). Every number is read from what is running or what happened: the
// brain's meter, the body's activity as Life describes it, and the tally.
// The words are only units; the numbers are what the player asked for.
//
// One draw: a quad with a small canvas, drawn with the menu kit and uploaded
// only when what it shows has changed, at most REDRAWS times a second. It is
// drawn with the overlay, under the menus and hints, and fades by itself, as
// the other pictures do. Across the screen from them, at the same edge, and
// moving round with them (ui/corners.ts); or, on a screen too narrow for
// that, under them, where there is more room.

import * as THREE from "three";
import { font, glassPanel, roundedRect, text } from "@fly/ui";
import { HISTORY_SAMPLES } from "../brain/meter.ts";
import { TV_FRAME, pixelsPerUnit } from "../display.ts";
import type { Frame } from "../display.ts";
import { INSET_PANEL, cornerScale, insetLayout } from "../eyes/inset.ts";
import type { Activity } from "../life.ts";
import { nervesLayout } from "../nerves/panel.ts";
import type { Day, ShowWhen, StatsKind } from "../settings.ts";
import { CORNERS, CornerPlacement, across } from "../ui/corners.ts";
import type { Corner, CornerDeck, CornerRect, CornerWanted } from "../ui/corners.ts";
import { caption } from "../ui/hud.ts";
import { hudLayout, safeRect } from "../ui/layout.ts";
import type { HudLayout } from "../ui/layout.ts";

/** The panel, design units at full size: a heading, then a grid of cells (a number over its unit), with a trace over the brain's. */
const RADIUS = 14;
const HEADING = { x: 12, y: 19, size: 12, color: "#eaf6ff" };
const TOP = 27;
const FOOT = 5;
const TRACE = 22;
const CELL = { width: 52, height: 28 };
const BRAIN_CELLS = 3;
const DAY_CELLS = 5;
/** Between it and the others, design units. */
const GAP = 8;
/** The most times a second it is drawn again. */
export const REDRAWS = 4;

const VALUE = { size: 13, color: "#ffffff" };
const UNIT = { size: 9, color: "rgba(220, 240, 255, 0.72)" };

/**
 * How its cells are arranged: three or two to a row, and, for both its brain
 * and its day, one above the other or side by side. The layout takes
 * whichever is largest on the screen: three to a row, as wide as what it
 * sees, where there is room; two on a narrow screen; side by side on a short
 * one.
 */
export type StatsShape = { kind: StatsKind; cols: number; side: boolean; width: number; height: number };

const rows = (cells: number, cols: number) => Math.ceil(cells / cols);
const brainHeight = (cols: number) => TRACE + 4 + rows(BRAIN_CELLS, cols) * CELL.height;
const dayHeight = (cols: number) => rows(DAY_CELLS, cols) * CELL.height;

export function statsShape(kind: StatsKind, cols: number, side: boolean): StatsShape {
  const inner = cols * CELL.width;
  if (side) return { kind, cols, side, width: 20 + inner + 10 + inner, height: TOP + Math.max(brainHeight(cols), dayHeight(cols)) + FOOT };
  const height = TOP + (kind !== "day" ? brainHeight(cols) : 0) + (kind === "both" ? 4 : 0) + (kind !== "brain" ? dayHeight(cols) : 0) + FOOT;
  return { kind, cols, side, width: 20 + inner, height };
}

const shapesOf = (kind: StatsKind) => [statsShape(kind, 3, false), statsShape(kind, 2, false), ...(kind === "both" ? [statsShape(kind, 3, true)] : [])];

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
  const reach = (left: boolean, width: number) => Math.min(floorFor(width), left ? hud.hintsY - 50 : hud.rightY - 20);
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
    if (scale > best.scale + 1e-9) best = { scale, shape, inColumn: under > wide };
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
  activity: Activity;
  spikes: number;
  active: number;
  speed: number;
  /** Spikes a second, oldest first from `head`, as the brain's meter keeps them. */
  history: Float32Array;
  head: number;
  day: Day;
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

/** The `i`th cell of a grid `cols` across from (x, y): a number over what it counts. A unit after the number ("142 mm") is in the small type, to fit. */
function cell(g: CanvasRenderingContext2D, x: number, y: number, cols: number, i: number, value: string, what: string) {
  const cx = x + 2 + (i % cols) * CELL.width;
  const cy = y + Math.floor(i / cols) * CELL.height;
  const space = value.lastIndexOf(" ");
  const figure = space < 0 ? value : value.slice(0, space);
  text(g, figure, cx, cy + 12, VALUE);
  if (space >= 0) {
    g.font = font(VALUE.size);
    text(g, value.slice(space + 1), cx + g.measureText(figure).width + 2, cy + 12, UNIT);
  }
  text(g, what, cx, cy + 23, UNIT);
}

/** The panel in its own design units at full size: the glass, then what it shows, as the game has it now. */
export function drawStatsPanel(g: CanvasRenderingContext2D, shape: StatsShape, s: StatsState) {
  const { kind, cols, side, width, height } = shape;
  glassPanel(g, 1, 1, width - 2, height - 2, RADIUS, { tint: "night", shadow: false });
  // What it is doing heads its day; the brain alone is only the brain. Smaller, if it must be, to fit.
  const heading = kind === "brain" ? "Its brain" : caption(s.activity, null);
  g.font = font(HEADING.size);
  const size = Math.min(HEADING.size, Math.floor((HEADING.size * (width - 2 * HEADING.x)) / g.measureText(heading).width));
  text(g, heading, HEADING.x, HEADING.y, { size, color: HEADING.color });
  const inner = cols * CELL.width;
  let y = TOP;
  if (kind !== "day") {
    // The trace of spikes a second, as on the brain's own screen, in a dark well.
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

const STATS_VS = /* glsl */ `
uniform vec2 origin;
uniform vec2 panelSize;
uniform vec2 frame;
varying vec2 vUv;
void main() {
  vec2 px = origin + position.xy * panelSize;
  gl_Position = vec4(px.x / (frame.x * 0.5) - 1.0, 1.0 - px.y / (frame.y * 0.5), 0.0, 1.0);
  vUv = vec2(position.x, 1.0 - position.y);
}`;

const STATS_FS = /* glsl */ `
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
  /** What it last drew, to tell when it has changed. */
  readonly #drawn = { kind: "", activity: "", head: -1, walked: -1, meals: -1, takeOffs: -1, flown: -1, groomed: -1, date: "" };

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
    if (this.#since >= 1 / REDRAWS && this.#changed(s)) this.#draw(s);
    const uniforms = this.#material.uniforms;
    uniforms.alpha.value = this.placement.alpha * opacity;
    const slots = this.#layout.origins[this.placement.corner];
    const origin = slots[Math.min(this.placement.slot, slots.length - 1)];
    (uniforms.origin.value as THREE.Vector2).set(origin.x, origin.y);
  }

  /** Whether anything it shows has changed since it was drawn, to the figure it is shown to. */
  #changed(s: StatsState) {
    const d = this.#drawn, day = s.day, kind = this.#kind;
    if (d.kind !== kind) return true;
    if (kind !== "brain" && (d.activity !== s.activity || d.date !== day.date || d.meals !== day.meals || d.takeOffs !== day.takeOffs || d.walked !== Math.round(day.walked) || d.flown !== Math.floor(day.flown) || d.groomed !== Math.floor(day.groomed))) return true;
    // The trace moves on with each sample the meter takes, and the figures with it.
    return kind !== "day" && d.head !== s.head;
  }

  #draw(s: StatsState) {
    const d = this.#drawn, day = s.day;
    d.kind = this.#kind;
    d.activity = s.activity;
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
    drawStatsPanel(g, this.#layout.shape, s);
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
