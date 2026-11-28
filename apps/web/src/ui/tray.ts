// The tray, drawn: a ring of glass bubbles round the middle of the screen
// over the world, each with its picture, what is in hand (or chosen) marked,
// the one the remote is on lit, and its name in the middle, where a tap or
// Back goes back a ring. The rings are tools/tray.ts.

import { INK, glassPanel, orb, text } from "@fly/ui";
import type { Hit, HitMap } from "@fly/ui";
import type { Hands } from "../tools/hands.ts";
import { isCurrent } from "../tools/tray.ts";
import type { Tray, TrayItem } from "../tools/tray.ts";
import { drawItemIcon } from "./items.ts";
import type { HudLayout } from "./layout.ts";

export const TRAY_HITS = { slot: "slot", back: "trayBack" } as const;

/** A slot's radius on the TV, and the room between neighbours round the ring (design units). */
const SLOT_R = 25;
const SLOT_GAP = 22;
/** Seconds the ring takes to open out. */
export const TRAY_BLOOM = 0.25;

/** The names of the rings, over the middle. */
const PAGE_NAMES: Record<string, string> = { food: "Food", build: "Build", toys: "Toys", look: "Look", world: "World", time: "Time of day", weather: "Weather", place: "Place" };

export type TrayLook = {
  tray: Tray;
  hands: Hands;
  layout: HudLayout;
  /** Pointing: names under every slot (a finger has nothing to hover with), and no remote's focus ring. */
  pointing: boolean;
  /** A finger or the mouse is down on a slot and not yet let go. */
  pressed: Readonly<Hit> | null;
  /** A thing that can't be taken here (building on a visit, the sky at a table) is dimmed. */
  unavailable: (item: TrayItem) => boolean;
  /** The name a thing goes by now (the whole-place view is named for what the fly stands on). */
  label: (item: TrayItem) => string;
  coarse: boolean;
  unit: number;
};

export type TrayGeometry = {
  /** Each slot's radius, and the half-width of its target. */
  r: number;
  hit: number;
  /** How far the ring reaches up and down, and across. */
  rx: number;
  ry: number;
  /** Each slot's middle, from the ring's middle: x, y pairs round from the top, clockwise. */
  points: Float32Array;
};

const geometries = new Map<string, TrayGeometry>();
/** Steps round the ring when spacing the slots along it. */
const STEPS = 256;

/**
 * Where each slot's middle is and how big, for a ring of `n`: a circle where
 * there is room, stretched across into an oval on a short, wide screen (a
 * phone on its side) so that its slots keep a finger's size, and smaller only
 * where even that is too little. The slots are evenly spaced along it.
 */
export function trayGeometry(L: HudLayout, n: number, coarse: boolean, unit: number): TrayGeometry {
  const key = `${n} ${L.ringRoom} ${L.ringWide} ${coarse} ${unit}`;
  const kept = geometries.get(key);
  if (kept) return kept;
  let r = coarse ? Math.max(SLOT_R, 24 / unit) : SLOT_R;
  const sin = Math.sin(Math.PI / Math.max(3, n));
  // Room in the middle for the name of what is lit, its ring's name over it and the way back under it.
  const round = Math.max(r + 62, (2 * r + SLOT_GAP) / (2 * sin));
  let ry = Math.min(round, L.ringRoom);
  let rx = ry;
  // Too little room up and down: wider, as far as it needs or may.
  while (perimeter(rx, ry) < n * (2 * r + SLOT_GAP) && rx < L.ringWide) rx = Math.min(L.ringWide, rx + 4);
  // Still too little: smaller slots.
  if (perimeter(rx, ry) < n * (2 * r + SLOT_GAP)) r = Math.max(14, perimeter(rx, ry) / n / 2 - SLOT_GAP / 2);
  ry = Math.min(ry, L.ringRoom);
  const points = new Float32Array(n * 2);
  const along = new Float32Array(STEPS + 1);
  const at = (k: number) => (k / STEPS) * Math.PI * 2;
  for (let k = 1; k <= STEPS; k++) along[k] = along[k - 1] + Math.hypot(rx * (Math.sin(at(k)) - Math.sin(at(k - 1))), ry * (Math.cos(at(k)) - Math.cos(at(k - 1))));
  const total = along[STEPS];
  let least = Infinity;
  for (let i = 0, k = 0; i < n; i++) {
    const want = (i / n) * total;
    while (k < STEPS && along[k + 1] < want) k++;
    const t = at(k) + ((want - along[k]) / Math.max(1e-9, along[k + 1] - along[k])) * (at(k + 1) - at(k));
    points[i * 2] = Math.sin(t) * rx;
    points[i * 2 + 1] = -Math.cos(t) * ry;
    if (i > 0) least = Math.min(least, Math.hypot(points[i * 2] - points[i * 2 - 2], points[i * 2 + 1] - points[i * 2 - 1]));
  }
  if (n > 1) least = Math.min(least, Math.hypot(points[0] - points[n * 2 - 2], points[1] - points[n * 2 - 1]));
  // Each slot's target: as big as its bubble and a little more, but never reaching a neighbour's, which a square would round a ring.
  const hit = Math.min(r + 4, least * 0.35);
  const geometry = { r, hit, rx, ry, points };
  geometries.set(key, geometry);
  return geometry;
}

