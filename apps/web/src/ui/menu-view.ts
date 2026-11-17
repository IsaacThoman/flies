// Draws a Menu (packages/ui) as a column of glossy rows: actions as jelly
// buttons (with, for a room, its place's colour, its flies as pips and a
// padlock), choices with their value between chevrons (or, as tabs, all their
// options side by side), sliders as glossy tracks, fields as what is typed
// in them, with a caret while it is. The soap-bubble ring
// glides to the focused row, for the remote, a keyboard and a pad; for a
// mouse or a finger there is no ring, and what the mouse is over only
// brightens a little. On a narrow screen a choice or a slider puts its value
// under its label; where one column of the menu's rows doesn't fit, its
// actions are in two, filled one after the other. Every row, chevron, tab,
// track and "more" is recorded where it is drawn, for a pointer.

import { Eased, INK, INK_SOFT, bubbleRing, chevron, font, pill, slider, text } from "@fly/ui";
import type { ActionItem, ChoiceItem, FieldItem, HitMap, Menu, MenuItem } from "@fly/ui";

/** `columns`: how many columns the rows are in (1 unless they don't fit in one). */
export type MenuLayout = { x: number; y: number; width: number; row: number; gap: number; compact?: boolean; columns?: number };

/** Between columns, design units. */
const COLUMN_GAP = 12;

/** What a menu's targets are, as recorded in the hit map: `index` is the item's, `value` a chevron's or a "more"'s direction. */
export const MENU_HITS = { row: "row", step: "step", track: "track", more: "more", tab: "tab" } as const;

/** The slider's track, from the row's right edge: where it starts and how long it is. */
const TRACK = { from: 170, length: 140 };

/** The field being typed into, by its item's index (-1: none), and where its caret is (characters into its value). */
export type Typing = { index: number; caret: number };

export class MenuView {
  readonly menu: Menu;
  layout: MenuLayout;
  /** Where a slider's track runs across its row, for turning a point on it into a value: worked out with the layout. */
  readonly track = { x: 0, w: 0 };
  /** Room (design units) kept clear at the left of a row of tabs, for the back button beside them. */
  tabInset = 0;
  readonly typing: Typing = { index: -1, caret: 0 };
  #ring = new Eased(0, 18);
  #ringX = new Eased(0, 18);
  /** Where a visible row goes: its left edge, top and width. */
  readonly #cell = { x: 0, y: 0, width: 0 };
  #press = new Eased(0, 12);

  constructor(menu: Menu, layout: MenuLayout) {
    this.menu = menu;
    this.layout = layout;
    this.#placeTrack();
    this.#snapRing();
  }

  /** Lays it out somewhere else (the screen changed shape): the ring goes straight there. */
  place(layout: MenuLayout) {
    this.layout = layout;
    this.#placeTrack();
    this.#snapRing();
  }

  #snapRing() {
    const cell = this.#at(this.#visibleIndex(this.menu.focus));
    this.#ring.snap(cell.y);
    this.#ringX.snap(cell.x);
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

