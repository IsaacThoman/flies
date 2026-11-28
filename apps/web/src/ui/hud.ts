// What is drawn over the world in play, kept out of the way: nothing at all
// while the player only watches, and when they reach for something, the one
// button at the foot that shows what is in hand and opens the tray, the
// buttons either side of it for turning a piece and putting the hand's thing
// away, the way to the menu, what the fly is doing at the top, and, for the
// remote, its button hints until they have been used. Using a tool
// permanently retires its hint.

import { INK, bubbleRing, drawGlyph, font, glassPanel, hintWidth, iconButton, orb, pill, roundedRect, text, wrap } from "@fly/ui";
import type { GlyphSet, Hit, HitMap } from "@fly/ui";
import type { Activity } from "../life.ts";
import type { Learned } from "../settings.ts";
import type { Hands } from "../tools/hands.ts";
import type { Tray, TrayItem } from "../tools/tray.ts";
import { drawItemIcon } from "./items.ts";
import type { Arriving } from "./loading.ts";
import type { HudLayout } from "./layout.ts";
import { TRAY_BLOOM, TRAY_HITS, drawTray } from "./tray.ts";

export type HudState = {
  hands: Hands;
  tray: Tray;
  activity: Activity;
  /** What it is tasting or eating, if anything. */
  food: string | null;
  hints: boolean;
  /** Whose buttons the hints show, or null when the player is pointing at the screen (no hints, and buttons to press instead). */
  glyphs: GlyphSet | null;
  /** What the hints have taught: those hints aren't shown. */
  learned: Learned;
  /** The player hasn't moved the pointer yet: show how. */
  teachSwipe: boolean;
  /** How much the controls show: 1 while the player is at it, 0 once they only watch. */
  presence: number;
  /** Seconds since what is in hand last changed, for its name's moment over the button. */
  changed: number;
  /** Seconds since the player last took a photo, for the screen's flash. */
  shutter?: number;
  brainRunning: boolean;
  arrival?: Arriving | null;
  /** Looking through the fly's eyes: how many facets, whether they're a stand-in, and whether they're off in Settings. */
  eyes: { facets: number; standIn: boolean; off: boolean } | null;
  layout: HudLayout;
  pressed?: Readonly<Hit> | null;
  /** A touch screen (bigger targets, names under the tray's things) and its CSS pixels per design unit. */
  coarse: boolean;
  unit: number;
  /** Building is on here (at home): a piece in hand can be turned and set down. */
  canBuild: boolean;
  /** The tray's things: whether one can't be taken here, and the name each goes by now. */
  unavailable: (item: TrayItem) => boolean;
  label: (item: TrayItem) => string;
};

/** What the HUD's targets are, as recorded in the hit map. */
export const HUD_HITS = { held: "held", rotate: "rotate", putAway: "putAway", menu: "menu", ...TRAY_HITS } as const;

/** How long what is in hand is named over its button after it changes, s. */
const NAMED = 1.6;

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

export function caption(activity: Activity, food: string | null) {
  if ((activity === "feeding" || activity === "tasting") && food) return `${CAPTIONS[activity]} ${food.toLowerCase()}`;
  return CAPTIONS[activity];
}

/** The picture of what is in hand: the food, the piece or the puff itself where it has kinds, else the tool's. */
export function heldIcon(hands: Hands): string {
  const id = hands.current.id;
  if (id === "feed" || id === "build" || id === "blow") return hands.variant.id;
  return id;
}

/** The name of what is in hand. */
export function heldName(hands: Hands): string {
  const id = hands.current.id;
  if (id === "build" && hands.fixed.has("build")) return "Only at home";
  if (id === "blow") return hands.variant.id === "strong" ? "Puff" : "Breath";
  if (id === "feed" || id === "build") return hands.variant.label;
  if (id === "swoop") return "Ball";
  if (id === "feather") return "Feather";
  return hands.current.name;
}

/** Whether the hints still have something to show, so that their shimmer is drawn again now and then. */
export function needsTeaching(s: HudState): boolean {
  if (!s.hints) return false;
  if (!s.learned.tray) return true;
  if (!s.glyphs) return false;
  return !s.learned.camera || teachesUse(s) || (s.glyphs !== "keys" && s.teachSwipe && !s.learned.hand);
}

