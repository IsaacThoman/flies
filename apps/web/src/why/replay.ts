// "Why?": the last few seconds of the fly's nervous system played back slowly,
// with the neurons its last action's command is read from marked, and the
// senses and the regions where senses come in that rose before it picked out:
// while something is marked, the rest of the drawing glows at DIM of what was
// recorded, so that what is marked stands out. The drawing is the corner panel's
// (nerves/panel.ts), larger, glowing from the recording instead of the live
// brain; beside it, the In and out bars (stats/panel.ts) as they were, and
// under them a timeline of the marked neurons' and senses' recordings with the
// moment the body acted on it, which the player can scrub. Only what was
// recorded is shown: no words but names and units.
//
// Two draws while it shows, none otherwise: the nervous system's geometry,
// whose first two triangles carry the glass, and over it a quad with the
// card's words, bars, timeline and the rings round the marked somata (a canvas
// drawn again at most REDRAWS times a second while it plays, over a copy of
// the parts that don't move). The live fly goes on behind it: this is a copy
// of what was kept when it was asked for.

import * as THREE from "three";
import { REGIONS } from "@fly/brain";
import { COMMAND_ORDER } from "@fly/contracts";
import { NERVE_PARTS, SOMA_GROUPS, createNervesPanelMaterial, somaPlaces } from "@fly/fly";
import type { FlyNervesModel, NervesPanelUniforms } from "@fly/fly";
import { glassPanel, roundedRect, text } from "@fly/ui";
import { TV_FRAME, pixelsPerUnit } from "../display.ts";
import type { Frame } from "../display.ts";
import { NerveGlow, glowTarget } from "../nerves/glow.ts";
import { NERVES_VIEW } from "../nerves/panel.ts";
import { partRegions } from "../nerves/regions.ts";
import { BAR, COMMANDS, HZ, HZ_UNIT, IN_COLOR, IN_HEADING, NAME, OUT_COLOR, OUT_HEADING, RATE, ROW, SENSES, SIGNAL_LABEL, STATS_FS, STATS_VS, SUB, bar } from "../stats/panel.ts";
import { hudLayout, safeRect } from "../ui/layout.ts";
import type { HudLayout } from "../ui/layout.ts";
import { AFTER, explain } from "./pick.ts";
import type { Why } from "./pick.ts";
import { AT, CAPACITY, Clip, SAMPLE_HZ } from "./recorder.ts";
import type { Recorder } from "./recorder.ts";

/** It plays at a quarter of the fly's time, holds the end this long (s), and after a scrub waits this long (s) before playing on. */
export const SLOW = 0.25;
const END_HOLD = 1.2;
const SCRUB_HOLD = 1.5;
/** The most times a second the card is drawn again. */
const REDRAWS = 15;
/** Seconds to come in; it goes at once. */
const FADE_IN = 0.2;
/** Design units per body length in its picture, at full size: a quarter bigger than the corner panel's. */
const SCALE = 437.5;
const IN_WIDTH = NAME.in + BAR.width;
const OUT_WIDTH = NAME.out + BAR.width + HZ;
const APART = 14;
const COLUMNS = IN_WIDTH + APART + OUT_WIDTH;
const IN_ROWS = SUB + SENSES.length * ROW;
const LINE_HEIGHT = 53;
/** What the unmarked parts glow at, as a share of their recorded glow, while something is marked. */
export const DIM = 0.35;
/** The biggest it is drawn, as a share of its full size. */
const LARGEST = 1.6;

type Rect = { x: number; y: number; w: number; h: number };
/** Each command's neurons, by their place in SOMA_GROUPS, in COMMANDS order. */
const RATE_GROUPS = COMMANDS.map((c) => c.rates.map((rate) => SOMA_GROUPS.findIndex((g) => g.rate === rate)));

/**
 * Where everything is on the card, in its design units at full size, and its
 * picture's design units per body length: the picture beside the bars with the
 * timeline under them ("wide"); over them, on a narrow screen ("tall"); or, on
 * a short one, smaller, as tall as the senses, with the timeline under the
 * commands ("low").
 */
export type CardShape = { width: number; height: number; picture: Rect; scale: number; inX: number; outX: number; top: number; line: Rect };
export type CardKind = "wide" | "tall" | "low";
export const CARD_KINDS: readonly CardKind[] = ["wide", "tall", "low"];

