// What's on screen while playing: the shelf of tools, what each button does
// right now, and a caption saying what the fly is doing. The caption says
// only what the body is actually doing on the brain's commands.
//
// With a remote, a keyboard or a pad in hand, hint chips say what each button
// does. Pointing at the screen, there are none: the shelf, the tool's label
// and a button for the menu are what you press, and the table is where you
// point. Every target is recorded as it is drawn (`hits`), so a tap lands on
// what is on screen wherever the layout put it.

import { INK, INK_SOFT, bubbleRing, chevron, font, glassPanel, hintChip, hintWidth, iconButton, orb, pill, text, wrap } from "@fly/ui";
import type { Glyph, GlyphSet, HitMap } from "@fly/ui";
import type { Activity } from "../life.ts";
import { placeInfo } from "../places/catalog.ts";
import type { PlaceId } from "../places/catalog.ts";
import type { Learned } from "../settings.ts";
import { TOOLS } from "../tools/hands.ts";
import type { Hands } from "../tools/hands.ts";
import { drawToolIcon } from "../tools/view.ts";
import type { HudLayout } from "./layout.ts";

export type HudState = {
  hands: Hands;
  /** Where the fly is now, for the Place tool. */
  here: PlaceId;
  activity: Activity;
  /** What it is tasting or eating, if anything. */
  food: string | null;
  hints: boolean;
  previewTool?: number;
  /** Whose buttons the hints show, or null when the player is pointing at the screen (no hints, and buttons to press instead). */
  glyphs: GlyphSet | null;
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
  layout: HudLayout;
};

/** What the HUD's targets are, as recorded in the hit map. */
export const HUD_HITS = { tool: "tool", kind: "kind", label: "label", go: "go", menu: "menu" } as const;

const CAPTIONS: Record<Activity, string> = {
  resting: "Resting",
  sleeping: "Asleep",
  walking: "Walking",
  backing: "Backing away",
  turning: "Turning",
  grooming: "Grooming",
  feeding: "Eating",
  tasting: "Tasting",
  singing: "Singing",
  flying: "Flying",
  falling: "Falling",
  waiting: "Waiting for its brain",
};

/** What the touch surface (or a pad's stick) does while the hand waits by the fly. */
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
      return hands.variant.id === "clear" ? null : { glyph: "select", label: `Drop ${variant}` };
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