/** What Select does with the tool in hand is still to be taught: not the empty hand's, which the hand's lesson teaches, nor one that can't be used here. */
const teachesUse = (s: HudState) => {
  const id = s.hands.current.id;
  return id !== "hand" && !s.learned[id] && !s.hands.fixed.has(id);
};

/** The ring is opening, or the controls are fading in or out: drawn again each frame until they settle. */
export function hudMoving(s: HudState): boolean {
  return (s.tray.open && s.tray.since < TRAY_BLOOM + 0.05) || (s.presence > 0.005 && s.presence < 0.995) || s.changed < NAMED + 0.3;
}

/** How long the screen flashes white as a photo is taken, s. It is drawn over the frame, after the picture was taken from it. */
export const SHUTTER_FLASH = 0.25;

export function drawHud(g: CanvasRenderingContext2D, t: number, s: HudState, hits: HitMap) {
  const { hands } = s;
  const L = s.layout;
  if (s.shutter !== undefined && s.shutter < SHUTTER_FLASH) {
    g.fillStyle = `rgba(255, 255, 255, ${(0.75 * (1 - s.shutter / SHUTTER_FLASH)).toFixed(3)})`;
    g.fillRect(0, 0, g.canvas.width, g.canvas.height);
  }
  const pointing = s.glyphs === null;
  const open = s.tray.open;
  // Pointing at a touch screen, the button for the tray and the menu's stay, faint, while the rest fades: something to reach for.
  const faint = pointing && s.coarse ? 0.45 : 0;
  const present = open ? 1 : s.presence;

  if (open) drawTray(g, { tray: s.tray, hands, layout: L, pointing, pressed: s.pressed ?? null, unavailable: s.unavailable, label: s.label, coarse: s.coarse, unit: s.unit }, hits);

  // What is in hand, at the foot: pressed, it opens the tray (or, open, closes it).
  const heldAlpha = Math.max(present, faint);
  if (heldAlpha > 0.01) {
    g.globalAlpha = heldAlpha;
    const pressed = s.pressed?.kind === HUD_HITS.held;
    const r = L.heldR * (pressed ? 0.94 : 1);
    orb(g, L.heldX, L.heldY, r, pressed || open ? "aqua" : "glass");
    drawItemIcon(g, open ? "back" : heldIcon(hands), L.heldX, L.heldY + 1, r * 0.6);
    if (pointing || open) hits.add(HUD_HITS.held, L.heldX - L.heldR - 4, L.heldY - L.heldR - 4, L.heldR * 2 + 8, L.heldR * 2 + 8);
    // Not yet opened: it shimmers, for anyone who hasn't found what is in it.
    if (s.hints && !s.learned.tray && !open) bubbleRing(g, L.heldX - r, L.heldY - r, r * 2, r * 2, r, t, heldAlpha);
    g.globalAlpha = 1;
  }

  // Either side of it, while there is something to do with them: a piece in hand turns; anything but the empty hand is put away.
  const side = open ? 0 : present;
  if (side > 0.01) {
    g.globalAlpha = side;
    const piece = hands.current.id === "build" && s.canBuild;
    const away = hands.current.id !== "hand";
    if (pointing) {
      if (piece) sideButton(g, hits, L.heldX - L.sideGap, L.heldY, L.sideR, "rotate", HUD_HITS.rotate, s.pressed);
      if (away) sideButton(g, hits, L.heldX + L.sideGap, L.heldY, L.sideR, "hand", HUD_HITS.putAway, s.pressed);
    } else {
      if (piece) drawGlyph(g, "leftRight", L.heldX - L.sideGap - 4, L.heldY, 23, t, s.glyphs!);
      if (away) drawGlyph(g, "back", L.heldX + L.sideGap + 4, L.heldY, 23, 0, s.glyphs!);
    }
    g.globalAlpha = 1;
  }

  // Its name, for a moment, when it is taken up.
  if (!open && s.changed < NAMED) {
    const k = Math.min(1, (NAMED - s.changed) * 3) * Math.min(1, s.changed * 10 + 0.3);
    const name = heldName(hands);
    const w = hintWidth(g, name, 15) + 12;
    g.globalAlpha = k;
    pill(g, L.heldX - w / 2, L.heldY - L.heldR - 30, w, 26, "", { color: "glass" });
    text(g, name, L.heldX, L.heldY - L.heldR - 17, { size: 15, align: "center", baseline: "middle", color: INK });
    g.globalAlpha = 1;
  }

  // The remote's hints, until each has been used.
  if (s.hints && !pointing && present > 0.01 && !open) {
    g.globalAlpha = present;
    const glyphs = s.glyphs!;
    if (!s.learned.tray) drawGlyph(g, "playPause", L.heldX - L.sideGap - (hands.current.id === "build" ? 40 : 4), L.heldY, 25, t, glyphs);
    const id = hands.current.id;
    if (teachesUse(s)) drawGlyph(g, id === "feather" || id === "blow" ? "hold" : "select", L.heldX, L.heldY - L.heldR - 22, 26, t, glyphs);
    if (!s.learned.camera) drawGlyph(g, "arrows", L.hintsX + 22, L.hintsY - 6, 25, t, glyphs);
    if (!s.learned.hand && s.teachSwipe && glyphs !== "keys") drawGlyph(g, "swipe", L.rightX - 20, L.rightY - 30, 28, t, glyphs);
    g.globalAlpha = 1;
  }

  // The way to the menu, for a pointer: a remote's Back is its own.
  const menuAlpha = pointing ? Math.max(present, faint) : 0;
  if (menuAlpha > 0.01 && !open) {
    g.globalAlpha = menuAlpha;
    iconButton(g, L.menuX + 18, L.menuY, 18, "menu", s.pressed?.kind === HUD_HITS.menu);
    hits.add(HUD_HITS.menu, L.menuX - 6, L.menuY - 24, 48, 48);
    g.globalAlpha = 1;
  }

  if (s.eyes) drawEyesLabels(g, s.eyes, L);
  drawCaption(g, t, s);
}

