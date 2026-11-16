// Draws a Menu (packages/ui) as a column of glossy rows: actions as jelly
// buttons, choices with their value between chevrons (or, as tabs, all their
// options side by side), sliders as glossy tracks. The soap-bubble ring
// glides to the focused row, for the remote, a keyboard and a pad; for a
// mouse or a finger there is no ring, and what the mouse is over only
// brightens a little. On a narrow screen a choice or a slider puts its value
// under its label. Every row, chevron, tab, track and "more" is recorded
// where it is drawn, for a pointer.

import { Eased, INK, INK_SOFT, bubbleRing, chevron, font, pill, slider, text } from "@fly/ui";
import type { ChoiceItem, HitMap, Menu, MenuItem } from "@fly/ui";

export type MenuLayout = { x: number; y: number; width: number; row: number; gap: number; compact?: boolean };

/** What a menu's targets are, as recorded in the hit map: `index` is the item's, `value` a chevron's or a "more"'s direction. */
export const MENU_HITS = { row: "row", step: "step", track: "track", more: "more", tab: "tab" } as const;

/** The slider's track, from the row's right edge: where it starts and how long it is. */
const TRACK = { from: 170, length: 140 };

export class MenuView {
  readonly menu: Menu;
  layout: MenuLayout;
  /** Where a slider's track runs across its row, for turning a point on it into a value: worked out with the layout. */
  readonly track = { x: 0, w: 0 };
  /** Room (design units) kept clear at the left of a row of tabs, for the back button beside them. */
  tabInset = 0;
  #ring = new Eased(0, 18);
  #press = new Eased(0, 12);

  constructor(menu: Menu, layout: MenuLayout) {
    this.menu = menu;
    this.layout = layout;
    this.#placeTrack();
    this.#ring.snap(this.#rowY(this.#visibleIndex(menu.focus)));
  }

  /** Lays it out somewhere else (the screen changed shape): the ring goes straight there. */
  place(layout: MenuLayout) {
    this.layout = layout;
    this.#placeTrack();
    this.#ring.snap(this.#rowY(this.#visibleIndex(this.menu.focus)));
  }

  /** Call after the focus moves or a value changes. */
  pressed() {
    this.#press.snap(1);
    this.#press.target = 0;
  }

