// What's on screen while playing: the shelf of tools, what each button does
// right now, and a caption saying what the fly is doing. The caption says
// only what the body is actually doing on the brain's commands.

import { INK, INK_SOFT, bubbleRing, glassPanel, hintChip, hintWidth, orb, pill, text } from "@fly/ui";
import type { Glyph } from "@fly/ui";
import { DESIGN_HEIGHT, DESIGN_WIDTH } from "../display.ts";
import type { Activity } from "../life.ts";
import { placeInfo } from "../places/catalog.ts";
import type { PlaceId } from "../places/catalog.ts";
import type { Learned } from "../settings.ts";
import { TOOLS, WORLD_TOOLS } from "../tools/hands.ts";
import type { Hands } from "../tools/hands.ts";
import { PICTURE_PANEL } from "../eyes/eyes.ts";
import { drawToolIcon } from "../tools/view.ts";

export type HudState = {
  hands: Hands;
  /** Where the fly is now, for the Place tool. */
  here: PlaceId;
  activity: Activity;
  /** What it is tasting or eating, if anything. */
  food: string | null;
  hints: boolean;
  /** What the hints have taught: those hints aren't shown. */
  learned: Learned;
  /** The player hasn't moved the pointer yet: show how. */
  teachSwipe: boolean;
  /** Seconds since the tool or its kind last changed, for the label's little pop. */
  changed: number;
  /** Spikes per second, for the brain's pulse. */
  spikes: number;
  brainRunning: boolean;
  /** Looking through the fly's eyes: how many facets, whether they're a stand-in, and whether they're off in Settings. */
  eyes: { facets: number; standIn: boolean; off: boolean } | null;
};

/** How far apart the tools are on the shelf. */
const PITCH = 52;
/** The tools that act on the fly, then, farther apart by APART, those about its world and the camera: two shelves to the eye, one row to the remote. */
const SPLIT = WORLD_TOOLS > 0 ? WORLD_TOOLS : TOOLS.length;
const APART = SPLIT < TOOLS.length ? 32 : 0;
/** The shelf's glass, both halves, in design units. */
export const SHELF = { x: DESIGN_WIDTH / 2 - (TOOLS.length * PITCH + APART) / 2 - 8, y: DESIGN_HEIGHT - 60, width: TOOLS.length * PITCH + APART + 16, height: 52 };

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

/** What the touch surface does while the hand waits by the fly. */
const SWIPE = "Move your hand";

export function caption(activity: Activity, food: string | null) {
  if ((activity === "feeding" || activity === "tasting") && food) return `${CAPTIONS[activity]} ${food.toLowerCase()}`;
  return CAPTIONS[activity];
}

/** What Select does with the current tool, in a few words. */
export function actionLabel(hands: Hands, here: PlaceId): { glyph: Glyph; label: string } | null {
  const tool = hands.current;
  const variant = hands.label.toLowerCase();
  switch (tool.id) {
    case "feed":
      return { glyph: "select", label: `Drop ${variant}` };
    case "swoop":
      return { glyph: "select", label: "Throw the ball" };
    case "feather":
      return { glyph: "hold", label: "Hold to tickle" };
    case "blow":
      return { glyph: "hold", label: `Hold to blow ${hands.variant.id === "strong" ? "hard" : "gently"}` };
    case "place":
      return hands.place === here ? null : { glyph: "select", label: `Go to ${placeInfo(hands.place).to}` };
    default:
      return null;
  }
}

export function drawHud(g: CanvasRenderingContext2D, t: number, s: HudState) {
  const { hands } = s;
  // The shelf.
  const n = TOOLS.length;
  const cx = DESIGN_WIDTH / 2;
  const sy = SHELF.y + SHELF.height / 2;
  glassPanel(g, SHELF.x, SHELF.y, SPLIT * PITCH + 16, SHELF.height, 26, { alpha: 0.75, shadow: false });
  if (APART) glassPanel(g, SHELF.x + SPLIT * PITCH + APART, SHELF.y, (n - SPLIT) * PITCH + 16, SHELF.height, 26, { alpha: 0.75, shadow: false });
  for (let i = 0; i < n; i++) {
    const x = SHELF.x + 8 + (i + 0.5) * PITCH + (i < SPLIT ? 0 : APART);
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
  const label = many ? `${tool.name} · ${hands.label}` : tool.name;
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
    // Up and down need no hint: the arrows on the tool's name say it. The shelf's and each tool's go once they've been used.
    const hy = DESIGN_HEIGHT - 34;
    if (!s.learned.tools) hintChip(g, 16, hy, "leftRight", "Tools", t, 13);
    const action = s.learned[tool.id] ? null : actionLabel(hands, s.here);
    if (action) hintChip(g, 16, s.learned.tools ? hy : hy - 34, action.glyph, action.label, t, 13);
    if (s.teachSwipe || hands.following) hintChip(g, DESIGN_WIDTH - 16 - hintWidth(g, SWIPE, 13), hy, "swipe", SWIPE, t, 13);
    hintChip(g, 16, 24, "playPause", "Menu", t, 12);
  }

  if (s.eyes) {
    // The picture of what its eyes take in is drawn under this layer, in its panel; label it for what it is, inside the panel.
    const top = ((1 - PICTURE_PANEL.top) / 2) * DESIGN_HEIGHT;
    const bottom = ((1 - PICTURE_PANEL.bottom) / 2) * DESIGN_HEIGHT;
    text(g, "Through the fly's eyes", cx, top + 22, { size: 18, align: "center", color: "#eaf6ff" });
    // The heading is the truth when its brain is sent this; only when it isn't does the picture need a word more.
    if (s.eyes.standIn || s.eyes.off) {
      const facets = s.eyes.facets.toLocaleString("en-US");
      const sub = s.eyes.standIn
        ? `A picture of the light on ${facets} facets, laid out as its eyes look. Its brain doesn't see this yet.`
        : `The light on each of its ${facets} facets. Its eyes are off in Settings, so its brain isn't sent this.`;
      text(g, sub, cx, top + 42, { size: 12, align: "center", color: "#cfe8ff" });
    }
    text(g, "left eye", cx - 190, bottom - 12, { size: 12, align: "center", color: "#9fdcff" });
    text(g, "ahead", cx, bottom - 12, { size: 12, align: "center", color: "#9fdcff" });
    text(g, "right eye", cx + 190, bottom - 12, { size: 12, align: "center", color: "#9fdcff" });
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