function sideButton(g: CanvasRenderingContext2D, hits: HitMap, x: number, y: number, r: number, icon: string, kind: string, pressed: Readonly<Hit> | null | undefined) {
  const down = pressed?.kind === kind;
  orb(g, x, y, r * (down ? 0.94 : 1), down ? "aqua" : "glass");
  drawItemIcon(g, icon, x, y + 1, r * 0.6);
  hits.add(kind, x - r - 4, y - r - 4, r * 2 + 8, r * 2 + 8);
}

/** What the fly is doing, from its brain, at the top, with the rest of the controls; and while its brain wakes, how far along that is. */
function drawCaption(g: CanvasRenderingContext2D, t: number, s: HudState) {
  const alpha = s.brainRunning ? s.presence : 1;
  if (alpha < 0.01) return;
  const L = s.layout;
  const cx = L.cx;
  const words = caption(s.activity, s.food);
  // Centred, smaller if it must be, to fit clear of the menu's button.
  const room = L.width - 2 * 64;
  let size = 16;
  let cw = hintWidth(g, words, size) + 4;
  if (cw > room) {
    size = Math.max(11, Math.floor((size * room) / cw));
    cw = hintWidth(g, words, size) + 4;
  }
  const cy = L.captionY;
  g.globalAlpha = alpha;
  glassPanel(g, cx - cw / 2, cy - 15, cw, 30, 15, { alpha: 0.8, shadow: false });
  // Awake is a status, not a synthetic spike trace.
  orb(g, cx - cw / 2 + 17, cy, 7, s.brainRunning ? "pink" : "glass");
  text(g, words, cx + 8, cy + 1, { size, align: "center", baseline: "middle", color: INK });
  g.globalAlpha = 1;
  if (!s.brainRunning) {
    const a = s.arrival;
    const width = Math.min(140, cw - 16);
    const by = cy + 23;
    const left = cx - width / 2;
    roundedRect(g, left, by, width, 5, 2.5);
    g.fillStyle = "rgba(20,70,120,0.3)";
    g.fill();
    const downloading = a?.phase === "download";
    const fill = downloading && a ? width * a.progress : 14;
    if (fill > 0) {
      const at = downloading ? 0 : (0.5 + 0.5 * Math.sin(t * 2)) * (width - 14);
      roundedRect(g, left + at, by, fill, 5, Math.min(2.5, fill / 2));
      g.fillStyle = "#c7efaf";
      g.fill();
    }
    if (downloading && a) {
      const amount = `${(a.source.received / 1e6).toFixed(1)} / ${(a.source.total / 1e6).toFixed(1)} MB`;
      glassPanel(g, cx - 64, by + 10, 128, 22, 11, { alpha: 0.8, shadow: false });
      text(g, amount, cx, by + 25, { size: 12, align: "center", color: INK });
    }
  }
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