const pictureOf = (scale: number): Rect => ({ x: 10, y: 12, w: 2 * NERVES_VIEW.halfWidth * scale, h: (NERVES_VIEW.top - NERVES_VIEW.bottom) * scale });

export function cardShape(kind: CardKind): CardShape {
  if (kind === "wide") {
    const picture = pictureOf(SCALE);
    const x = picture.x + picture.w + APART;
    const lineY = 12 + IN_ROWS + 12;
    return { width: x + COLUMNS + 10, height: picture.y + picture.h + 10, picture, scale: SCALE, inX: x, outX: x + IN_WIDTH + APART, top: 12, line: { x, y: lineY, w: COLUMNS, h: picture.y + picture.h - lineY } };
  }
  if (kind === "low") {
    const scale = IN_ROWS / (NERVES_VIEW.top - NERVES_VIEW.bottom);
    const picture = pictureOf(scale);
    const inX = picture.x + picture.w + APART, outX = inX + IN_WIDTH + APART;
    const lineY = 12 + SUB + COMMANDS.length * ROW + 8;
    return { width: outX + OUT_WIDTH + 10, height: 12 + IN_ROWS + 10, picture, scale, inX, outX, top: 12, line: { x: outX, y: lineY, w: OUT_WIDTH, h: 12 + IN_ROWS - lineY } };
  }
  const picture = pictureOf(SCALE);
  const width = 20 + COLUMNS;
  picture.x = (width - picture.w) / 2;
  const top = picture.y + picture.h + 10;
  const lineY = top + IN_ROWS + 12;
  return { width, height: lineY + LINE_HEIGHT + 10, picture, scale: SCALE, inX: 10, outX: 10 + IN_WIDTH + APART, top, line: { x: 10, y: lineY, w: COLUMNS, h: LINE_HEIGHT } };
}

export type CardLayout = { shape: CardShape; scale: number; rect: { x: number; y: number; width: number; height: number }; panel: { width: number; height: number }; origin: { x: number; y: number }; ppu: { x: number; y: number } };

/**
 * Where the card goes: in the room the picture through the fly's eyes has
 * (between the caption and the tool's label), as large as fits, with its
 * picture beside the bars or, where that comes out larger, over them.
 */
export function cardLayout(frame: Frame, hud: HudLayout = hudLayout(frame)): CardLayout {
  const a = safeRect(frame);
  const top = Math.max(a.y + a.h * 0.11, hud.captionY + 23);
  const bottom = Math.min(a.y + a.h * 0.73, hud.labelY - 29);
  const room = { w: a.w * 0.84, h: Math.max(1, bottom - top) };
  let best = { shape: cardShape("wide"), scale: 0 };
  for (const kind of CARD_KINDS) {
    const shape = cardShape(kind);
    const scale = Math.min(LARGEST, room.w / shape.width, room.h / shape.height);
    if (scale > best.scale) best = { shape, scale };
  }
  const { shape } = best;
  const scale = Math.max(0.05, best.scale);
  const width = shape.width * scale, height = shape.height * scale;
  const rect = { x: a.x + (a.w - width) / 2, y: top + (room.h - height) / 2, width, height };
  const ppu = pixelsPerUnit(frame);
  return { shape, scale, rect, panel: { width: Math.round(width * ppu.x), height: Math.round(height * ppu.y) }, origin: { x: Math.round(rect.x * ppu.x), y: Math.round(rect.y * ppu.y) }, ppu };
}

/** Each command group's somata, design units on the card's picture at full size. */
function markersOn({ picture, scale }: CardShape) {
  return somaPlaces().map((group) => group.points.map(([x, z]) => ({ x: picture.x + picture.w / 2 - x * scale, y: picture.y + NERVES_VIEW.top * scale - z * scale })));
}

/** A canvas's texture, texel for pixel: the card is placed on whole pixels. */
function canvasTexture(canvas: HTMLCanvasElement) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

/**
 * Each part's glow through the clip into `out` (`parts` a sample), as the
 * live display would have shown it: the same envelope (nerves/glow.ts), run
 * over the recorded rates from the clip's start, which is taken as it stood
 * rather than lit up from dark. Once, when Why? is asked for.
 */