  #visibleIndex(i: number) {
    return i - this.menu.scroll;
  }

  #rowY(visible: number) {
    const { y, row, gap } = this.layout;
    return y + visible * (row + gap);
  }

  /** Eases the ring; true while it is still moving. */
  update(dt: number): boolean {
    this.#ring.target = this.#rowY(this.#visibleIndex(this.menu.focus));
    const a = this.#ring.update(dt);
    const b = this.#press.update(dt);
    return a || b;
  }

  /** The vertical extent the menu takes. */
  get height() {
    const { row, gap } = this.layout;
    return Math.min(this.menu.items.length, this.menu.rows) * (row + gap) - gap;
  }

  #placeTrack() {
    const { x, width, compact } = this.layout;
    this.track.x = compact ? x + 28 : x + width - 22 - TRACK.from;
    this.track.w = compact ? width - 56 : TRACK.length;
  }

  /** `ring`: show the focus (the remote's, the keys', a pad's); `hover`: the item a mouse is over, or -1. */
  draw(g: CanvasRenderingContext2D, t: number, hits: HitMap, ring = true, hover = -1) {
    const { x, width, row } = this.layout;
    const menu = this.menu;
    const end = Math.min(menu.items.length, menu.scroll + menu.rows);
    for (let i = menu.scroll; i < end; i++) {
      const item = menu.items[i];
      const y = this.#rowY(this.#visibleIndex(i));
      const focused = ring && i === menu.focus;
      const press = i === menu.focus ? this.#press.value : 0;
      hits.add(MENU_HITS.row, x, y, width, row, i);
      if (item.kind === "choice" && item.tabs) drawTabs(g, item, x + this.tabInset, y, width - this.tabInset, row, hits, i);
      else if (this.layout.compact) drawStacked(g, item, x, y, width, row, focused, i === hover, press, hits, i, this.track);
      else drawItem(g, item, x, y, width, row, focused, i === hover, press, hits, i, this.track);
    }
    // At the list's right edge, clear of a heading centred over it.
    if (menu.scroll > 0) {
      text(g, "▲ more", x + width - 4, this.#rowY(0) - 8, { size: 11, align: "right", color: INK_SOFT });
      hits.add(MENU_HITS.more, x + width - 60, this.#rowY(0) - 22, 60, 18, 0, -1);
    }
    if (end < menu.items.length) {
      text(g, "▼ more", x + width - 4, this.#rowY(menu.rows) + 6, { size: 11, align: "right", color: INK_SOFT });
      hits.add(MENU_HITS.more, x + width - 60, this.#rowY(menu.rows) - 8, 60, 18, 0, 1);
    }
    const focused = menu.focused;
    const inset = focused?.kind === "choice" && focused.tabs ? this.tabInset : 0;
    if (focused && ring) bubbleRing(g, x + inset, this.#ring.value - (focused.kind === "action" ? 2 : 0), width - inset, row, row / 2, t);
  }
}

/** The smallest a tab's label is drawn (design units); narrower, the tabs become one choice. */
const SMALLEST_TAB = 7;

/** A choice as tabs: its options side by side, the chosen one lit. */
function drawTabs(g: CanvasRenderingContext2D, item: ChoiceItem, x: number, y: number, w: number, h: number, hits: HitMap, index: number) {
  const n = item.options.length;
  const gap = 6;
  const tw = (w - gap * (n - 1)) / n;
  // No taller than a TV's row, and every label the same size, small enough for the widest to fit.
  const th = Math.min(h, 40);
  const most = Math.round(th * 0.46);
  g.font = font(most);
  let size = most;
  // Each label measured at the largest size: the smallest it needs is the one for all.
  for (const option of item.options) size = Math.min(size, Math.floor((most * (tw - 14)) / g.measureText(option.label).width));
  if (size < SMALLEST_TAB) {
    // Too narrow for every tab to be read: the one chosen, between arrows that step along them, as a choice is.
    const y0 = y + (h - th) / 2, mid = y0 + th / 2;
    pill(g, x, y0, w, th, item.options[item.index].label, { color: "aqua", disabled: item.disabled, size: Math.min(most, 16) });
    chevron(g, x + 20, mid, -1, item.index > 0);
    chevron(g, x + w - 20, mid, 1, item.index < n - 1);
    hits.add(MENU_HITS.step, x, y, 44, h, index, -1);
    hits.add(MENU_HITS.step, x + w - 44, y, 44, h, index, 1);
    return;
  }
  for (let k = 0; k < n; k++) {
    const tx = x + k * (tw + gap);
    pill(g, tx, y + (h - th) / 2, tw, th, item.options[k].label, { color: k === item.index ? "aqua" : "glass", disabled: item.disabled, size });
    hits.add(MENU_HITS.tab, tx, y, tw, h, index, k);
  }
}

function drawItem(g: CanvasRenderingContext2D, item: MenuItem, x: number, y: number, w: number, h: number, focused: boolean, hover: boolean, press: number, hits: HitMap, index: number, track: { x: number; w: number }) {
  if (item.kind === "action") {
    pill(g, x, y, w, h, item.label, { focused, hover, disabled: item.disabled, press });
    if (item.swatch) swatch(g, x + h * 0.62, y + h / 2 - (focused ? 2 : 0) + press * 2, h * 0.22, item.swatch);
    return;
  }
  // A row of glass with the label on the left and the value on the right.
  pill(g, x, y, w, h, "", { focused: false, hover, color: "glass", disabled: item.disabled });
  const mid = y + h / 2 + 1;
  text(g, item.label, x + 22, mid, { size: Math.round(h * 0.4), color: INK, baseline: "middle" });
  const right = x + w - 22;
  if (item.kind === "choice") {
    const label = item.options[item.index].label;
    const vx = right - 96;
    chevron(g, vx - 64, mid, -1, item.index > 0);
    chevron(g, right - 10, mid, 1, item.index < item.options.length - 1);
    text(g, label, (vx - 64 + right - 10) / 2, mid, { size: Math.round(h * 0.38), color: focused ? "#0a6fc0" : INK, align: "center", baseline: "middle" });
    hits.add(MENU_HITS.step, vx - 64 - 20, y, 40, h, index, -1);
    hits.add(MENU_HITS.step, right - 30, y, 40, h, index, 1);
  } else {
    const k = (item.value - item.min) / (item.max - item.min);
    slider(g, track.x, mid, track.w, k, focused);
    text(g, String(Math.round(item.value)), right, mid, { size: Math.round(h * 0.36), color: INK, align: "right", baseline: "middle" });
    hits.add(MENU_HITS.track, track.x - 14, y, track.w + 28, h, index);
  }
}

/** A dot of colour, ringed so that a pale one shows on the glass. */
function swatch(g: CanvasRenderingContext2D, x: number, y: number, r: number, colour: string) {
  g.save();
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = colour;
  g.fill();
  g.lineWidth = Math.max(1, r * 0.22);
  g.strokeStyle = "rgba(20, 40, 70, 0.45)";
  g.stroke();
  g.restore();
}

/** A narrow row: an action as ever; a choice's or slider's label small on top, its value under it, the width of the row. */
function drawStacked(g: CanvasRenderingContext2D, item: MenuItem, x: number, y: number, w: number, h: number, focused: boolean, hover: boolean, press: number, hits: HitMap, index: number, track: { x: number; w: number }) {
  if (item.kind === "action") {
    const ph = Math.min(h, 42);
    pill(g, x, y + (h - ph) / 2, w, ph, item.label, { focused, hover, disabled: item.disabled, press });
    if (item.swatch) swatch(g, x + ph * 0.62, y + h / 2 - (focused ? 2 : 0) + press * 2, ph * 0.22, item.swatch);
    return;
  }
  pill(g, x, y, w, h, "", { focused: false, hover, color: "glass", disabled: item.disabled });
  text(g, item.label, x + 22, y + h * 0.3, { size: Math.round(h * 0.27), color: INK_SOFT, baseline: "middle" });
  const low = y + h * 0.66;
  if (item.kind === "choice") {
    chevron(g, x + 26, low, -1, item.index > 0);
    chevron(g, x + w - 26, low, 1, item.index < item.options.length - 1);
    text(g, item.options[item.index].label, x + w / 2, low, { size: Math.round(h * 0.3), color: focused ? "#0a6fc0" : INK, align: "center", baseline: "middle" });
    hits.add(MENU_HITS.step, x, y, 56, h, index, -1);
    hits.add(MENU_HITS.step, x + w - 56, y, 56, h, index, 1);
  } else {
    const k = (item.value - item.min) / (item.max - item.min);
    text(g, String(Math.round(item.value)), x + w - 22, y + h * 0.3, { size: Math.round(h * 0.27), color: INK, align: "right", baseline: "middle" });
    slider(g, track.x, low, track.w, k, focused);
    hits.add(MENU_HITS.track, track.x - 14, y + h * 0.4, track.w + 28, h * 0.6, index);
  }
}