export function drawHud(g: CanvasRenderingContext2D, t: number, s: HudState, hits: HitMap) {
  const { hands } = s;
  const L = s.layout;
  const pointing = s.glyphs === null;
  // The shelf.
  const n = TOOLS.length;
  const gap = L.gap;
  const cx = L.cx;
  const sy = L.shelfY;
  // The tools that act on the fly, then, a little apart, those about its world and the camera: two shelves to the eye, one row to the remote.
  const split = L.split;
  glassPanel(g, L.shelfLeft - 8, sy - 26, split * gap + 16, 52, 26, { alpha: 0.75, shadow: false });
  if (split < n) glassPanel(g, L.shelfLeft - 8 + split * gap + L.apart, sy - 26, (n - split) * gap + 16, 52, 26, { alpha: 0.75, shadow: false });
  for (let i = 0; i < n; i++) {
    const x = L.shelfLeft + (i + 0.5) * gap + (i < split ? 0 : L.apart);
    const on = i === hands.tool;
    const r = on ? 22 * L.orb : Math.min(17, gap / 2 - 1);
    const y = on ? sy - 6 : sy;
    orb(g, x, y, r, on ? "aqua" : "glass");
    drawToolIcon(g, TOOLS[i].id, x, y + 1, r * 0.62);
    if (on) bubbleRing(g, x - r, y - r, r * 2, r * 2, r, t);
    hits.add(HUD_HITS.tool, x - gap / 2, sy - 26, gap, 52, i);
  }
  // The tool's name and kind, over the shelf. Pointing, arrows either side change the kind, and a place to go has its own button.
  const preview = pointing && s.previewTool !== undefined && s.previewTool !== hands.tool ? TOOLS[s.previewTool] : undefined;
  const tool = preview ?? hands.current;
  const many = !preview && tool.variants.length > 1;
  const go = !preview && pointing && tool.id === "place" && hands.place !== s.here;
  const goWidth = 64;
  const room = L.width - 16 - (go ? goWidth + 8 : 0);
  const arrows = many ? (pointing ? 56 : 40) : 0;
  let label = many ? `${tool.name} · ${hands.label}` : tool.name;
  let lw = Math.max(150, hintWidth(g, label, 17) + arrows);
  // Where there isn't room for the tool's name, its kind says enough: the shelf shows which tool it is.
  if (many && lw > room) {
    label = hands.label;
    lw = Math.max(150, hintWidth(g, label, 17) + arrows);
  }
  const lx = cx - lw / 2 - (go ? (goWidth + 8) / 2 : 0);
  const pop = preview ? 0 : Math.max(0, 1 - s.changed * 4) * 3;
  const ly = L.labelY - 18 - pop;
  pill(g, lx, ly, lw, 36, "", { color: "glass" });
  text(g, label, lx + lw / 2, L.labelY - pop, { size: 17, align: "center", baseline: "middle", color: INK });
  if (many && pointing) {
    chevron(g, lx + 18, L.labelY - pop, -1, true);
    chevron(g, lx + lw - 18, L.labelY - pop, 1, true);
    hits.add(HUD_HITS.kind, lx, ly, 44, 36, 0, -1);
    hits.add(HUD_HITS.label, lx + 44, ly, lw - 88, 36, 0, 1);
    hits.add(HUD_HITS.kind, lx + lw - 44, ly, 44, 36, 0, 1);
  } else if (many) {
    // Up and down change it.
    text(g, "▲", lx + 18, L.labelY - 5 - pop, { size: 9, align: "center", color: INK_SOFT });
    text(g, "▼", lx + 18, L.labelY + 6 - pop, { size: 9, align: "center", color: INK_SOFT });
    hits.add(HUD_HITS.label, lx, ly, lw, 36, 0, 1);
  }
  if (go) {
    pill(g, lx + lw + 8, ly, goWidth, 36, "Go", { color: "green" });
    hits.add(HUD_HITS.go, lx + lw + 8, ly, goWidth, 36);
  }

  // The menu's button, or its hint: the caption keeps clear of it.
  let menuRight = L.menuX;
  if (pointing) {
    iconButton(g, L.menuX + 18, L.menuY, 18, "menu");
    hits.add(HUD_HITS.menu, L.menuX - 6, L.menuY - 24, 48, 48);
    menuRight = L.menuX + 36;
  } else if (s.hints) {
    // Up and down need no hint: the arrows on the tool's name say it. The shelf's and each tool's go once they've been used.
    const set = s.glyphs!;
    const hx = L.hintsX;
    const hy = L.hintsY;
    if (!s.learned.tools) hintChip(g, hx, hy, "leftRight", "Tools", t, 13, set);
    const action = s.learned[tool.id] ? null : actionLabel(hands, s.here);
    if (action) {
      let ay = s.learned.tools ? hy : hy - 34;
      // A keyboard's or a pad's chip is wider than the remote's: where it would reach the shelf's glass, it goes just over it.
      if (hx + hintWidth(g, action.label, 13, action.glyph, set) > L.shelfLeft - 8) ay = Math.min(ay, L.shelfY - 26 - 2 - (13 * 1.75) / 2);
      hintChip(g, hx, ay, action.glyph, action.label, t, 13, set);
    }
    // A keyboard's player moves the hand with the mouse, and needs no telling.
    if (set !== "keys" && (s.teachSwipe || hands.following)) {
      const sx = L.rightX - hintWidth(g, SWIPE, 13, "swipe", set);
      // Over the shelf, where it would reach the shelf's glass.
      const sy = sx < L.shelfLeft + gap * n + L.apart + 8 ? Math.min(L.rightY, L.shelfY - 26 - 2 - (13 * 1.75) / 2) : L.rightY;
      hintChip(g, sx, sy, "swipe", SWIPE, t, 13, set);
    }
    const menu = hintChip(g, L.menuX, L.menuY, "playPause", "Menu", t, 12, set);
    hits.add(HUD_HITS.menu, L.menuX, L.menuY - 12, menu, 24);
    menuRight = L.menuX + menu;
  }

  if (s.eyes) drawEyesLabels(g, s.eyes, L);

  // What the fly is doing, from its brain, at the top.
  const words = caption(s.activity, s.food);
  // Centred, unless that would put it over the menu's button on a narrow screen; smaller, if it must be, to fit beside it.
  const beside = L.cx + L.width / 2 - 8 - (menuRight + 8);
  let size = 16;
  let cw = hintWidth(g, words, size) + 4;
  if (cw > beside) {
    size = Math.max(11, Math.floor((size * beside) / cw));
    cw = hintWidth(g, words, size) + 4;
  }
  const cy = L.captionY;
  const kx = Math.max(cx, menuRight + 8 + cw / 2);
  glassPanel(g, kx - cw / 2, cy - 15, cw, 30, 15, { alpha: 0.8, shadow: false });
  // The brain's pulse: quicker the more it fires.
  const beat = s.brainRunning ? 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * Math.min(4, 0.5 + s.spikes / 30000)) : 0;
  orb(g, kx - cw / 2 + 17, cy, 6 + beat * 1.5, s.brainRunning ? "pink" : "glass");
  text(g, words, kx + 8, cy + 1, { size, align: "center", baseline: "middle", color: INK });
}

