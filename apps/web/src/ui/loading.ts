// The loading screen while the brain wakes: the world is already there behind
// it, and the brain's size counts up as it arrives and is wired together.

import type { BrainDriver } from "@fly/contracts";
import { INK, INK_SOFT, glassPanel, roundedRect, text } from "@fly/ui";
import { DESIGN_HEIGHT, DESIGN_WIDTH } from "../display.ts";
import { drawWordmark } from "./wordmark.ts";

/** The connectome's size, known before it arrives (packages/brain/README.md). */
export const NEURONS = 166_700;
export const CONNECTIONS = 6_242_118;

const format = (n: number) => Math.round(n).toLocaleString("en-US");

export function drawLoading(g: CanvasRenderingContext2D, t: number, brain: BrainDriver) {
  const progress = "progress" in brain ? Number((brain as { progress: number }).progress) : 0;
  const phase = "phase" in brain ? String((brain as { phase: string }).phase) : brain.status === "running" ? "done" : "build";
  drawWordmark(g, DESIGN_WIDTH / 2, 150, 64, t);
  const w = 440;
  const h = 132;
  const x = (DESIGN_WIDTH - w) / 2;
  const y = DESIGN_HEIGHT - h - 56;
  glassPanel(g, x, y, w, h, 26);
  if (brain.status === "failed") {
    text(g, "The fly's brain didn't wake", DESIGN_WIDTH / 2, y + 44, { size: 22, align: "center", color: INK });
    text(g, brain.error ?? "", DESIGN_WIDTH / 2, y + 78, { size: 13, align: "center", color: INK_SOFT });
    return;
  }
  const shown = brain.status === "running" ? brain.neurons : NEURONS * (phase === "download" ? progress * 0.9 : 0.9 + 0.1 * (1 - Math.exp(-t)));
  text(g, brain.status === "running" ? "Awake!" : phase === "download" ? "Waking the fly's brain" : "Wiring up its neurons", DESIGN_WIDTH / 2, y + 36, { size: 19, align: "center", color: INK_SOFT });
  text(g, `${format(shown)} neurons`, DESIGN_WIDTH / 2, y + 76, { size: 34, align: "center", color: INK });
  // The progress bar: a glossy tube filling with green.
  const bx = x + 40;
  const by = y + 98;
  const bw = w - 80;
  roundedRect(g, bx, by, bw, 14, 7);
  g.fillStyle = "rgba(10, 60, 120, 0.25)";
  g.fill();
  const fill = brain.status === "running" ? 1 : phase === "download" ? progress * 0.9 : 0.9 + 0.1 * (1 - Math.exp(-t * 0.5));
  roundedRect(g, bx, by, Math.max(14, bw * fill), 14, 7);
  const grad = g.createLinearGradient(0, by, 0, by + 14);
  grad.addColorStop(0, "#c9ff9c");
  grad.addColorStop(0.5, "#5fd13a");
  grad.addColorStop(1, "#2f9d22");
  g.fillStyle = grad;
  g.fill();
  roundedRect(g, bx + 4, by + 2, Math.max(6, bw * fill - 8), 4, 2);
  g.fillStyle = "rgba(255,255,255,0.6)";
  g.fill();
}
