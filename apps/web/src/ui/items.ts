// A small picture for each thing in the tray, so the rings read at a glance
// with few words: the foods as they lie, the kit's pieces seen from above,
// the views as how much of the picture the fly fills, the sky as the sun's
// height and the weather as what falls. A ring's own picture is its tool's
// (tools/view.ts).

import { roundedRect } from "@fly/ui";
import { drawToolIcon } from "../tools/view.ts";
import type { ToolIcon } from "../tools/view.ts";

/** Rings and things in the tray drawn with a tool's own picture. */
const AS_TOOL: Record<string, ToolIcon> = {
  hand: "hand",
  food: "feed",
  build: "build",
  toys: "swoop",
  finger: "finger",
  photo: "photo",
  look: "view",
  world: "sky",
  time: "light",
  weather: "weather",
  place: "place",
  feather: "feather",
  ball: "swoop",
  gentle: "blow",
  feed: "feed",
  swoop: "swoop",
  blow: "blow",
  sky: "sky",
  view: "view",
};

const PIECE_COLOURS: Record<string, [string, string]> = {
  "dish-blue": ["#3d8ef0", "#1d4f8a"],
  "dish-yellow": ["#f5c01a", "#a36a00"],
  "tile-blue": ["#3d8ef0", "#1d4f8a"],
  "tile-yellow": ["#f5c01a", "#a36a00"],
  "tile-red": ["#e8473a", "#8a1d14"],
};

const SUN_HEIGHT: Record<string, number> = { clock: 0.1, morning: 0.25, noon: -0.45, golden: 0.3, dusk: 0.55 };
const SUN_COLOUR: Record<string, string> = { clock: "#ffcf2e", morning: "#ffd86a", noon: "#ffe23a", golden: "#ffa52e", dusk: "#ff7a4a" };

