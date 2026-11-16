// Inside its brain: the brain at work, live. What goes in (each sense, as
// the body feels it now), what comes out (each command, with the neurons it
// is read from and how fast they fire), and how busy the whole network is.
// Everything shown is read from the running brain; nothing is decoration.
//
// On a wide screen the senses and the commands are side by side, the trace
// of its activity beside the heading; on a narrow one they stack under the
// trace, and the page scrolls (a drag, the wheel, up and down).

import type { RemoteButton } from "@fly/contracts";
import { Scroller, glassPanel, iconButton, roundedRect, text } from "@fly/ui";
import type { HitMap } from "@fly/ui";
import { HISTORY_SAMPLES } from "../../brain/meter.ts";
import type { Frame } from "../../display.ts";
import { backButton, fitPane } from "../layout.ts";
import type { Rect } from "../layout.ts";
import { drawMenuHints } from "./menu-screen.ts";
import { SCREEN_HITS } from "./types.ts";
import type { Point, Screen, Shell } from "./types.ts";

const SENSES = [
  ["loomLeft", "Looming, left eye"],
  ["loomRight", "Looming, right eye"],
  ["touch", "Touch"],
  ["bumpLeft", "Left antenna"],
  ["bumpRight", "Right antenna"],
  ["wind", "Wind"],
  ["sweet", "Sweet taste"],
  ["grounded", "Weight on its legs"],
] as const;

const COMMANDS = [
  { key: "walk", label: "Walk", neurons: "DNg100", rates: ["DNg100"] },
  { key: "turn", label: "Steer", neurons: "DNa02 left · right", rates: ["DNa02 left", "DNa02 right"] },
  { key: "back", label: "Back up", neurons: "MDN, the moonwalkers", rates: ["MDN"] },
  { key: "escape", label: "Escape", neurons: "DNp01, the giant fibre", rates: ["DNp01"] },
  { key: "wings", label: "Wings", neurons: "Flight muscle motor neurons", rates: ["flight"] },
  { key: "groom", label: "Groom", neurons: "DNg12", rates: ["DNg12"] },
  { key: "feed", label: "Feed", neurons: "MN9, the proboscis", rates: ["MN9"] },
] as const;

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

const LIGHT = "#eaf6ff";
const SOFT = "rgba(220, 240, 255, 0.72)";

function bar(g: CanvasRenderingContext2D, x: number, y: number, w: number, value: number, colors: [string, string], signed = false) {
  const h = 9;
  roundedRect(g, x, y, w, h, h / 2);
  g.fillStyle = "rgba(0, 20, 60, 0.45)";
  g.fill();
  const v = Math.max(signed ? -1 : 0, Math.min(1, Number.isFinite(value) ? value : 0));
  if (Math.abs(v) < 0.005) return;
  const grad = g.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, colors[0]);
  grad.addColorStop(1, colors[1]);
  g.fillStyle = grad;
  if (signed) {
    const mid = x + w / 2;
    const len = (Math.abs(v) * w) / 2;
    roundedRect(g, v < 0 ? mid - len : mid, y, Math.max(h, len), h, h / 2);
  } else roundedRect(g, x, y, Math.max(h, w * v), h, h / 2);
  g.fill();
  roundedRect(g, x + 3, y + 1.5, Math.max(2, (signed ? (Math.abs(v) * w) / 2 : w * v) - 6), 3, 1.5);
  g.fillStyle = "rgba(255,255,255,0.45)";
  g.fill();
}

/** Where everything goes in the pane: the trace, each column's top and width, and how tall it all is. */
type BrainLayout = {
  pane: Rect;
  graph: Rect;
  feels: { x: number; y: number; w: number };
  does: { x: number; y: number; w: number };
  /** Each command's bar: in from its column's edge, and how long. */
  commandBar: { x: number; w: number };
  /** The bottom of the page, below the pane's top, and the page's window. */
  content: number;
  window: { top: number; bottom: number };
  wide: boolean;
};

/** Rows of senses and of commands, design units apart. */
const SENSE_ROW = 30;
const COMMAND_ROW = 34;