/** An ellipse's perimeter (Ramanujan's approximation). */
function perimeter(a: number, b: number) {
  return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
}

export function drawTray(g: CanvasRenderingContext2D, s: TrayLook, hits: HitMap) {
  const { tray, hands, layout: L } = s;
  const items = tray.items;
  const n = items.length;
  const { r, hit, ry, points } = trayGeometry(L, n, s.coarse, s.unit);
  const bloom = 1 - Math.exp(-Math.min(tray.since, TRAY_BLOOM) * 18);
  const cx = L.ringX;
  const cy = L.ringY;
  const spread = 0.7 + 0.3 * bloom;
  // The world dims a little behind it, so the ring reads over anything.
  g.fillStyle = `rgba(6, 22, 44, ${(0.3 * bloom).toFixed(3)})`;
  g.fillRect(0, 0, g.canvas.width * 4, g.canvas.height * 4);
  // The middle: the name of what is lit (or pressed), and the ring's name over it; a tap there goes back.
  const inner = Math.max(30, ry * spread - r - 10);
  glassPanel(g, cx - inner, cy - inner, inner * 2, inner * 2, inner, { alpha: 0.82 * bloom, shadow: false });
  hits.add(TRAY_HITS.back, cx - inner * 0.7, cy - inner * 0.7, inner * 1.4, inner * 1.4);
  const shown = s.pressed?.kind === TRAY_HITS.slot ? items[s.pressed.index] : tray.focused;
  const pageName = PAGE_NAMES[tray.page];
  g.globalAlpha = bloom;
  if (pageName) text(g, pageName, cx, cy - Math.min(24, inner * 0.42), { size: 11, align: "center", baseline: "middle", color: "rgba(13,59,102,0.6)" });
  if (shown) {
    const label = s.label(shown);
    g.font = "600 16px sans-serif";
    const size = Math.max(10, Math.min(16, (16 * inner * 1.7) / Math.max(1, g.measureText(label).width)));
    text(g, label, cx, cy + (pageName ? 2 : 0), { size, weight: 600, align: "center", baseline: "middle", color: INK });
  }
  if (tray.page !== "root") drawItemIcon(g, "back", cx, cy + Math.min(26, inner * 0.5), 6);
  for (let i = 0; i < n; i++) {
    const item = items[i];
    const x = cx + points[i * 2] * spread;
    const y = cy + points[i * 2 + 1] * spread;
    const focused = !s.pointing && i === tray.focus;
    const pressed = s.pressed?.kind === TRAY_HITS.slot && s.pressed.index === i;
    const current = isCurrent(item, hands);
    const dim = s.unavailable(item);
    g.globalAlpha = bloom * (dim ? 0.45 : 1);
    const big = focused || pressed ? r * 1.12 : r;
    orb(g, x, y, big, focused || pressed ? "aqua" : current ? "pink" : "glass");
    drawItemIcon(g, item.id, x, y + 1, big * 0.6);
    if (s.pointing && s.coarse) {
      // A finger can't hover to learn a name: each says its own, small, under it.
      const label = s.label(item);
      g.font = "600 10px sans-serif";
      const size = Math.max(7, Math.min(10, (10 * (2 * r + SLOT_GAP - 4)) / Math.max(1, g.measureText(label).width)));
      text(g, label, x, y + big + 8, { size, weight: 600, align: "center", baseline: "middle", color: "#ffffff", outline: "rgba(6,22,44,0.7)", outlineWidth: 3 });
    }
    hits.add(TRAY_HITS.slot, x - hit * spread, y - hit * spread, 2 * hit * spread, 2 * hit * spread, i);
  }
  g.globalAlpha = 1;
}