/** Draws the picture for a thing in the tray (by its id) at (x, y), about `r` in radius. */
export function drawItemIcon(g: CanvasRenderingContext2D, id: string, x: number, y: number, r: number) {
  const tool = AS_TOOL[id];
  if (tool) {
    drawToolIcon(g, tool, x, y, r);
    return;
  }
  g.save();
  g.translate(x, y);
  g.lineCap = "round";
  g.lineJoin = "round";
  g.lineWidth = r * 0.08;
  switch (id) {
    case "sugar":
    case "laced":
      cube(g, r, "#ffffff", id === "laced" ? "#8a5328" : "#2a6fb0", id === "laced");
      break;
    case "honey":
      drop(g, r, "#ffb11c", "#a36a00");
      break;
    case "water":
      drop(g, r, "#bfe9ff", "#2a8fe0");
      break;
    case "coffee":
      drop(g, r, "#3a1c0a", "#1a0a02");
      break;
    case "berry":
      for (const [bx, by] of [[-0.3, 0.15], [0.3, 0.15], [0, -0.25], [0, 0.45]]) {
        g.fillStyle = "#e0144e";
        g.strokeStyle = "#8a0a2a";
        g.beginPath();
        g.arc(bx * r, by * r, r * 0.34, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
      g.fillStyle = "#4caf50";
      g.beginPath();
      g.ellipse(0, -r * 0.62, r * 0.3, r * 0.12, 0, 0, Math.PI * 2);
      g.fill();
      break;
    case "dish-blue":
    case "dish-yellow": {
      const [fill, edge] = PIECE_COLOURS[id];
      g.fillStyle = fill;
      g.strokeStyle = edge;
      g.beginPath();
      g.arc(0, 0, r * 0.8, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = "rgba(255,255,255,0.55)";
      g.beginPath();
      g.arc(0, 0, r * 0.48, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case "tile-blue":
    case "tile-yellow":
    case "tile-red": {
      const [fill, edge] = PIECE_COLOURS[id];
      g.fillStyle = fill;
      g.strokeStyle = edge;
      roundedRect(g, -r * 0.65, -r * 0.65, r * 1.3, r * 1.3, r * 0.12);
      g.fill();
      g.stroke();
      break;
    }
    case "crumb":
      g.fillStyle = "#d9a35e";
      g.strokeStyle = "#8a5a28";
      g.beginPath();
      g.ellipse(0, r * 0.1, r * 0.7, r * 0.52, -0.3, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      break;
    case "twig":
      g.strokeStyle = "#7a4e26";
      g.lineWidth = r * 0.22;
      g.beginPath();
      g.moveTo(-r * 0.85, r * 0.45);
      g.lineTo(r * 0.85, -r * 0.45);
      g.moveTo(r * 0.1, -r * 0.05);
      g.lineTo(r * 0.35, r * 0.35);
      g.stroke();
      break;
    case "leaf":
      g.fillStyle = "#58b84a";
      g.strokeStyle = "#2a6a20";
      g.beginPath();
      g.ellipse(0, 0, r * 0.85, r * 0.42, -0.5, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.beginPath();
      g.moveTo(-r * 0.7, r * 0.38);
      g.lineTo(r * 0.7, -r * 0.38);
      g.stroke();
      break;
    case "ramp":
      g.fillStyle = "#e2c18e";
      g.strokeStyle = "#8a6640";
      g.beginPath();
      g.moveTo(-r * 0.85, r * 0.5);
      g.lineTo(r * 0.85, r * 0.5);
      g.lineTo(r * 0.85, -r * 0.45);
      g.closePath();
      g.fill();
      g.stroke();
      break;
    case "wall":
      g.fillStyle = "#c99a62";
      g.strokeStyle = "#7a5530";
      g.beginPath();
      g.rect(-r * 0.85, -r * 0.3, r * 1.7, r * 0.6);
      g.fill();
      g.stroke();
      break;
    case "strong":
      drawToolIcon(g, "blow", -r * 0.15, 0, r * 0.85);
      drawToolIcon(g, "blow", r * 0.2, 0, r * 0.85);
      break;
    case "close":
    case "follow":
    case "wide":
    case "table":
    case "above":
      framed(g, r, id);
      break;
    case "eyes":
      for (const side of [-1, 1]) {
        g.fillStyle = "#c8243a";
        g.strokeStyle = "#6a0a1a";
        g.beginPath();
        g.ellipse(side * r * 0.4, 0, r * 0.36, r * 0.55, side * 0.25, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
      break;
    case "inside":
      g.strokeStyle = "#9fe0ff";
      g.fillStyle = "rgba(159,224,255,0.35)";
      g.beginPath();
      g.ellipse(0, 0, r * 0.75, r * 0.42, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      for (const [px, py] of [[-0.3, 0], [0.05, -0.1], [0.35, 0.05]]) {
        g.fillStyle = "#ff8ad8";
        g.beginPath();
        g.arc(px * r, py * r, r * 0.12, 0, Math.PI * 2);
        g.fill();
      }
      break;
    case "why":
      g.fillStyle = "#3a4a6a";
      g.font = `bold ${Math.round(r * 1.5)}px sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("?", 0, r * 0.08);
      break;
    case "clock":
    case "morning":
    case "noon":
    case "golden":
    case "dusk":
      sun(g, r, SUN_HEIGHT[id], SUN_COLOUR[id], id === "clock");
      break;
    case "night":
      g.fillStyle = "#f4f0c8";
      g.strokeStyle = "#8a8450";
      g.beginPath();
      g.arc(0, 0, r * 0.6, Math.PI * 0.35, Math.PI * 1.65);
      g.arc(r * 0.28, -r * 0.05, r * 0.48, Math.PI * 1.45, Math.PI * 0.55, true);
      g.fill();
      g.stroke();
      break;
    case "now":
    case "clear":
    case "overcast":
    case "mist":
    case "rain":
    case "heavyRain":
    case "storm":
    case "snow":
    case "sleet":
      weather(g, r, id);
      break;
    case "clearFood":
    case "clearBuilt":
      drawToolIcon(g, id === "clearFood" ? "feed" : "build", 0, 0, r * 0.8);
      g.strokeStyle = "#d8283a";
      g.lineWidth = r * 0.16;
      g.beginPath();
      g.moveTo(-r * 0.75, -r * 0.75);
      g.lineTo(r * 0.75, r * 0.75);
      g.stroke();
      break;
    case "rotate":
      g.strokeStyle = "#2a6fb0";
      g.lineWidth = r * 0.16;
      g.beginPath();
      g.arc(0, 0, r * 0.55, -Math.PI * 0.4, Math.PI * 1.3);
      g.stroke();
      g.fillStyle = "#2a6fb0";
      g.beginPath();
      g.moveTo(r * 0.55 * Math.cos(-Math.PI * 0.4) + r * 0.25, r * 0.55 * Math.sin(-Math.PI * 0.4));
      g.lineTo(r * 0.55 * Math.cos(-Math.PI * 0.4) - r * 0.2, r * 0.55 * Math.sin(-Math.PI * 0.4) - r * 0.25);
      g.lineTo(r * 0.55 * Math.cos(-Math.PI * 0.4) - r * 0.15, r * 0.55 * Math.sin(-Math.PI * 0.4) + r * 0.25);
      g.closePath();
      g.fill();
      break;
    case "back":
      g.strokeStyle = "#2a4a70";
      g.lineWidth = r * 0.18;
      g.beginPath();
      g.moveTo(r * 0.3, -r * 0.55);
      g.lineTo(-r * 0.25, 0);
      g.lineTo(r * 0.3, r * 0.55);
      g.stroke();
      break;
    default:
      // A place: its pin.
      drawToolIcon(g, "place", 0, 0, r);
  }
  g.restore();
}

function cube(g: CanvasRenderingContext2D, r: number, fill: string, edge: string, soaked: boolean) {
  g.fillStyle = fill;
  g.strokeStyle = edge;
  g.beginPath();
  g.rect(-r * 0.55, -r * 0.55, r * 1.1, r * 1.1);
  g.fill();
  if (soaked) {
    g.fillStyle = "#b07a48";
    g.fillRect(-r * 0.55, r * 0.1, r * 1.1, r * 0.45);
  }
  g.stroke();
}

function drop(g: CanvasRenderingContext2D, r: number, fill: string, edge: string) {
  g.fillStyle = fill;
  g.strokeStyle = edge;
  g.beginPath();
  g.moveTo(0, -r * 0.8);
  g.quadraticCurveTo(r * 0.75, r * 0.1, 0, r * 0.7);
  g.quadraticCurveTo(-r * 0.75, r * 0.1, 0, -r * 0.8);
  g.fill();
  g.stroke();
}

/** A view: the picture's frame, and the fly in it as big as that view shows it (from above, seen from overhead). */
function framed(g: CanvasRenderingContext2D, r: number, view: string) {
  g.strokeStyle = "#3a4a6a";
  roundedRect(g, -r * 0.8, -r * 0.6, r * 1.6, r * 1.2, r * 0.12);
  g.stroke();
  const size = { close: 0.5, follow: 0.32, wide: 0.18, table: 0.08, above: 0.3 }[view] ?? 0.3;
  g.fillStyle = "#8a5a28";
  g.beginPath();
  if (view === "above") g.ellipse(0, 0, size * r * 0.5, size * r, 0, 0, Math.PI * 2);
  else g.ellipse(0, r * 0.1, size * r, size * r * 0.55, 0, 0, Math.PI * 2);
  g.fill();
  if (view === "table") {
    g.beginPath();
    g.moveTo(-r * 0.7, r * 0.3);
    g.lineTo(r * 0.7, r * 0.3);
    g.stroke();
  }
}

function sun(g: CanvasRenderingContext2D, r: number, height: number, colour: string, clock: boolean) {
  g.strokeStyle = "#5a7ea8";
  g.beginPath();
  g.moveTo(-r * 0.85, r * 0.45);
  g.lineTo(r * 0.85, r * 0.45);
  g.stroke();
  g.save();
  g.beginPath();
  g.rect(-r, -r, r * 2, r * 1.45);
  g.clip();
  g.fillStyle = colour;
  g.strokeStyle = "#e88a00";
  g.beginPath();
  g.arc(0, height * r, r * 0.38, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.restore();
  if (clock) {
    // Now: by the clock, its hands on the sun.
    g.strokeStyle = "#7a4a00";
    g.beginPath();
    g.moveTo(0, height * r - r * 0.25);
    g.lineTo(0, height * r);
    g.lineTo(r * 0.18, height * r);
    g.stroke();
  }
}

function weather(g: CanvasRenderingContext2D, r: number, kind: string) {
  if (kind === "now" || kind === "clear") {
    sun(g, r, -0.1, "#ffcf2e", kind === "now");
    return;
  }
  const dark = kind === "storm" || kind === "heavyRain";
  g.fillStyle = kind === "mist" ? "rgba(220,230,240,0.9)" : dark ? "#9aa8b8" : "#ffffff";
  g.strokeStyle = "#5a7ea8";
  g.beginPath();
  g.moveTo(-r * 0.7, r * 0.15);
  g.arc(-r * 0.45, -r * 0.05, r * 0.26, Math.PI * 0.6, Math.PI * 1.45);
  g.arc(-r * 0.05, -r * 0.25, r * 0.36, Math.PI * 1.1, Math.PI * 1.9);
  g.arc(r * 0.45, -r * 0.05, r * 0.28, Math.PI * 1.45, Math.PI * 0.45);
  g.closePath();
  g.fill();
  g.stroke();
  const falls = (colour: string, n: number, len: number) => {
    g.strokeStyle = colour;
    g.lineWidth = r * 0.1;
    for (let i = 0; i < n; i++) {
      const fx = (i - (n - 1) / 2) * r * 0.3;
      g.beginPath();
      g.moveTo(fx + r * 0.05, r * 0.35);
      g.lineTo(fx - r * 0.05, r * (0.35 + len));
      g.stroke();
    }
  };
  if (kind === "mist") {
    g.strokeStyle = "#9ab0c8";
    g.lineWidth = r * 0.1;
    for (const my of [0.42, 0.62]) {
      g.beginPath();
      g.moveTo(-r * 0.7, r * my);
      g.lineTo(r * 0.7, r * my);
      g.stroke();
    }
  } else if (kind === "rain") falls("#2a8fe0", 3, 0.3);
  else if (kind === "heavyRain") falls("#1a6fc0", 4, 0.45);
  else if (kind === "storm") {
    g.fillStyle = "#ffd22e";
    g.strokeStyle = "#a37a00";
    g.beginPath();
    g.moveTo(r * 0.05, r * 0.25);
    g.lineTo(-r * 0.2, r * 0.6);
    g.lineTo(0, r * 0.6);
    g.lineTo(-r * 0.12, r * 0.92);
    g.lineTo(r * 0.25, r * 0.48);
    g.lineTo(r * 0.05, r * 0.48);
    g.closePath();
    g.fill();
    g.stroke();
  } else if (kind === "snow" || kind === "sleet") {
    g.fillStyle = kind === "snow" ? "#ffffff" : "#bfe9ff";
    g.strokeStyle = "#5a7ea8";
    for (const [sx, sy] of [[-0.35, 0.5], [0.05, 0.7], [0.4, 0.5]]) {
      g.beginPath();
      g.arc(sx * r, sy * r, r * 0.1, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    if (kind === "sleet") falls("#2a8fe0", 2, 0.25);
  }
}