function brainLayout(frame: Frame): BrainLayout {
  const pane = fitPane(frame, 802, 420, 12);
  const { x, y, w, h } = pane;
  // The TV's: two columns under the heading, the trace beside it.
  const wide = w >= 600;
  if (wide) {
    const columns = y + 128;
    // To the foot of the senses' last row (the light on its eyes): on the TV, the pane's foot.
    const content = Math.max(columns + 14 + SENSE_ROW * (SENSES.length + 1), columns + 14 + COMMAND_ROW * COMMANDS.length) + 8;
    return {
      pane,
      graph: { x: x + 430, y: y + 22, w: w - 452, h: 70 },
      feels: { x: x + 30, y: columns, w: w / 2 - 40 },
      does: { x: x + w / 2 + 20, y: columns, w: w / 2 - 50 },
      commandBar: { x: 190, w: w / 2 - 250 },
      content,
      window: { top: y + 96, bottom: y + h },
      wide,
    };
  }
  const graph = { x: x + 20, y: y + 92, w: w - 40, h: 70 };
  const feels = graph.y + graph.h + 36;
  const does = feels + 14 + SENSE_ROW * (SENSES.length + 1) + 30;
  return {
    pane,
    graph,
    feels: { x: x + 20, y: feels, w: w - 40 },
    does: { x: x + 20, y: does, w: w - 40 },
    commandBar: { x: (w - 40) * 0.42, w: (w - 40) * 0.58 },
    content: does + 14 + COMMAND_ROW * COMMANDS.length + 40,
    window: { top: y + 84, bottom: y + h - 30 },
    wide,
  };
}

export class BrainScreen implements Screen {
  readonly id = "brain" as const;
  readonly pauses = false;
  readonly #shell: Shell;
  #since = 0;
  #layout: BrainLayout;
  #scroll = new Scroller(SENSE_ROW * 2);
  #from = -1;

  constructor(shell: Shell) {
    this.#shell = shell;
    this.#layout = brainLayout(shell.shape);
    this.#extent();
  }