export function glowSeries(clip: Clip, out: Float32Array, parts: number) {
  const scratch = new Float32Array(parts);
  const glow = new NerveGlow(scratch);
  const rates = new Float32Array(REGIONS.length);
  const readouts: Record<string, number> = {};
  for (let i = 0; i < clip.length; i++) {
    for (let r = 0; r < REGIONS.length; r++) rates[r] = clip.at(i, AT.regions + r);
    for (let g = 0; g < SOMA_GROUPS.length; g++) readouts[SOMA_GROUPS[g].rate] = clip.at(i, AT.rates + g);
    glow.update(rates, i === 0 ? 60 : 1 / SAMPLE_HZ, readouts);
    out.set(scratch, i * parts);
  }
}

/** Seconds as the timeline says them, from when the body acted: −0.40 s. */
export const fromOnset = (seconds: number) => `${seconds < -0.005 ? "−" : seconds > 0.005 ? "+" : ""}${Math.abs(seconds).toFixed(2)} s`;

export class ReplayView {
  /** Drawn with the overlay (the game adds both to the overlay's scene), before the menus and hints: its nervous system on its glass, and the card over it. */
  readonly mesh: THREE.Mesh;
  readonly card: THREE.Mesh;
  readonly #uniforms: NervesPanelUniforms;
  readonly #cardMaterial: THREE.ShaderMaterial;
  readonly #glass: HTMLCanvasElement;
  #glassTexture: THREE.CanvasTexture;
  /** The glow it draws with, its own: the live fly's goes on in the X-ray and the corner. */
  readonly #glow: { value: Float32Array };
  readonly #clip = new Clip();
  /** Each part's glow at each sample of the clip, worked out once when it is asked for, and how much of it each part shows (DIM, or all of it where marked). */
  readonly #series: Float32Array;
  readonly #shown: Float32Array;
  readonly #partRegion = partRegions();
  readonly #somaPart = SOMA_GROUPS.map((g) => NERVE_PARTS.findIndex((p) => p.id === g.id));
  readonly #canvas: HTMLCanvasElement;
  readonly #still: HTMLCanvasElement;
  #texture: THREE.CanvasTexture;
  #layout: CardLayout = cardLayout(TV_FRAME);
  #markers = markersOn(cardShape("wide"));
  #why: Why = explain(this.#clip);
  /** Where it is in the clip (samples, fractional), how long it holds there (s), and how much of it shows. */
  #at = 0;
  #hold = 0;
  #since = 1;
  #drawnAt = -1;
  alpha = 0;