/** The picture of what its eyes take in is drawn under this layer, in its panel; label it for what it is, inside the panel. */
function drawEyesLabels(g: CanvasRenderingContext2D, eyes: NonNullable<HudState["eyes"]>, L: HudLayout) {
  const p = L.picture;
  const cx = p.x + p.w / 2;
  const bottom = p.y + p.h;
  const small = L.pictureText === "small";
  text(g, "Through the fly's eyes", cx, p.y + (small ? 17 : 22), { size: small ? 14 : 18, align: "center", color: "#eaf6ff" });
  // The heading is the truth when its brain is sent this; only when it isn't does the picture need a word more.
  if (eyes.standIn || eyes.off) {
    const facets = eyes.facets.toLocaleString("en-US");
    const sub = eyes.standIn
      ? `A picture of the light on ${facets} facets, laid out as its eyes look. Its brain doesn't see this yet.`
      : `The light on each of its ${facets} facets. Its eyes are off in Settings, so its brain isn't sent this.`;
    if (small) text(g, sub, cx, p.y + 31, { size: 9, align: "center", color: "#cfe8ff" });
    else {
      // On a narrow screen, in two lines.
      g.font = font(12);
      const lines = L.pictureText === "wrapped" && g.measureText(sub).width > p.w - 24 ? wrap(g, sub, p.w - 24, 12) : [sub];
      for (let i = 0; i < lines.length && i < 2; i++) text(g, lines[i], cx, p.y + 42 + i * 13, { size: 12, align: "center", color: "#cfe8ff" });
    }
  }
  // The eyes' names under the middle of each eye's half, as on the TV (190 of its 649 units across); where that is too close to say "ahead" between them, without it.
  const across = L.pictureScale * 2 * Math.PI * (190 / 649.04);
  const size = small ? 10 : 12;
  text(g, "left eye", cx - across, bottom - 12, { size, align: "center", color: "#9fdcff" });
  if (across > 70) text(g, "ahead", cx, bottom - 12, { size, align: "center", color: "#9fdcff" });
  text(g, "right eye", cx + across, bottom - 12, { size, align: "center", color: "#9fdcff" });
}
