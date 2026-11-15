// What's on screen while playing: the shelf of tools, what each button does
// right now, and a caption saying what the fly is doing. The caption says
// only what the body is actually doing on the brain's commands.

import { INK, INK_SOFT, bubbleRing, glassPanel, hintChip, hintWidth, orb, pill, text } from "@fly/ui";
import type { Glyph } from "@fly/ui";
import { DESIGN_HEIGHT, DESIGN_WIDTH } from "../display.ts";
import type { Activity } from "../life.ts";
import { TOOLS } from "../tools/hands.ts";
import type { Hands } from "../tools/hands.ts";
import { PICTURE_PANEL } from "../eyes/eyes.ts";
import { drawToolIcon } from "../tools/view.ts";

export type HudState = {
  hands: Hands;
  activity: Activity;
  /** What it is tasting or eating, if anything. */
  food: string | null;
  hints: boolean;
  /** The player hasn't moved the pointer yet: show how. */
  teachSwipe: boolean;
  /** Seconds since the tool or its kind last changed, for the label's little pop. */
  changed: number;
  /** Spikes per second, for the brain's pulse. */
  spikes: number;
  brainRunning: boolean;
  /** Looking through the fly's eyes: how many facets, whether they're a stand-in, and what they cost. */
  eyes: { facets: number; standIn: boolean; ms: number; calls: number } | null;
};

const CAPTIONS: Record<Activity, string> = {
  resting: "Resting",
  walking: "Walking",
  backing: "Backing away",
  turning: "Turning",
  grooming: "Grooming",
  feeding: "Eating",
  tasting: "Tasting",
  flying: "Flying",
  falling: "Falling",
  waiting: "Waiting for its brain",
};

export function caption(activity: Activity, food: string | null) {
  if ((activity === "feeding" || activity === "tasting") && food) return `${CAPTIONS[activity]} ${food.toLowerCase()}`;
  return CAPTIONS[activity];
}

/** What Select does with the current tool, in a few words. */
export function actionLabel(hands: Hands): { glyph: Glyph; label: string } | null {
  const tool = hands.current;
  const variant = hands.variant.label.toLowerCase();
  switch (tool.id) {
    case "feed":
      return { glyph: "select", label: `Drop ${variant}` };
    case "swoop":
      return { glyph: "select", label: "Throw the ball" };
    case "feather":
      return { glyph: "hold", label: "Hold to tickle" };
    case "blow":
      return { glyph: "hold", label: `Hold to blow ${hands.variant.id === "strong" ? "hard" : "gently"}` };
    default:
      return null;
  }
}

export function drawHud(g: CanvasRenderingContext2D, t: number, s: HudState) {
  const { hands } = s;
  // The shelf.
  const n = TOOLS.length;
  const gap = 58;
  const cx = DESIGN_WIDTH / 2;
  const sy = DESIGN_HEIGHT - 34;
  glassPanel(g, cx - (gap * n) / 2 - 8, sy - 26, gap * n + 16, 52, 26, { alpha: 0.75, shadow: false });
  for (let i = 0; i < n; i++) {
    const x = cx + (i - (n - 1) / 2) * gap;
    const on = i === hands.tool;
    const r = on ? 22 : 17;
    const y = on ? sy - 6 : sy;
    orb(g, x, y, r, on ? "aqua" : "glass");
    drawToolIcon(g, TOOLS[i].id, x, y + 1, r * 0.62);
    if (on) bubbleRing(g, x - r, y - r, r * 2, r * 2, r, t);
  }
  // The tool's name and kind, over the shelf.
  const tool = hands.current;
  const many = tool.variants.length > 1;
  const label = many ? `${tool.name} · ${hands.variant.label}` : tool.name;
  g.font = `700 17px sans-serif`;
  const lw = Math.max(150, hintWidth(g, label, 17) + (many ? 40 : 0));
  const pop = Math.max(0, 1 - s.changed * 4) * 3;
  pill(g, cx - lw / 2, sy - 78 - pop, lw, 32, "", { color: "glass" });
  text(g, label, cx, sy - 61 - pop, { size: 17, align: "center", baseline: "middle", color: INK });
  if (many) {
    // Up and down change it.
    text(g, "▲", cx - lw / 2 + 18, sy - 66 - pop, { size: 9, align: "center", color: INK_SOFT });
    text(g, "▼", cx - lw / 2 + 18, sy - 55 - pop, { size: 9, align: "center", color: INK_SOFT });
  }

  if (s.hints) {
    const hy = DESIGN_HEIGHT - 34;
    hintChip(g, 16, hy, "leftRight", "Tools", t, 13);
    if (many) hintChip(g, 16, hy - 34, "upDown", tool.id === "light" ? "Time of day" : tool.id === "view" ? "Camera" : "Kind", t, 13);
    const action = actionLabel(hands);
    if (action) hintChip(g, 16, many ? hy - 68 : hy - 34, action.glyph, action.label, t, 13);
    const right = DESIGN_WIDTH - 16;
    if (s.teachSwipe || hands.following) {
      const label = s.teachSwipe ? "Swipe to move your hand" : "Swipe to aim";
      hintChip(g, right - hintWidth(g, label, 13), hy, "swipe", label, t, 13);
    }
    hintChip(g, 16, 24, "playPause", "Menu", t, 12);
  }

  if (s.eyes) {
    // The picture of what its eyes take in is drawn under this layer, in its panel; label it for what it is, inside the panel.
    const top = ((1 - PICTURE_PANEL.top) / 2) * DESIGN_HEIGHT;
    const bottom = ((1 - PICTURE_PANEL.bottom) / 2) * DESIGN_HEIGHT;
    const right = ((PICTURE_PANEL.right + 1) / 2) * DESIGN_WIDTH;
    text(g, "Through the fly's eyes", cx, top + 22, { size: 18, align: "center", color: "#eaf6ff" });
    const sub = s.eyes.standIn
      ? `A picture of the light on ${s.eyes.facets.toLocaleString("en-US")} facets, laid out as its eyes look. Its brain doesn't see this yet.`
      : `The light on each of its ${s.eyes.facets.toLocaleString("en-US")} facets, as its brain receives it now.`;
    text(g, sub, cx, top + 42, { size: 12, align: "center", color: "#cfe8ff" });
    text(g, "left eye", cx - 190, bottom - 12, { size: 12, align: "center", color: "#9fdcff" });
    text(g, "ahead", cx, bottom - 12, { size: 12, align: "center", color: "#9fdcff" });
    text(g, "right eye", cx + 190, bottom - 12, { size: 12, align: "center", color: "#9fdcff" });
    text(g, `${s.eyes.calls} draws · ${s.eyes.ms.toFixed(1)} ms a refresh`, right - 10, top + 16, { size: 10, align: "right", color: "#7fa8cc" });
  }

  // What the fly is doing, from its brain, at the top.
  const words = caption(s.activity, s.food);
  g.font = `700 16px sans-serif`;
  const cw = hintWidth(g, words, 16) + 4;
  glassPanel(g, cx - cw / 2, 10, cw, 30, 15, { alpha: 0.8, shadow: false });
  // The brain's pulse: quicker the more it fires.
  const beat = s.brainRunning ? 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * Math.min(4, 0.5 + s.spikes / 30000)) : 0;
  orb(g, cx - cw / 2 + 17, 25, 6 + beat * 1.5, s.brainRunning ? "pink" : "glass");
  text(g, words, cx + 8, 26, { size: 16, align: "center", baseline: "middle", color: INK });
}
