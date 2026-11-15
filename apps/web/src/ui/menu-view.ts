// Draws a Menu (packages/ui) as a column of glossy rows: actions as jelly
// buttons, choices with their value between chevrons, sliders as glossy
// tracks. The soap-bubble ring glides to the focused row.

import { Eased, INK, INK_SOFT, bubbleRing, chevron, pill, slider, text } from "@fly/ui";
import type { Menu, MenuItem } from "@fly/ui";

export type MenuLayout = { x: number; y: number; width: number; row: number; gap: number };

export class MenuView {
  readonly menu: Menu;
  readonly layout: MenuLayout;
  #ring = new Eased(0, 18);
  #press = new Eased(0, 12);

  constructor(menu: Menu, layout: MenuLayout) {
    this.menu = menu;
    this.layout = layout;
    this.#ring.snap(this.#rowY(this.#visibleIndex(menu.focus)));
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

  draw(g: CanvasRenderingContext2D, t: number) {
    const { x, width, row } = this.layout;
    const menu = this.menu;
    const end = Math.min(menu.items.length, menu.scroll + menu.rows);
    for (let i = menu.scroll; i < end; i++) {
      const item = menu.items[i];
      const y = this.#rowY(this.#visibleIndex(i));
      const focused = i === menu.focus;
      drawItem(g, item, x, y, width, row, focused, focused ? this.#press.value : 0);
    }
    // At the list's right edge, clear of a heading centred over it.
    if (menu.scroll > 0) text(g, "▲ more", x + width - 4, this.#rowY(0) - 8, { size: 11, align: "right", color: INK_SOFT });
    if (end < menu.items.length) text(g, "▼ more", x + width - 4, this.#rowY(menu.rows) + 6, { size: 11, align: "right", color: INK_SOFT });
    const focused = menu.focused;
    if (focused) bubbleRing(g, x, this.#ring.value - (focused.kind === "action" ? 2 : 0), width, row, row / 2, t);
  }
}

function drawItem(g: CanvasRenderingContext2D, item: MenuItem, x: number, y: number, w: number, h: number, focused: boolean, press: number) {
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
  } else {
    const k = (item.value - item.min) / (item.max - item.min);
    slider(g, right - 170, mid, 140, k, focused);
    text(g, String(Math.round(item.value)), right, mid, { size: Math.round(h * 0.36), color: INK, align: "right", baseline: "middle" });
  }
}