  constructor(nerves: FlyNervesModel) {
    this.#glow = { value: new Float32Array(nerves.glow.length) };
    this.#series = new Float32Array(CAPACITY * nerves.glow.length);
    this.#shown = new Float32Array(nerves.glow.length).fill(1);
    this.#canvas = document.createElement("canvas");
    this.#still = document.createElement("canvas");
    this.#glass = document.createElement("canvas");
    this.#texture = canvasTexture(this.#canvas);
    this.#glassTexture = canvasTexture(this.#glass);
    this.#uniforms = {
      uFrame: { value: new THREE.Vector2(TV_FRAME.width, TV_FRAME.height) },
      uPanel: { value: new THREE.Vector4() },
      uView: { value: new THREE.Vector4() },
      uPicture: { value: new THREE.Vector4() },
      uBackdrop: { value: this.#glassTexture },
      uAlpha: { value: 0 },
    };
    this.mesh = new THREE.Mesh(nerves.geometry, createNervesPanelMaterial(this.#glow, nerves.rest, this.#uniforms));
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    // Over the corner pictures, under the overlay's quad: all in the transparent list, drawn in this order.
    this.mesh.renderOrder = -1;
    this.#cardMaterial = new THREE.ShaderMaterial({
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
    const quad = new THREE.BufferGeometry();
    quad.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]), 3));
    quad.setIndex([0, 2, 1, 2, 3, 1]);
    this.card = new THREE.Mesh(quad, this.#cardMaterial);
    this.card.frustumCulled = false;
    this.card.visible = false;
    this.card.renderOrder = -0.5;
    this.layout(TV_FRAME, hudLayout(TV_FRAME));
  }

  /** What it is showing: what the body did, the sample it began at and the samples shown, its neurons and the senses before it. */
  get why(): Readonly<Why> {
    return this.#why;
  }

  /** Where it is, seconds from when the body acted (from the clip's start, when it began before the recording). */
  get at(): number {
    const why = this.#why;
    return (this.#at - (why.onset >= 0 ? why.onset : why.from)) / SAMPLE_HZ;
  }

  /** Takes what the recorder has kept, picks what to show, and plays it from the start. */
  open(recorder: Recorder) {
    const clip = this.#clip;
    recorder.copyTo(clip);
    const why = (this.#why = explain(clip));
    glowSeries(clip, this.#series, this.#glow.value.length);
    const shown = this.#shown;
    shown.fill(why.action === null ? 1 : DIM);
    for (let p = 0; p < this.#partRegion.length; p++) if (why.regions.includes(this.#partRegion[p])) shown[p] = 1;
    for (const g of why.groups) shown[this.#somaPart[g]] = 1;
    this.#at = this.#why.from;
    this.#hold = 0;
    this.#drawStill();
    this.#drawnAt = -1;
    this.#since = 1;
  }

  /** The screen changed shape: its size follows, and its card is drawn again. */
  layout(frame: Frame, hud: HudLayout) {
    const layout = cardLayout(frame, hud);
    this.#layout = layout;
    const { width, height } = layout.panel;
    if (this.#canvas.width !== width || this.#canvas.height !== height) {
      this.#canvas.width = this.#still.width = this.#glass.width = width;
      this.#canvas.height = this.#still.height = this.#glass.height = height;
      // A texture's storage is its first size: new ones for the new size.
      this.#texture.dispose();
      this.#glassTexture.dispose();
      this.#texture = canvasTexture(this.#canvas);
      this.#glassTexture = canvasTexture(this.#glass);
      this.#uniforms.uBackdrop.value = this.#glassTexture;
      this.#cardMaterial.uniforms.panel.value = this.#texture;
    }
    const k = layout.scale, { x: px, y: py } = layout.ppu, p = layout.shape.picture, S = layout.shape.scale;
    this.#markers = markersOn(layout.shape);
    this.#uniforms.uFrame.value.set(frame.width, frame.height);
    this.#uniforms.uPanel.value.set(layout.origin.x, layout.origin.y, width, height);
    this.#uniforms.uView.value.set((p.x + p.w / 2) * k * px, (p.y + NERVES_VIEW.top * S) * k * py, S * k * px, S * k * py);
    this.#uniforms.uPicture.value.set(p.x * k * px, p.y * k * py, (p.x + p.w) * k * px, (p.y + p.h) * k * py);
    const u = this.#cardMaterial.uniforms;
    (u.origin.value as THREE.Vector2).set(layout.origin.x, layout.origin.y);
    (u.panelSize.value as THREE.Vector2).set(width, height);
    (u.frame.value as THREE.Vector2).set(frame.width, frame.height);
    this.#drawGlass();
    this.#drawStill();
    this.#drawnAt = -1;
  }

  /** Where it is on the screen, design units. */
  get rect() {
    return this.#layout.rect;
  }

  /** Moves the playhead by a share of the clip (a drag, a swipe, a key or a stick held), and holds it there a moment. */
  scrub(share: number) {
    const why = this.#why;
    const last = Math.max(why.from, why.to - 1);
    this.#at = Math.min(last, Math.max(why.from, this.#at + share * (last - why.from)));
    this.#hold = SCRUB_HOLD;
  }

  /** Once a frame: `shown` while View is on Why? in play. It comes in quickly and goes at once. */
  update(dt: number, shown: boolean) {
    this.alpha = shown ? Math.min(1, this.alpha + dt / FADE_IN) : 0;
    this.mesh.visible = this.card.visible = this.alpha > 0;
    if (!this.mesh.visible) return;
    this.#uniforms.uAlpha.value = this.alpha;
    this.#cardMaterial.uniforms.alpha.value = this.alpha;
    const why = this.#why;
    const last = Math.max(why.from, why.to - 1);
    if (this.#hold > 0) this.#hold -= dt;
    else if (this.#at >= last) this.#at = why.from;
    else {
      this.#at = Math.min(last, this.#at + dt * SAMPLE_HZ * SLOW);
      if (this.#at >= last) this.#hold = END_HOLD;
    }
    this.#glowAt(this.#at);
    this.#since += dt;
    if (this.#since >= 1 / REDRAWS && this.#at !== this.#drawnAt) this.#draw();
  }

  #glowAt(at: number) {
    const out = this.#glow.value, parts = out.length, series = this.#series, shown = this.#shown;
    const n = this.#clip.length;
    if (n === 0) {
      out.fill(0);
      return;
    }
    const i = Math.min(n - 1, Math.floor(at)), j = Math.min(n - 1, i + 1), f = at - i;
    const a = i * parts, b = j * parts;
    for (let p = 0; p < parts; p++) out[p] = (series[a + p] + (series[b + p] - series[a + p]) * f) * shown[p];
  }

  /** Begins a drawing in the card's design units at full size. */
  #begin(canvas: HTMLCanvasElement) {
    const g = canvas.getContext("2d");
    if (!g) throw new Error("No 2D canvas for Why?");
    const { panel, ppu, scale: k } = this.#layout;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, panel.width, panel.height);
    g.setTransform(ppu.x * k, 0, 0, ppu.y * k, 0, 0);
    return g;
  }

  /** The x of sample `i` on the timeline: asked just after it acted, the second after is there, still to come, so the moment it acted is always as far along. */
  #timeX(i: number) {
    const { line } = this.#layout.shape, why = this.#why;
    const end = why.onset >= 0 ? Math.max(why.to - 1, why.onset + AFTER * SAMPLE_HZ) : why.to - 1;
    const span = Math.max(1, end - why.from);
    return line.x + 4 + ((line.w - 8) * (i - why.from)) / span;
  }

  /** Under the nervous system: the glass and the picture's well. */
  #drawGlass() {
    const g = this.#begin(this.#glass);
    const { shape } = this.#layout;
    glassPanel(g, 1, 1, shape.width - 2, shape.height - 2, 14, { tint: "night", shadow: false });
    const p = shape.picture;
    roundedRect(g, p.x - 2, p.y - 2, p.w + 4, p.h + 4, 6);
    g.fillStyle = "#bac9db";
    g.fill();
    this.#glassTexture.needsUpdate = true;
  }

  /** What doesn't move as it plays: the names, the timeline and its traces. */
  #drawStill() {
    const g = this.#begin(this.#still);
    const { shape } = this.#layout, why = this.#why, clip = this.#clip;
    const marked = why.action !== null;
    text(g, "In", shape.inX, shape.top + 9, IN_HEADING);
    text(g, "Out", shape.outX, shape.top + 9, OUT_HEADING);
    text(g, "Hz", shape.outX + OUT_WIDTH, shape.top + 9, HZ_UNIT);
    for (let s = 0; s < SENSES.length; s++) this.#row(g, shape.inX, s, IN_WIDTH, SENSES[s][1], IN_COLOR, why.senses.includes(s), marked);
    for (let c = 0; c < COMMANDS.length; c++) this.#row(g, shape.outX, c, OUT_WIDTH, COMMANDS[c].label, OUT_COLOR, why.commands.includes(COMMAND_ORDER.indexOf(COMMANDS[c].key)), marked);

    // The timeline: the marked neurons' rates on their display scale, and the senses that rose, over the clip.
    const { line } = shape;
    const wellY = line.y + 12, wellH = line.h - 12;
    roundedRect(g, line.x, wellY, line.w, wellH, 6);
    g.fillStyle = "rgba(0, 16, 50, 0.5)";
    g.fill();
    const trace = (field: number, scale: number, color: string, width: number, dash: number[]) => {
      g.beginPath();
      for (let i = why.from; i < why.to; i++) {
        const v = Math.min(1, Math.max(0, clip.at(i, field) / scale));
        const x = this.#timeX(i), y = wellY + wellH - 3 - (wellH - 6) * v;
        if (i === why.from) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.strokeStyle = color;
      g.lineWidth = width;
      g.lineJoin = "round";
      g.setLineDash(dash);
      g.stroke();
      g.setLineDash([]);
    };
    for (const r of why.regions) trace(AT.regions + r, REGIONS[r].fullHz, IN_COLOR, 1, [1, 2]);
    for (const s of why.senses) trace(AT.senses + s, 1, IN_COLOR, 1.2, []);
    // The neurons' names, the one thing here the In and out bars don't say, each by a stroke of its trace.
    let legend = line.x;
    why.groups.forEach((gi, n) => {
      const dash = n === 0 ? [] : [3, 2];
      trace(AT.rates + gi, SOMA_GROUPS[gi].fullHz, OUT_COLOR, 1.6, dash);
      g.beginPath();
      g.moveTo(legend, line.y + 5);
      g.lineTo(legend + 12, line.y + 5);
      g.strokeStyle = OUT_COLOR;
      g.lineWidth = 1.6;
      g.setLineDash(dash);
      g.stroke();
      g.setLineDash([]);
      text(g, SOMA_GROUPS[gi].rate, legend + 16, line.y + 8, OUT_HEADING);
      legend += 16 + g.measureText(SOMA_GROUPS[gi].rate).width + 10;
    });
    if (why.onset >= 0) {
      const x = this.#timeX(why.onset);
      g.setLineDash([2, 2]);
      g.beginPath();
      g.moveTo(x, wellY + 2);
      g.lineTo(x, wellY + wellH - 2);
      g.strokeStyle = "rgba(255, 255, 255, 0.85)";
      g.lineWidth = 1;
      g.stroke();
      g.setLineDash([]);
    }
  }

  /** A row's name, and round a marked one a lit well; the rest dimmed when something is marked. */
  #row(g: CanvasRenderingContext2D, x: number, i: number, width: number, label: string, color: string, lit: boolean, marked: boolean) {
    const y = this.#layout.shape.top + SUB + i * ROW;
    if (lit) {
      roundedRect(g, x - 3, y, width + 6, ROW, 4);
      g.fillStyle = color === IN_COLOR ? "rgba(159, 255, 216, 0.22)" : "rgba(255, 213, 154, 0.25)";
      g.fill();
      g.strokeStyle = color;
      g.lineWidth = 1;
      g.stroke();
    }
    g.globalAlpha = marked && !lit ? 0.5 : 1;
    text(g, label, x, y + 8, SIGNAL_LABEL);
    g.globalAlpha = 1;
  }

  /** The card as it is at the playhead: the still parts, the bars, the rates, the marked somata and the playhead. */
  #draw() {
    this.#since = 0;
    this.#drawnAt = this.#at;
    const g = this.#begin(this.#canvas);
    const { panel, ppu, scale: k, shape } = this.#layout;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.#still, 0, 0, panel.width, panel.height);
    g.setTransform(ppu.x * k, 0, 0, ppu.y * k, 0, 0);
    const clip = this.#clip, why = this.#why;
    const marked = why.action !== null;
    if (clip.length > 0) {
      const i = Math.min(clip.length - 1, Math.round(this.#at));
      for (let s = 0; s < SENSES.length; s++) {
        g.globalAlpha = marked && !why.senses.includes(s) ? 0.5 : 1;
        bar(g, shape.inX + NAME.in, shape.top + SUB + s * ROW + 3, clip.at(i, AT.senses + s), IN_COLOR, false);
      }
      for (let c = 0; c < COMMANDS.length; c++) {
        const command = COMMANDS[c], order = COMMAND_ORDER.indexOf(command.key);
        g.globalAlpha = marked && !why.commands.includes(order) ? 0.5 : 1;
        const y = shape.top + SUB + c * ROW;
        bar(g, shape.outX + NAME.out, y + 3, clip.at(i, AT.commands + order), OUT_COLOR, command.key === "turn");
        const [a, b] = RATE_GROUPS[c];
        const hz = Math.round(clip.at(i, AT.rates + a));
        text(g, b === undefined ? String(hz) : `${hz}·${Math.round(clip.at(i, AT.rates + b))}`, shape.outX + OUT_WIDTH, y + 8, RATE);
      }
      g.globalAlpha = 1;
      // Rings round the marked neurons' somata, as bright as the group fired.
      for (const gi of why.groups) {
        const lit = glowTarget(clip.at(i, AT.rates + gi), SOMA_GROUPS[gi].fullHz);
        g.strokeStyle = OUT_COLOR;
        g.lineWidth = 1.4;
        g.globalAlpha = 0.35 + 0.65 * lit;
        for (const m of this.#markers[gi]) {
          g.beginPath();
          g.arc(m.x, m.y, 4 + 2 * lit, 0, Math.PI * 2);
          g.stroke();
        }
      }
      g.globalAlpha = 1;
    }
    // The playhead, and where it is from when the body acted, slowed.
    const { line } = shape;
    const x = this.#timeX(this.#at);
    g.beginPath();
    g.moveTo(x, line.y + 12);
    g.lineTo(x, line.y + line.h);
    g.strokeStyle = "#ffffff";
    g.lineWidth = 1.5;
    g.stroke();
    // In the timeline's well, at its top right: the legend has the line over it.
    text(g, `${fromOnset(this.at)}  ¼×`, line.x + line.w - 4, line.y + 21, RATE);
    this.#texture.needsUpdate = true;
  }
}