  /** Rows to a column. */
  get #perColumn() {
    return Math.ceil(Math.min(this.menu.items.length, this.menu.rows) / (this.layout.columns ?? 1));
  }

  /** Where the `visible`th row shown goes (reused: read it before asking again). */
  #at(visible: number) {
    const { x, width } = this.layout;
    const columns = this.layout.columns ?? 1;
    const cell = this.#cell;
    const per = this.#perColumn;
    const column = columns > 1 ? Math.floor(visible / per) : 0;
    cell.width = (width - COLUMN_GAP * (columns - 1)) / columns;
    cell.x = x + column * (cell.width + COLUMN_GAP);
    cell.y = this.#rowY(columns > 1 ? visible % per : visible);
    return cell;
  }

  /** Eases the ring; true while it is still moving. */
  update(dt: number): boolean {
    const cell = this.#at(this.#visibleIndex(this.menu.focus));
    this.#ring.target = cell.y;
    this.#ringX.target = cell.x;
    const a = this.#ring.update(dt);
    const b = this.#ringX.update(dt);
    const c = this.#press.update(dt);
    return a || b || c;
  }

  /** The vertical extent the menu takes. */
  get height() {
    const { row, gap } = this.layout;
    return this.#perColumn * (row + gap) - gap;
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
    // In columns, the actions' words as big as the narrowest fits, all alike.
    let size: number | undefined;
    if ((this.layout.columns ?? 1) > 1) {
      const most = Math.round(row * 0.46);
      const room = this.#at(0).width - row * 0.6;
      g.font = font(most);
      size = most;
      for (let i = menu.scroll; i < end; i++) size = Math.min(size, Math.floor((most * room) / g.measureText(menu.items[i].label).width));
    }
    for (let i = menu.scroll; i < end; i++) {
      const item = menu.items[i];
      const { x, y, width } = this.#at(this.#visibleIndex(i));
      const focused = ring && i === menu.focus;
      const press = i === menu.focus ? this.#press.value : 0;
      hits.add(MENU_HITS.row, x, y, width, row, i, 0, item.id);
      const caret = i === this.typing.index ? this.typing.caret : -1;
      if (item.kind === "choice" && item.tabs) drawTabs(g, item, x + this.tabInset, y, width - this.tabInset, row, hits, i);
      else if (item.kind === "field") drawField(g, item, x, y, width, row, focused, i === hover, caret, t, !!this.layout.compact);
      else if (this.layout.compact) drawStacked(g, item, x, y, width, row, focused, i === hover, press, hits, i, this.track);
      else drawItem(g, item, x, y, width, row, focused, i === hover, press, hits, i, this.track, size);
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
    const cell = this.#at(0);
    if (focused && ring) bubbleRing(g, this.#ringX.value + inset, this.#ring.value - (focused.kind === "action" ? 2 : 0), cell.width - inset, row, row / 2, t);
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
    hits.add(MENU_HITS.step, x, y, 44, h, index, -1, item.id);
    hits.add(MENU_HITS.step, x + w - 44, y, 44, h, index, 1, item.id);
    return;
  }
  for (let k = 0; k < n; k++) {
    const tx = x + k * (tw + gap);
    pill(g, tx, y + (h - th) / 2, tw, th, item.options[k].label, { color: k === item.index ? "aqua" : "glass", disabled: item.disabled, size });
    hits.add(MENU_HITS.tab, tx, y, tw, h, index, k, item.id);
  }
}

/** An action's jelly button, with whatever marks it: its swatch at the left, its pips and padlock (or globe) at the right, its words between them. */
function drawAction(g: CanvasRenderingContext2D, item: ActionItem, x: number, y: number, w: number, h: number, focused: boolean, hover: boolean, press: number, size?: number) {
  const mid = y + h / 2 - (focused ? 2 : 0) + press * 2;
  const marks = item.count || item.locked || item.everyone;
  // Clear of the marks on both sides, the words centred, smaller if they must be.
  let words = size;
  if (marks) {
    const room = w - 2 * (h * 0.4 + PIPS.width + (item.locked || item.everyone ? h * 0.5 : 0));
    const most = size ?? Math.round(h * 0.46);
    g.font = font(most);
    words = Math.max(8, Math.min(most, Math.floor((most * room) / Math.max(1, g.measureText(item.label).width))));
  }
  pill(g, x, y, w, h, item.label, { focused, hover, disabled: item.disabled, press, size: words });
  if (item.swatch) swatch(g, x + h * 0.62, mid, h * 0.22, item.swatch);
  if (!marks) return;
  const ink = focused ? "#ffffff" : INK;
  let right = x + w - h * 0.4;
  if (item.count) {
    pips(g, right - PIPS.width, mid, item.count[0], item.count[1], ink, item.disabled);
    right -= PIPS.width + h * 0.18;
  }
  if (item.locked) padlock(g, right - h * 0.16, mid, h * 0.3, ink, item.disabled);
  else if (item.everyone) globe(g, right - h * 0.16, mid, h * 0.3, ink, item.disabled);
}

/** A room open to everyone: a globe, its equator and a meridian. */
function globe(g: CanvasRenderingContext2D, x: number, y: number, s: number, ink: string, disabled = false) {
  const r = s * 0.48;
  g.save();
  if (disabled) g.globalAlpha *= 0.45;
  g.strokeStyle = ink;
  g.lineWidth = Math.max(1.2, s * 0.11);
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.moveTo(x - r, y);
  g.lineTo(x + r, y);
  g.moveTo(x, y - r);
  g.ellipse(x, y, r * 0.45, r, 0, -Math.PI / 2, Math.PI * 1.5);
  g.stroke();
  g.restore();
}

/** How many of how many, as two rows of small dots: those there filled. */
const PIPS = { width: 34, r: 2.6, step: 8.5 };
function pips(g: CanvasRenderingContext2D, x: number, y: number, n: number, of: number, ink: string, disabled = false) {
  const across = Math.ceil(of / 2);
  g.save();
  if (disabled) g.globalAlpha *= 0.45;
  g.lineWidth = 1.2;
  for (let i = 0; i < of; i++) {
    const px = x + PIPS.r + (i % across) * PIPS.step;
    const py = y + (i < across ? -1 : 1) * (PIPS.step / 2);
    g.beginPath();
    g.arc(px, py, PIPS.r, 0, Math.PI * 2);
    if (i < n) {
      g.fillStyle = ink;
      g.fill();
    } else {
      g.strokeStyle = ink;
      g.globalAlpha *= 0.5;
      g.stroke();
      g.globalAlpha /= 0.5;
    }
  }
  g.restore();
}

/** A padlock `s` tall, centred on (x, y). */
function padlock(g: CanvasRenderingContext2D, x: number, y: number, s: number, ink: string, disabled = false) {
  g.save();
  if (disabled) g.globalAlpha *= 0.45;
  const bw = s * 0.8, bh = s * 0.55;
  g.strokeStyle = ink;
  g.fillStyle = ink;
  g.lineWidth = Math.max(1.4, s * 0.13);
  g.beginPath();
  g.arc(x, y - bh / 2 + s * 0.02, bw * 0.3, Math.PI, 0);
  g.lineTo(x + bw * 0.3, y - bh / 2 + s * 0.08);
  g.moveTo(x - bw * 0.3, y - bh / 2 + s * 0.08);
  g.lineTo(x - bw * 0.3, y - bh / 2 + s * 0.02);
  g.stroke();
  g.beginPath();
  g.rect(x - bw / 2, y - bh / 2 + s * 0.08, bw, bh);
  g.fill();
  g.restore();
}

/**
 * A field: its label at the left, what is typed in it at the right (dots, for
 * a secret), or its placeholder, softly, when it is empty and not being
 * typed into; a blinking caret while it is. Narrow, the label is over the
 * value, as a choice's is.
 */
function drawField(g: CanvasRenderingContext2D, item: FieldItem, x: number, y: number, w: number, h: number, focused: boolean, hover: boolean, caret: number, t: number, compact: boolean) {
  const typing = caret >= 0;
  pill(g, x, y, w, h, "", { focused: false, hover: hover || typing, color: "glass", disabled: item.disabled });
  const mid = compact ? y + h * 0.66 : y + h / 2 + 1;
  const labelSize = Math.round(h * (compact ? 0.27 : 0.4));
  text(g, item.label, x + 22, compact ? y + h * 0.3 : mid, { size: labelSize, color: compact ? INK_SOFT : INK, baseline: "middle" });
  g.font = font(labelSize);
  const left = compact ? x + 22 : x + 22 + g.measureText(item.label).width + 18;
  const right = x + w - 22;
  const room = right - left;
  const shown = item.secret ? "•".repeat([...item.value].length) : item.value;
  const before = item.secret ? "•".repeat([...item.value.slice(0, Math.max(0, caret))].length) : item.value.slice(0, Math.max(0, caret));
  const most = Math.round(h * (compact ? 0.3 : 0.38));
  if (!shown && !typing) {
    if (item.placeholder) text(g, item.placeholder, right, mid, { size: most, color: INK_SOFT, align: "right", baseline: "middle" });
    return;
  }
  // As large as fits, down to a little smaller; past that, its start is left off, so the caret's end shows.
  g.font = font(most);
  const size = Math.max(Math.round(most * 0.7), Math.min(most, Math.floor((most * room) / Math.max(1, g.measureText(shown).width))));
  g.font = font(size);
  let value = shown;
  let lead = before;
  while (value.length > 1 && g.measureText(`…${value}`).width > room && lead.length > 0) {
    value = value.slice(1);
    lead = lead.slice(1);
  }
  if (value !== shown) {
    value = `…${value}`;
    lead = `…${lead}`;
  }
  const color = focused || typing ? "#0a6fc0" : INK;
  text(g, value, right, mid, { size, color, align: "right", baseline: "middle" });
  if (!typing || Math.floor(t * 2) % 2 === 1) return;
  const cx = right - g.measureText(value).width + g.measureText(lead).width + 1;
  g.fillStyle = "#0a6fc0";
  g.fillRect(Math.round(cx), mid - size * 0.6, 2, size * 1.2);
}

/** `size`: an action's words, where not the pill's own. */
function drawItem(g: CanvasRenderingContext2D, item: MenuItem, x: number, y: number, w: number, h: number, focused: boolean, hover: boolean, press: number, hits: HitMap, index: number, track: { x: number; w: number }, size?: number) {
  if (item.kind === "action") {
    drawAction(g, item, x, y, w, h, focused, hover, press, size);
    return;
  }
  if (item.kind === "field") return;
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
    hits.add(MENU_HITS.step, vx - 64 - 20, y, 40, h, index, -1, item.id);
    hits.add(MENU_HITS.step, right - 30, y, 40, h, index, 1, item.id);
  } else {
    const k = (item.value - item.min) / (item.max - item.min);
    slider(g, track.x, mid, track.w, k, focused);
    text(g, String(Math.round(item.value)), right, mid, { size: Math.round(h * 0.36), color: INK, align: "right", baseline: "middle" });
    hits.add(MENU_HITS.track, track.x - 14, y, track.w + 28, h, index, 0, item.id);
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
    drawAction(g, item, x, y + (h - ph) / 2, w, ph, focused, hover, press);
    return;
  }
  if (item.kind === "field") return;
  pill(g, x, y, w, h, "", { focused: false, hover, color: "glass", disabled: item.disabled });
  text(g, item.label, x + 22, y + h * 0.3, { size: Math.round(h * 0.27), color: INK_SOFT, baseline: "middle" });
  const low = y + h * 0.66;
  if (item.kind === "choice") {
    chevron(g, x + 26, low, -1, item.index > 0);
    chevron(g, x + w - 26, low, 1, item.index < item.options.length - 1);
    text(g, item.options[item.index].label, x + w / 2, low, { size: Math.round(h * 0.3), color: focused ? "#0a6fc0" : INK, align: "center", baseline: "middle" });
    hits.add(MENU_HITS.step, x, y, 56, h, index, -1, item.id);
    hits.add(MENU_HITS.step, x + w - 56, y, 56, h, index, 1, item.id);
  } else {
    const k = (item.value - item.min) / (item.max - item.min);
    text(g, String(Math.round(item.value)), x + w - 22, y + h * 0.3, { size: Math.round(h * 0.27), color: INK, align: "right", baseline: "middle" });
    slider(g, track.x, low, track.w, k, focused);
    hits.add(MENU_HITS.track, track.x - 14, y + h * 0.4, track.w + 28, h * 0.6, index, 0, item.id);
  }
}