  /** Whether a row from `top` to `bottom` on the page is wholly in its window, scrolled as it is: only those are drawn (the Apple TV's canvas has no clipping). */
  readonly #seen = (top: number, bottom: number) => {
    const off = this.#scroll.offset;
    const l = this.#layout;
    return this.#scroll.max <= 0 || (top - off >= l.window.top && bottom - off <= l.window.bottom);
  };

  enter() {
    this.#since = 1;
    this.#scroll.offset = 0;
  }

  layout(frame: Frame) {
    this.#layout = brainLayout(frame);
    this.#extent();
    this.#since = 1;
  }

  #extent() {
    const l = this.#layout;
    this.#scroll.setExtent(l.content - l.window.top, l.window.bottom - l.window.top);
  }

  press(button: RemoteButton, repeat: boolean) {
    if ((button === "up" || button === "down") && this.#scroll.max > 0) {
      if (this.#scroll.step(button === "up" ? -1 : 1)) this.#shell.sound("move");
      else if (!repeat) this.#shell.sound("blocked");
      this.#since = 1;
    } else if ((button === "back" || button === "select") && !repeat) {
      this.#shell.sound("back");
      this.#shell.back();
    }
  }

  point(p: Point) {
    const scroll = this.#scroll;
    if (p.type === "down") this.#from = scroll.offset;
    else if (p.type === "drag" && this.#from >= 0) scroll.offset = Math.max(0, Math.min(scroll.max, this.#from - p.dy));
    else if (p.type === "wheel") scroll.offset = Math.max(0, Math.min(scroll.max, scroll.offset + p.dy));
    else if (p.type === "up") {
      this.#from = -1;
      if (p.tap && (!p.hit || p.hit.kind === SCREEN_HITS.back)) {
        this.#shell.sound("back");
        this.#shell.back();
      }
    } else if (p.type === "cancel") this.#from = -1;
    this.#since = 1;
  }

  update(dt: number) {
    this.#since += dt;
    if (this.#since < 1 / 15) return false;
    this.#since = 0;
    return true;
  }

  draw(g: CanvasRenderingContext2D, t: number, hits: HitMap) {
    const shell = this.#shell;
    const brain = shell.brain;
    const meter = shell.meter;
    const L = this.#layout;
    const { x, y, w, h } = L.pane;
    // Scrolled up by this much.
    const off = this.#scroll.offset;
    const seen = this.#seen;
    hits.add(SCREEN_HITS.panel, x, y, w, h);
    glassPanel(g, x, y, w, h, 28, { tint: "night" });
    const titleX = shell.glyphs === null ? x + 64 : x + 30;
    text(g, "Inside its brain", titleX, y + 42, { size: 26, color: LIGHT });
    if (shell.glyphs === null) {
      const b = backButton(L.pane, y + 42);
      iconButton(g, b.x, b.y, b.r, "back");
      hits.add(SCREEN_HITS.back, b.x - 24, b.y - 24, 48, 48);
    }
    const running = brain.status === "running";
    if (running && !L.wide) {
      // Narrow: a line each.
      text(g, `${fmt(brain.neurons)} neurons`, titleX, y + 62, { size: 12, color: SOFT });
      text(g, `${fmt(brain.connections)} connections`, titleX, y + 76, { size: 12, color: SOFT });
    } else {
      const sub = running ? `${fmt(brain.neurons)} neurons · ${fmt(brain.connections)} connections` : brain.status === "failed" ? `It couldn't wake: ${brain.error ?? ""}` : "Waking up…";
      text(g, sub, titleX, y + 66, { size: L.wide ? 14 : 12, color: SOFT });
    }

    // The network's activity: a glowing trace of spikes per second.
    const { x: gx, w: gw, h: gh } = L.graph;
    // Beside the heading it stays put; under it, it scrolls with the page.
    const gy = L.graph.y - (L.wide ? 0 : off);
    if (L.wide || seen(L.graph.y, L.graph.y + gh)) {
      roundedRect(g, gx, gy, gw, gh, 14);
      g.fillStyle = "rgba(0, 16, 50, 0.5)";
      g.fill();
      let peak = 1;
      for (let i = 0; i < HISTORY_SAMPLES; i++) peak = Math.max(peak, meter.history[i]);
      peak *= 1.15;
      g.beginPath();
      g.moveTo(gx + 8, gy + gh - 6);
      for (let i = 0; i < HISTORY_SAMPLES; i++) {
        const v = meter.history[(meter.head + i) % HISTORY_SAMPLES];
        g.lineTo(gx + 8 + ((gw - 16) * i) / (HISTORY_SAMPLES - 1), gy + gh - 6 - (gh - 14) * (v / peak));
      }
      g.lineTo(gx + gw - 8, gy + gh - 6);
      g.closePath();
      const fill = g.createLinearGradient(0, gy, 0, gy + gh);
      fill.addColorStop(0, "rgba(120, 255, 200, 0.75)");
      fill.addColorStop(1, "rgba(40, 160, 255, 0.1)");
      g.fillStyle = fill;
      g.fill();
      text(g, `${fmt(meter.spikesPerSecond)} spikes a second`, gx + gw - 14, gy + 22, { size: 16, color: LIGHT, align: "right" });
      text(g, `${fmt(meter.active)} neurons active · ${meter.speed.toFixed(2)}× real time`, gx + gw - 14, gy + 42, { size: 12, color: SOFT, align: "right" });
    }

    // In: the senses, as sent this moment.
    const sensed = shell.life.sensed;
    const cx = L.feels.x;
    const labelW = Math.min(150, L.feels.w * 0.5);
    const barW = Math.min(150, L.feels.w - labelW);
    let cy = L.feels.y;
    if (seen(cy - 16, cy)) text(g, "What it feels", cx, cy - off, { size: 18, color: "#9fffd8" });
    cy += 14;
    for (const [key, label] of SENSES) {
      cy += SENSE_ROW;
      if (!seen(cy - 18, cy)) continue;
      const value = key === "grounded" ? (sensed.grounded ? 1 : 0) : sensed[key];
      text(g, label, cx, cy - 4 - off, { size: 13, color: LIGHT });
      bar(g, cx + labelW, cy - 13 - off, barW, value, ["#b8ffcf", "#2fbf6a"]);
    }
    if (sensed.light) {
      cy += SENSE_ROW;
      if (seen(cy - 18, cy)) text(g, `Light on ${fmt(sensed.light.left.length + sensed.light.right.length)} facets of its eyes`, cx, cy - 4 - off, { size: 13, color: LIGHT });
    }

    // Out: the commands, with the neurons each comes from.
    const command = brain.state?.command;
    const rates = brain.state?.stats.rates;
    const rx = L.does.x;
    const commandBar = L.commandBar;
    let ry = L.does.y;
    if (seen(ry - 16, ry)) text(g, "What it does", rx, ry - off, { size: 18, color: "#ffd59a" });
    ry += 14;
    for (const c of COMMANDS) {
      ry += COMMAND_ROW;
      if (!seen(ry - 22, ry + 10)) continue;
      const value = command ? command[c.key] : 0;
      text(g, c.label, rx, ry - 8 - off, { size: 14, color: LIGHT });
      const hz = rates ? c.rates.map((r) => `${(rates[r] ?? 0).toFixed(0)}`).join(" · ") : "–";
      text(g, `${c.neurons} · ${hz} Hz`, rx, ry + 8 - off, { size: 11, color: SOFT });
      bar(g, rx + commandBar.x, ry - 14 - off, commandBar.w, value, ["#ffe7a8", "#ff9a1f"], c.key === "turn");
    }
    // And what the body is doing with them.
    text(g, `Now: ${shell.life.activity}`, x + w - 30, y + h - 18, { size: 14, color: "#9fffd8", align: "right" });
    drawMenuHints(g, t, shell, "Back");
  }
}
