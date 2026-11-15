// Inside its brain: the brain at work, live. What goes in (each sense, as
// the body feels it now), what comes out (each command, with the neurons it
// is read from and how fast they fire), and how busy the whole network is.
// Everything shown is read from the running brain; nothing is decoration.

import type { RemoteButton } from "@fly/contracts";
import { glassPanel, roundedRect, text } from "@fly/ui";
import { HISTORY_SAMPLES } from "../../brain/meter.ts";
import { DESIGN_WIDTH } from "../../display.ts";
import { drawMenuHints } from "./menu-screen.ts";
import type { Screen, Shell } from "./types.ts";

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

export class BrainScreen implements Screen {
  readonly id = "brain" as const;
  readonly pauses = false;
  readonly #shell: Shell;
  #since = 0;

  constructor(shell: Shell) {
    this.#shell = shell;
  }

  enter() {
    this.#since = 1;
  }

  press(button: RemoteButton, repeat: boolean) {
    if ((button === "back" || button === "select") && !repeat) {
      this.#shell.sound("back");
      this.#shell.back();
    }
  }

  update(dt: number) {
    this.#since += dt;
    if (this.#since < 1 / 15) return false;
    this.#since = 0;
    return true;
  }

  draw(g: CanvasRenderingContext2D, t: number) {
    const shell = this.#shell;
    const brain = shell.brain;
    const meter = shell.meter;
    const x = 26;
    const y = 18;
    const w = DESIGN_WIDTH - 52;
    const h = 420;
    glassPanel(g, x, y, w, h, 28, { tint: "night" });
    text(g, "Inside its brain", x + 30, y + 42, { size: 26, color: LIGHT });
    const running = brain.status === "running";
    const sub = running
      ? `${fmt(brain.neurons)} neurons · ${fmt(brain.connections)} connections`
      : brain.status === "failed"
        ? `It couldn't wake: ${brain.error ?? ""}`
        : "Waking up…";
    text(g, sub, x + 30, y + 66, { size: 14, color: SOFT });

    // The network's activity: a glowing trace of spikes per second.
    const gx = x + 300;
    const gy = y + 26;
    const gw = w - 330;
    const gh = 70;
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

    // In: the senses, as sent this moment.
    const sensed = shell.life.sensed;
    const cx = x + 30;
    let cy = y + 128;
    text(g, "What it feels", cx, cy, { size: 18, color: "#9fffd8" });
    cy += 14;
    for (const [key, label] of SENSES) {
      cy += 30;
      const value = key === "grounded" ? (sensed.grounded ? 1 : 0) : sensed[key];
      text(g, label, cx, cy - 4, { size: 13, color: LIGHT });
      bar(g, cx + 150, cy - 13, 150, value, ["#b8ffcf", "#2fbf6a"]);
    }
    if (sensed.light) {
      cy += 30;
      text(g, `Light on ${fmt(sensed.light.left.length + sensed.light.right.length)} facets of its eyes`, cx, cy - 4, { size: 13, color: LIGHT });
    }

    // Out: the commands, with the neurons each comes from.
    const command = brain.state?.command;
    const rates = brain.state?.stats.rates;
    const rx = x + w / 2 + 20;
    let ry = y + 128;
    text(g, "What it does", rx, ry, { size: 18, color: "#ffd59a" });
    ry += 14;
    for (const c of COMMANDS) {
      ry += 34;
      const value = command ? command[c.key] : 0;
      text(g, c.label, rx, ry - 8, { size: 14, color: LIGHT });
      const hz = rates ? c.rates.map((r) => `${(rates[r] ?? 0).toFixed(0)}`).join(" · ") : "–";
      text(g, `${c.neurons} · ${hz} Hz`, rx, ry + 8, { size: 11, color: SOFT });
      bar(g, rx + 190, ry - 14, w / 2 - 250, c.key === "turn" ? value : value, ["#ffe7a8", "#ff9a1f"], c.key === "turn");
    }
    // And what the body is doing with them.
    text(g, `Now: ${shell.life.activity}`, x + w - 30, y + h - 18, { size: 14, color: "#9fffd8", align: "right" });
    drawMenuHints(g, t, "Back");
  }
}
