// The shelf and gesture demonstrations share one HUD texture. A successful
// action permanently retires its diagram; no diagram ever acts on the fly.

import { INK, INK_SOFT, bubbleRing, chevron, font, glassPanel, drawGlyph, hintWidth, iconButton, orb, pill, roundedRect, text, wrap } from "@fly/ui";
import type { GlyphSet, Hit, HitMap } from "@fly/ui";
import type { Activity } from "../life.ts";
import type { PlaceId } from "../places/catalog.ts";
import type { Learned } from "../settings.ts";
import { TOOLS } from "../tools/hands.ts";
import type { Hands } from "../tools/hands.ts";
import { drawToolIcon } from "../tools/view.ts";
import type { Arriving } from "./loading.ts";
import type { HudLayout } from "./layout.ts";
import { drawDemonstration, ghostPress } from "./demonstration.ts";

export type HudState = {
  hands: Hands;
  /** Where the fly is now, for the Place tool. */
  here: PlaceId;
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
  /** Seconds since the tool or its kind last changed, for the label's little pop. */
  changed: number;
  brainRunning: boolean;
  arrival?: Arriving | null;
  /** Looking through the fly's eyes: how many facets, whether they're a stand-in, and whether they're off in Settings. */
  eyes: { facets: number; standIn: boolean; off: boolean } | null;
  layout: HudLayout;
  aimX?: number;
  aimY?: number;
  pressed?: Readonly<Hit> | null;
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

export function caption(activity: Activity, food: string | null) {
  if ((activity === "feeding" || activity === "tasting") && food) return `${CAPTIONS[activity]} ${food.toLowerCase()}`;
  return CAPTIONS[activity];
}

/** No periodic teaching redraws are needed once the visible lessons are done. */
export function needsTeaching(s: HudState): boolean {
  if (!s.hints) return false;
  return (!s.learned[s.hands.current.id] && !s.hands.fixed.has(s.hands.current.id) && !(s.hands.current.id === "feed" && s.hands.variant.id === "clear")) ||
    (!!s.glyphs && !s.learned.tools) ||
    (!!s.glyphs && s.glyphs !== "keys" && s.teachSwipe && !s.learned.hand);

}

export function drawHud(g: CanvasRenderingContext2D, t: number, s: HudState, hits: HitMap) {
  const { hands } = s;
  const L = s.layout;
  const pointing = s.glyphs === null;
  const touch = pointing ? L.touch : null;
  const labelY = touch?.labelY ?? L.labelY;
  const menuY = touch?.menuY ?? L.menuY;
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
    const pressed = s.pressed?.kind === HUD_HITS.tool && s.pressed.index === i;
    const r = (on ? 22 : pressed ? 20 : 17) * L.orb;
    const y = pressed ? sy - 1 : on ? sy - 6 : sy;
    orb(g, x, y, r, on || pressed ? "aqua" : "glass");
    drawToolIcon(g, TOOLS[i].id, x, y + 1, r * 0.62);
    if (on && s.hints && !s.learned[TOOLS[i].id] && !hands.fixed.has(TOOLS[i].id)) bubbleRing(g, x - r, y - r, r * 2, r * 2, r, t);
    hits.add(HUD_HITS.tool, x - gap / 2, sy - 26, gap, 52, i);
  }
  // The tool's name and kind, over the shelf. Pointing, arrows either side change the kind, and a place to go has its own button.
  const tool = hands.current;
  const many = tool.variants.length > 1;
  const reserveGo = pointing && tool.id === "place";
  const go = reserveGo && hands.place !== s.here;
  const goWidth = 64;
  const room = (touch?.labelWidth ?? L.width - 16) - (reserveGo ? goWidth + 8 : 0);
  const arrows = many ? (pointing ? 56 : 40) : 0;
  let label = many ? `${tool.name} · ${hands.label}` : tool.name;
  const lw = many ? Math.min(280, room) : Math.min(room, Math.max(150, hintWidth(g, label, 17)));
  // Stable arrows can be reused without aiming again when a kind's name changes.
  if (many && hintWidth(g, label, 17) + arrows > lw) label = hands.label;
  g.font = font(17);
  const labelSize = Math.min(17, 17 * Math.max(1, lw - arrows - 24) / Math.max(1, g.measureText(label).width));
  const lx = (touch?.labelCx ?? cx) - lw / 2 - (reserveGo ? (goWidth + 8) / 2 : 0);
  // Identify the pending tool clear of the finger without committing it.
  const pending = pointing && s.pressed?.kind === HUD_HITS.tool ? TOOLS[s.pressed.index] : undefined;
  const pop = Math.max(0, 1 - s.changed * 4) * 3;
  const ly = labelY - 17 - pop;
  const hitHeight = touch?.targetHeight ?? 32;
  const hitY = labelY - 17 - (hitHeight - 32) / 2;
  const labelPressed = s.pressed?.kind === HUD_HITS.kind || s.pressed?.kind === HUD_HITS.label;
  pill(g, lx, ly, lw, 32, "", { color: labelPressed || pending ? "aqua" : "glass", press: labelPressed ? 1 : 0 });
  if (pending) drawToolIcon(g, pending.id, lx + lw / 2, labelY - pop, 12);
  else text(g, label, lx + lw / 2, labelY - pop, { size: labelSize, align: "center", baseline: "middle", color: INK });
  if (many && pointing) {
    chevron(g, lx + 18, labelY - pop, -1, true);
    chevron(g, lx + lw - 18, labelY - pop, 1, true);
    hits.add(HUD_HITS.kind, lx, hitY, 44, hitHeight, 0, -1);
    hits.add(HUD_HITS.label, lx + 44, hitY, lw - 88, hitHeight, 0, 1);
    hits.add(HUD_HITS.kind, lx + lw - 44, hitY, 44, hitHeight, 0, 1);
  } else if (many) {
    // Up and down change it.
    text(g, "▲", lx + 18, labelY - 5 - pop, { size: 9, align: "center", color: INK_SOFT });
    text(g, "▼", lx + 18, labelY + 6 - pop, { size: 9, align: "center", color: INK_SOFT });
    hits.add(HUD_HITS.label, lx, hitY, lw, hitHeight, 0, 1);
  }
  if (go) {
    pill(g, lx + lw + 8, ly, goWidth, 32, "Go", { color: "green", press: s.pressed?.kind === HUD_HITS.go ? 1 : 0 });
    hits.add(HUD_HITS.go, lx + lw + 8, hitY, goWidth, hitHeight);
  }

  // The menu's button, or its hint: the caption keeps clear of it.
  let menuRight = touch?.menuAtFoot ? L.cx - L.width / 2 - 8 : L.menuX;
  if (pointing) {
    iconButton(g, L.menuX + 18, menuY, 18, "menu", s.pressed?.kind === HUD_HITS.menu);
    hits.add(HUD_HITS.menu, L.menuX - 6, menuY - 24, 48, 48);
    if (!touch?.menuAtFoot) menuRight = L.menuX + 36;
  } else {
    drawGlyph(g, "playPause", L.menuX + 16, menuY, 25, 0, s.glyphs!);
    hits.add(HUD_HITS.menu, L.menuX, menuY - 16, 36, 32);
    menuRight = L.menuX + 36;
  }

  if (s.hints) {
    if (!s.learned[tool.id] && !hands.fixed.has(tool.id) && !(tool.id === "feed" && hands.variant.id === "clear")) {
      if (tool.id === "light" || tool.id === "weather" || tool.id === "view" || tool.id === "place") {
        if (pointing) {
          // Actual press feedback takes precedence over the gesture being taught.
          if (!s.pressed) ghostPress(g, go ? lx + lw + 40 : lx + lw - 18, labelY - 8, t, false);
        }
        else drawGlyph(g, tool.id === "place" && hands.place !== s.here ? "select" : "upDown", cx, labelY - 48, 28, t, s.glyphs!);
      } else {
        const x = Math.max(L.cx - L.width / 2 + 65, Math.min(L.cx + L.width / 2 - 65, s.aimX ?? cx));
        const y = Math.max(L.captionY + (s.brainRunning ? 70 : 110), Math.min(labelY - 58, s.aimY ?? labelY - 85));
        drawDemonstration(g, t, tool.id, x, y, s.glyphs);
      }
    }
    if (!s.learned.tools && !pointing) drawGlyph(g, "leftRight", L.shelfLeft + L.split * gap / 2, sy - 34, 23, t, s.glyphs!);
    if (!s.learned.hand && s.teachSwipe && s.glyphs && s.glyphs !== "keys") drawGlyph(g, "swipe", L.rightX - 20, L.rightY - 30, 28, t, s.glyphs);
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
  // Awake is a status, not a synthetic spike trace.
  orb(g, kx - cw / 2 + 17, cy, 7, s.brainRunning ? "pink" : "glass");
  text(g, words, kx + 8, cy + 1, { size, align: "center", baseline: "middle", color: INK });
  if (!s.brainRunning) {
    const a = s.arrival;
    const width = Math.min(140, cw - 16);
    const by = cy + 23;
    const left = kx - width / 2;
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
      glassPanel(g, kx - 64, by + 10, 128, 22, 11, { alpha: 0.8, shadow: false });
      text(g, amount, kx, by + 25, { size: 12, align: "center", color: INK });
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
