// Draws a Menu (packages/ui) as a column of glossy rows: actions as jelly
// buttons, choices with their value between chevrons, sliders as glossy
// tracks. The soap-bubble ring glides to the focused row. On a narrow screen
// a choice or a slider puts its value under its label. Every row, chevron,
// track and "more" is recorded where it is drawn, for a pointer.

import { Eased, INK, INK_SOFT, bubbleRing, chevron, pill, slider, text } from "@fly/ui";
import type { HitMap, Menu, MenuItem } from "@fly/ui";

export type MenuLayout = { x: number; y: number; width: number; row: number; gap: number; compact?: boolean };

/** What a menu's targets are, as recorded in the hit map: `index` is the item's, `value` a chevron's or a "more"'s direction. */
export const MENU_HITS = { row: "row", step: "step", track: "track", more: "more" } as const;

/** The slider's track, from the row's right edge: where it starts and how long it is. */
const TRACK = { from: 170, length: 140 };

export class MenuView {
  readonly menu: Menu;
  layout: MenuLayout;
  /** Where a slider's track runs across its row, for turning a point on it into a value: worked out with the layout. */
  readonly track = { x: 0, w: 0 };
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

  draw(g: CanvasRenderingContext2D, t: number, hits: HitMap) {
    const { x, width, row } = this.layout;
    const menu = this.menu;
    const end = Math.min(menu.items.length, menu.scroll + menu.rows);
    for (let i = menu.scroll; i < end; i++) {
      const item = menu.items[i];
      const y = this.#rowY(this.#visibleIndex(i));
      const focused = i === menu.focus;
      hits.add(MENU_HITS.row, x, y, width, row, i);
      if (this.layout.compact) drawStacked(g, item, x, y, width, row, focused, focused ? this.#press.value : 0, hits, i, this.track);
      else drawItem(g, item, x, y, width, row, focused, focused ? this.#press.value : 0, hits, i, this.track);
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
    if (focused) bubbleRing(g, x, this.#ring.value - (focused.kind === "action" ? 2 : 0), width, row, row / 2, t);
  }
}

function drawItem(g: CanvasRenderingContext2D, item: MenuItem, x: number, y: number, w: number, h: number, focused: boolean, press: number, hits: HitMap, index: number, track: { x: number; w: number }) {
  if (item.kind === "action") {
    pill(g, x, y, w, h, item.label, { focused, disabled: item.disabled, press });
    return;
  }
  // A row of glass with the label on the left and the value on the right.
  pill(g, x, y, w, h, "", { focused: false, color: "glass", disabled: item.disabled });
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

/** A narrow row: an action as ever; a choice's or slider's label small on top, its value under it, the width of the row. */
function drawStacked(g: CanvasRenderingContext2D, item: MenuItem, x: number, y: number, w: number, h: number, focused: boolean, press: number, hits: HitMap, index: number, track: { x: number; w: number }) {
  if (item.kind === "action") {
    const ph = Math.min(h, 42);
    pill(g, x, y + (h - ph) / 2, w, ph, item.label, { focused, disabled: item.disabled, press });
    return;
  }
  pill(g, x, y, w, h, "", { focused: false, color: "glass", disabled: item.disabled });
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
