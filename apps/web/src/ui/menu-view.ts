// Draws a Menu (packages/ui) as a column of rows, each drawn as what it is:
//
// - an action is a glossy jelly button, with its picture on a glass bead at
//   its left; the one most players came for is green; a quiet one is only
//   its words (how things stand, not something to press);
// - an entry of a list (a room) is a flat plate: its place's colour, its name
//   and where it is at the left, a padlock or a globe and its flies at the
//   right;
// - a choice is a plate with its name at the left and, at the right, every
//   option side by side with the chosen one raised (a switch, for off and
//   on); only where they don't fit, the one chosen between arrows, over a dot
//   for each;
// - a choice drawn as tabs is its options across the top of the page;
// - a field is a plate with a well for what is typed in it, and a caret while
//   it is.
//
// The soap-bubble ring glides to the focused row, for the remote, a keyboard
// and a pad, and that row turns white; for a mouse or a finger there is no
// ring, and what the mouse is over only brightens a little. On a narrow
// screen a choice or a field puts its value under its name; where one column
// of the menu's rows doesn't fit, its actions are in two, filled one after the
// other. A list longer than its pane slides under it, with a bar at its right
// saying how far down it is. Every row, arrow, option, track and button is
// recorded where it is drawn, for a pointer.

import { Eased, INK, INK_SOFT, PLATE_RADIUS, SWITCH, bubbleRing, chevron, drawIcon, fitText, font, orb, pill, plate, scrollbar, slider, thumb, toggle, well } from "@fly/ui";
import type { ActionItem, ChoiceItem, FieldItem, HitMap, Menu, SliderItem } from "@fly/ui";

/** `columns`: how many columns the rows are in (1 unless they don't fit in one). */
export type MenuLayout = { x: number; y: number; width: number; row: number; gap: number; compact?: boolean; columns?: number };

/** Between columns, design units. */
const COLUMN_GAP = 12;
const LIT = "#ffffff";
const LIT_EDGE = "rgba(0, 60, 120, 0.55)";
const ACCENT = "#0a6fc0";

/** What a menu's targets are, as recorded in the hit map: `index` is the item's, `value` an arrow's direction, or which tab or option. */
export const MENU_HITS = { row: "row", step: "step", track: "track", tab: "tab", option: "option", submit: "submit" } as const;

/** The slider's track, from the row's right edge: where it starts and how long it is. */
const TRACK = { from: 170, length: 140 };
/** The share of a wide row its control takes, at the right. */
const CONTROL = 0.56;

/** The field being typed into, by its item's index (-1: none), and where its caret is (characters into its value). */
export type Typing = { index: number; caret: number };
/** Options side by side in a width: how big their words are, and how wide each is. */
type Segments = { width: number; most: number; size: number; widths: Float64Array };
/** A rectangle reused between calls: read it before asking again. */
type Box = { x: number; y: number; w: number; h: number; r: number };

/** The smallest an option's word is drawn (design units); narrower, the options become the one chosen between arrows. */
const SMALLEST_OPTION = 12;

function write(g: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = "left", weight = 700) {
  g.font = font(size, weight);
  g.textAlign = align;
  g.textBaseline = "middle";
  g.fillStyle = color;
  g.fillText(value, x, y);
}

/** White words on something lit, edged so they read on the lightest of it. */
function writeLit(g: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, align: CanvasTextAlign = "center") {
  g.font = font(size);
  g.textAlign = align;
  g.textBaseline = "middle";
  g.lineJoin = "round";
  g.lineWidth = 3;
  g.strokeStyle = LIT_EDGE;
  g.strokeText(value, x, y);
  g.fillStyle = LIT;
  g.fillText(value, x, y);
}

export class MenuView {
  readonly menu: Menu;
  layout: MenuLayout;
  /** Where a slider's track runs across its row, for turning a point on it into a value: worked out with the layout. */
  readonly track = { x: 0, w: 0 };
  /** Room (design units) kept clear at the left of a row of tabs, for the back button beside them. */
  tabInset = 0;
  /** The narrowest a finger can press (design units), or 0 where nothing is pressed with one: options narrower than this become arrows. */
  finger = 0;
  readonly typing: Typing = { index: -1, caret: 0 };
  #ring = new Eased(0, 18);
  #ringX = new Eased(0, 18);
  /** How far down the list is, rows: eased, so a list slides rather than jumps. */
  #scroll = new Eased(0, 16);
  /** Where a visible row goes: its left edge, top and width. */
  readonly #cell = { x: 0, y: 0, width: 0 };
  readonly #box: Box = { x: 0, y: 0, w: 0, h: 0, r: 0 };
  #press = new Eased(0, 12);
  /** Each choice's options, measured once for the width they have. */
  readonly #segments = new WeakMap<object, Segments>();

  constructor(menu: Menu, layout: MenuLayout) {
    this.menu = menu;
    this.layout = layout;
    this.#placeTrack();
    this.#snap();
  }

  /** Lays it out somewhere else (the screen changed shape): the ring goes straight there. */
  place(layout: MenuLayout) {
    this.layout = layout;
    this.#placeTrack();
    this.#snap();
  }

  #snap() {
    this.#scroll.snap(this.menu.scroll);
    const box = this.#bounds(this.menu.focus);
    this.#ring.snap(box.y);
    this.#ringX.snap(box.x);
  }

  /** Call after the focus moves or a value changes. */
  pressed() {
    this.#press.snap(1);
    this.#press.target = 0;
  }

  #visibleIndex(i: number) {
    return i < this.menu.pinned ? i : i - this.menu.scroll;
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

  /** What the item at `i` is drawn as, where it rests: a button's jelly (shorter than a tall row), a row's plate, or the tabs clear of the back button. */
  #bounds(i: number): Box {
    const item = this.menu.items[i];
    const { x, y, width } = this.#at(this.#visibleIndex(i));
    const { row, compact } = this.layout;
    const box = this.#box;
    box.x = x;
    box.y = y;
    box.w = width;
    box.h = row;
    box.r = PLATE_RADIUS;
    if (item?.kind === "action" && !item.count) {
      box.h = compact ? Math.min(row, 42) : row;
      box.y = y + (row - box.h) / 2;
      box.r = box.h / 2;
    } else if (item?.kind === "choice" && item.tabs) {
      box.h = Math.min(row, 40);
      box.y = y + (row - box.h) / 2;
      box.x = x + this.tabInset;
      box.w = width - this.tabInset;
      box.r = box.h / 2;
    }
    return box;
  }

  /** Eases the ring and the list; true while either is still moving. */
  update(dt: number): boolean {
    const box = this.#bounds(this.menu.focus);
    this.#ring.target = box.y;
    this.#ringX.target = box.x;
    this.#scroll.target = this.menu.scroll;
    const a = this.#ring.update(dt);
    const b = this.#ringX.update(dt);
    const c = this.#press.update(dt);
    const d = this.#scroll.update(dt);
    return a || b || c || d;
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

  /** A choice's options side by side in `w`, their words `most` at the biggest: measured when the width or the options change. */
  #measure(g: CanvasRenderingContext2D, item: ChoiceItem, w: number, most: number, padding: number, gap: number): Segments {
    const n = item.options.length;
    let s = this.#segments.get(item.options);
    if (!s) this.#segments.set(item.options, (s = { width: -1, most: -1, size: 0, widths: new Float64Array(n) }));
    if (s.width === w && s.most === most) return s;
    s.width = w;
    s.most = most;
    g.font = font(most);
    let words = 0;
    for (let k = 0; k < n; k++) {
      const width = g.measureText(item.options[k].label).width;
      s.widths[k] = width;
      words += width;
    }
    const room = w - gap * (n - 1) - padding * n;
    s.size = Math.min(most, Math.floor((most * room) / Math.max(1, words)));
    const extra = (room - (words * s.size) / most) / n;
    for (let k = 0; k < n; k++) s.widths[k] = (s.widths[k] * s.size) / most + padding + extra;
    return s;
  }

  /** Whether every option can be read, and pressed, side by side. */
  #fits(s: Segments) {
    if (s.size < SMALLEST_OPTION) return false;
    for (let k = 0; k < s.widths.length; k++) if (s.widths[k] < this.finger) return false;
    return true;
  }

  /** `ring`: show the focus (the remote's, the keys', a pad's); `hover`: the item a mouse is over, or -1. */
  draw(g: CanvasRenderingContext2D, t: number, hits: HitMap, ring = true, hover = -1) {
    const { x, width, row, gap } = this.layout;
    const menu = this.menu;
    const pinned = menu.pinned;
    const end = Math.min(menu.items.length, menu.scroll + menu.rows);
    // In columns, the actions' words as big as the narrowest fits, all alike.
    let size: number | undefined;
    if ((this.layout.columns ?? 1) > 1) {
      const most = Math.round(row * 0.46);
      const room = this.#at(0).width - row * 2;
      size = most;
      for (let i = menu.scroll; i < end; i++) size = Math.min(size, fitText(g, menu.items[i], menu.items[i].label, room, most).size);
    }
    const scrolls = menu.items.length > menu.rows;
    const top = this.#rowY(pinned);
    const bottom = this.#rowY(menu.rows - 1) + row;
    for (let i = 0; i < pinned; i++) this.#drawItem(g, t, hits, i, ring, hover, size, true);
    // A list on its way somewhere shows the rows it is passing, cut off at its window's edges; each is recorded where it comes to rest.
    const sliding = scrolls && this.#scroll.value !== menu.scroll;
    if (sliding) {
      g.save();
      g.beginPath();
      g.rect(x - 8, top - 3, width + 16, bottom - top + 6);
      g.clip();
      g.translate(0, (menu.scroll - this.#scroll.value) * (row + gap));
    }
    // From where it was to where it will rest: every row that shows on the way.
    const from = sliding ? Math.max(pinned, Math.floor(Math.min(this.#scroll.value, menu.scroll)) + pinned) : menu.scroll + pinned;
    const to = sliding ? Math.min(menu.items.length, Math.ceil(Math.max(this.#scroll.value, menu.scroll)) + menu.rows) : end;
    for (let i = from; i < to; i++) {
      const visible = i - menu.scroll;
      this.#drawItem(g, t, hits, i, ring, hover, size, visible >= pinned && visible < menu.rows);
    }
    if (sliding) g.restore();
    if (scrolls) scrollbar(g, x + width + 5, top + 4, bottom - top - 8, menu.scroll / Math.max(1, menu.items.length - menu.rows), (menu.rows - pinned) / (menu.items.length - pinned));
    if (!menu.focused || !ring) return;
    const box = this.#bounds(menu.focus);
    bubbleRing(g, this.#ringX.value + 4, this.#ring.value + 4, box.w - 8, box.h - 8, Math.max(2, box.r - 4), t);
  }

  /** `shown`: at rest in the list's window, so it can be pressed; a row sliding past can't. */
  #drawItem(g: CanvasRenderingContext2D, t: number, hits: HitMap, i: number, ring: boolean, hover: number, size: number | undefined, shown: boolean) {
    const menu = this.menu;
    const item = menu.items[i];
    const { row } = this.layout;
    const { x, y, width } = this.#at(this.#visibleIndex(i));
    const focused = ring && i === menu.focus;
    const over = i === hover;
    const press = i === menu.focus ? this.#press.value : 0;
    const compact = !!this.layout.compact;
    const record = shown ? hits : null;
    record?.add(MENU_HITS.row, x, y, width, row, i, 0, item.id);
    if (item.kind === "action") {
      if (item.quiet) write(g, item.label, x + width / 2, y + row / 2, Math.min(15, Math.round(row * 0.36)), INK_SOFT, "center", 400);
      else if (item.count) drawEntry(g, item, x, y, width, row, focused, over);
      else {
        const h = compact ? Math.min(row, 42) : row;
        drawAction(g, item, x, y + (row - h) / 2, width, h, focused, over, press, size);
      }
    } else if (item.kind === "field") drawField(g, item, x, y, width, row, focused, over, i === this.typing.index ? this.typing.caret : -1, t, compact, record, i);
    else if (item.kind === "slider") drawSlider(g, item, x, y, width, row, focused, over, compact, record, i, this.track);
    else if (item.tabs) this.#drawTabs(g, item, x + this.tabInset, y, width - this.tabInset, row, record, i);
    else this.#drawChoice(g, item, x, y, width, row, focused, over, compact, record, i);
  }

  /** A choice as tabs: its options across the page in one track, the chosen one lit. */
  #drawTabs(g: CanvasRenderingContext2D, item: ChoiceItem, x: number, y: number, w: number, h: number, hits: HitMap | null, index: number) {
    const n = item.options.length;
    const th = Math.min(h, 40);
    const y0 = y + (h - th) / 2;
    const mid = y0 + th / 2;
    const most = Math.round(th * 0.46);
    const s = this.#measure(g, item, w - 6, most, 16, 2);
    g.save();
    if (item.disabled) g.globalAlpha *= 0.45;
    well(g, x, y0, w, th, th / 2);
    if (!this.#fits(s)) {
      // Too narrow for every tab to be read: the one chosen, between arrows that step along them, as a choice is.
      thumb(g, x + 3, y0 + 3, w - 6, th - 6, th / 2 - 3, true);
      writeLit(g, item.options[item.index].label, x + w / 2, mid + 1, Math.min(most, 16));
      chevron(g, x + 20, mid, -1, item.index > 0);
      chevron(g, x + w - 20, mid, 1, item.index < n - 1);
      hits?.add(MENU_HITS.step, x, y, 44, h, index, -1, item.id);
      hits?.add(MENU_HITS.step, x + w - 44, y, 44, h, index, 1, item.id);
      g.restore();
      return;
    }
    let tx = x + 3;
    for (let k = 0; k < n; k++) {
      const tw = s.widths[k];
      if (k === item.index) {
        thumb(g, tx, y0 + 3, tw, th - 6, th / 2 - 3, true);
        writeLit(g, item.options[k].label, tx + tw / 2, mid + 1, s.size);
      } else write(g, item.options[k].label, tx + tw / 2, mid + 1, s.size, INK, "center");
      hits?.add(MENU_HITS.tab, tx, y, tw, h, index, k, item.id);
      tx += tw + 2;
    }
    g.restore();
  }

  /** A choice: its name, and its options side by side with the chosen one raised, a switch for off and on, or the one chosen between arrows. */
  #drawChoice(g: CanvasRenderingContext2D, item: ChoiceItem, x: number, y: number, w: number, h: number, focused: boolean, hover: boolean, compact: boolean, hits: HitMap | null, index: number) {
    plate(g, x, y, w, h, { focused, hover, disabled: item.disabled });
    g.save();
    if (item.disabled) g.globalAlpha *= 0.45;
    const n = item.options.length;
    const chosen = item.options[item.index].label;
    const mid = y + h / 2 + 1;
    if (item.toggle) {
      // A switch needs no second line, however narrow the row.
      const size = compact ? Math.min(17, Math.round(h * 0.32)) : Math.round(h * 0.4);
      write(g, item.label, x + 18, mid, fitText(g, item, item.label, w - 36 - SWITCH.w - 60, size, 10).size, INK);
      const sx = x + w - 12 - SWITCH.w / 2;
      toggle(g, sx, mid - 1, item.index > 0);
      write(g, chosen, sx - SWITCH.w / 2 - 10, mid, Math.round(size * 0.82), focused ? ACCENT : INK_SOFT, "right");
      g.restore();
      return;
    }
    // Wide, the name beside its control; narrow, over it.
    const cw = compact ? w - 16 : Math.round(w * CONTROL);
    const cx = x + w - 8 - cw;
    const ch = compact ? Math.round(h * 0.5) : h - 10;
    const cy = compact ? y + h - ch - 5 : y + 5;
    const cmid = cy + ch / 2;
    if (compact) write(g, item.label, x + 16, y + (h - ch - 5) / 2 + 2, Math.round(h * 0.26), INK_SOFT);
    else write(g, item.label, x + 18, mid, fitText(g, item, item.label, w - cw - 36, Math.round(h * 0.4), 10).size, INK);
    const s = this.#measure(g, item, cw - 6, Math.round(Math.min(ch * 0.5, 15)), 14, 2);
    if (n > 1 && this.#fits(s)) {
      well(g, cx, cy, cw, ch, ch / 2);
      let tx = cx + 3;
      for (let k = 0; k < n; k++) {
        const tw = s.widths[k];
        const label = item.options[k].label;
        if (k === item.index) {
          thumb(g, tx, cy + 3, tw, ch - 6, ch / 2 - 3, focused);
          if (focused) writeLit(g, label, tx + tw / 2, cmid + 1, s.size);
          else write(g, label, tx + tw / 2, cmid + 1, s.size, INK, "center");
        } else write(g, label, tx + tw / 2, cmid + 1, s.size, INK_SOFT, "center");
        hits?.add(MENU_HITS.option, tx, y, tw, h, index, k, item.id);
        tx += tw + 2;
      }
      g.restore();
      return;
    }
    // The one chosen between arrows, and a dot for each there is, where there is room under it.
    const dots = !compact && h >= 40 && n > 1 && n <= 8;
    chevron(g, cx + 14, cmid, -1, item.index > 0);
    chevron(g, cx + cw - 14, cmid, 1, item.index < n - 1);
    const most = Math.round(compact ? h * 0.3 : h * 0.38);
    write(g, chosen, cx + cw / 2, cmid + (dots ? -3 : 0), fitText(g, item.options[item.index], chosen, cw - 64, most, 10).size, focused ? ACCENT : INK, "center");
    if (dots) {
      const step = 8;
      let dx = cx + cw / 2 - ((n - 1) * step) / 2;
      for (let k = 0; k < n; k++) {
        g.beginPath();
        g.arc(dx, y + h - 8, k === item.index ? 2.4 : 1.6, 0, Math.PI * 2);
        g.fillStyle = k === item.index ? (focused ? ACCENT : INK) : "rgba(13, 59, 102, 0.35)";
        g.fill();
        dx += step;
      }
    }
    hits?.add(MENU_HITS.step, cx - 8, y, 44, h, index, -1, item.id);
    hits?.add(MENU_HITS.step, cx + cw - 36, y, 44, h, index, 1, item.id);
    g.restore();
  }
}

/** An action's jelly button: its picture on a glass bead at its left, its words in its middle (over a second line, if it has one), and any dots of colour it is about. */
function drawAction(g: CanvasRenderingContext2D, item: ActionItem, x: number, y: number, w: number, h: number, focused: boolean, hover: boolean, press: number, size?: number) {
  const mid = y + h / 2 - (focused ? 2 : 0) + press * 2;
  const lit = focused || !!item.primary;
  const most = size ?? Math.round(h * 0.46);
  // Clear of what is at its left, the words centred, smaller if they must be.
  const swatches = typeof item.swatch === "string" ? 1 : item.swatch?.length ?? 0;
  const aside = item.icon ? h : swatches ? h * (0.62 + swatches * 0.5) : h * 0.4;
  const words = size ?? fitText(g, item, item.label, w - 2 * aside, most).size;
  pill(g, x, y, w, h, "", { focused, hover, color: item.primary ? "green" : undefined, disabled: item.disabled, press });
  g.save();
  if (item.disabled) g.globalAlpha *= 0.45;
  const cx = x + w / 2;
  const ly = item.hint ? mid - 7 : mid + 1;
  if (lit) writeLit(g, item.label, cx, ly, words);
  else write(g, item.label, cx, ly, words, INK, "center");
  if (item.hint) write(g, item.hint, cx, mid + 12, 12, lit ? LIT : INK, "center");
  if (item.icon) {
    orb(g, x + h / 2, mid, h * 0.36, "glass");
    drawIcon(g, item.icon, x + h / 2, mid, h * 0.17, INK);
  }
  if (typeof item.swatch === "string") swatch(g, x + h * 0.62, mid, h * 0.22, item.swatch);
  else if (item.swatch) for (const [i, colour] of item.swatch.entries()) swatch(g, x + h * (0.62 + i * 0.5), mid, h * 0.2, colour);
  g.restore();
}

const COUNT_SIZE = 12;

/** An entry of a list, to go to (a room): its place's colour, its name and where it is, a padlock or a globe, and how many of how many are there. */
function drawEntry(g: CanvasRenderingContext2D, item: ActionItem, x: number, y: number, w: number, h: number, focused: boolean, hover: boolean) {
  plate(g, x, y, w, h, { focused, hover, disabled: item.disabled });
  g.save();
  if (item.disabled) g.globalAlpha *= 0.45;
  const mid = y + h / 2;
  let left = x + 16;
  if (typeof item.swatch === "string") {
    swatch(g, left + 6, mid, 7, item.swatch);
    left += 22;
  }
  let right = x + w - 14;
  if (item.countLabel && item.count) {
    write(g, item.countLabel, right, mid + 1, COUNT_SIZE, focused ? ACCENT : INK_SOFT, "right");
    right -= fitText(g, item.count, item.countLabel, w, COUNT_SIZE).width + 8;
  }
  if (item.locked || item.everyone) {
    drawIcon(g, item.locked ? "lock" : "online", right - 7, mid, 6.5, focused ? ACCENT : INK_SOFT);
    right -= 22;
  }
  const most = Math.min(18, Math.round(h * (item.hint ? 0.38 : 0.42)));
  write(g, item.label, left, item.hint ? mid - 7 : mid + 1, fitText(g, item, item.label, right - left, most, 10).size, focused ? ACCENT : INK);
  if (item.hint) write(g, item.hint, left, mid + 10, 11, INK_SOFT);
  g.restore();
}

/**
 * A field: its name at the left and, in a well at the right, what is typed
 * in it (dots, for a secret), or its placeholder, softly, when it is empty
 * and not being typed into; a blinking caret while it is, and the well ringed
 * in blue. Narrow, the name is over the well, as a choice's is.
 */
function drawField(g: CanvasRenderingContext2D, item: FieldItem, x: number, y: number, w: number, h: number, focused: boolean, hover: boolean, caret: number, t: number, compact: boolean, hits: HitMap | null, index: number) {
  const typing = caret >= 0;
  plate(g, x, y, w, h, { focused: focused || typing, hover, disabled: item.disabled });
  g.save();
  if (item.disabled) g.globalAlpha *= 0.45;
  const labelSize = Math.round(h * (compact ? 0.26 : 0.4));
  const wh = compact ? Math.round(h * 0.5) : h - 10;
  const wy = compact ? y + h - wh - 5 : y + 5;
  const mid = wy + wh / 2 + 1;
  write(g, item.label, x + (compact ? 16 : 18), compact ? y + (h - wh - 5) / 2 + 2 : mid, labelSize, compact ? INK_SOFT : INK);
  const left = compact ? x + 8 : x + 18 + fitText(g, item, item.label, w, labelSize).width + 14;
  const submit = item.submit;
  let right = x + w - 8;
  if (submit) {
    const bw = 58;
    const bh = Math.min(36, h - 6);
    const by = compact ? wy + (wh - bh) / 2 : y + (h - bh) / 2;
    pill(g, right - bw, by, bw, bh, submit.label, submit.disabled ? SUBMIT_DISABLED : SUBMIT);
    hits?.add(MENU_HITS.submit, right - bw, y, bw, h, index, 0, item.id);
    right -= bw + 6;
  }
  well(g, left, wy, right - left, wh, Math.min(10, wh / 2));
  if (typing) {
    g.lineWidth = 1.6;
    g.strokeStyle = ACCENT;
    g.stroke();
  }
  const tx = left + 10;
  const room = right - 10 - tx;
  const shown = item.secret ? "•".repeat([...item.value].length) : item.value;
  const before = item.secret ? "•".repeat([...item.value.slice(0, Math.max(0, caret))].length) : item.value.slice(0, Math.max(0, caret));
  const most = Math.round(compact ? h * 0.3 : h * 0.38);
  if (!shown && !typing) {
    if (item.placeholder) write(g, item.placeholder, tx, mid, most, INK_SOFT, "left", 400);
    g.restore();
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
  write(g, value, tx, mid, size, focused || typing ? ACCENT : INK);
  if (typing && Math.floor(t * 2) % 2 === 0) {
    g.fillStyle = ACCENT;
    g.fillRect(Math.round(tx + g.measureText(lead).width + 1), mid - size * 0.6, 2, size * 1.2);
  }
  g.restore();
}

const SUBMIT = { color: "aqua", size: 14 } as const;
const SUBMIT_DISABLED = { ...SUBMIT, disabled: true } as const;

/** A slider: its name, its track and its value; narrow, the track under the name. */
function drawSlider(g: CanvasRenderingContext2D, item: SliderItem, x: number, y: number, w: number, h: number, focused: boolean, hover: boolean, compact: boolean, hits: HitMap | null, index: number, track: { x: number; w: number }) {
  plate(g, x, y, w, h, { focused, hover, disabled: item.disabled });
  g.save();
  if (item.disabled) g.globalAlpha *= 0.45;
  const k = (item.value - item.min) / (item.max - item.min);
  const value = String(Math.round(item.value));
  if (compact) {
    write(g, item.label, x + 16, y + h * 0.3, Math.round(h * 0.26), INK_SOFT);
    write(g, value, x + w - 16, y + h * 0.3, Math.round(h * 0.26), INK, "right");
    slider(g, track.x, y + h * 0.66, track.w, k, focused);
    hits?.add(MENU_HITS.track, track.x - 14, y + h * 0.4, track.w + 28, h * 0.6, index, 0, item.id);
  } else {
    const mid = y + h / 2 + 1;
    write(g, item.label, x + 18, mid, Math.round(h * 0.4), INK);
    slider(g, track.x, mid, track.w, k, focused);
    write(g, value, x + w - 18, mid, Math.round(h * 0.36), INK, "right");
    hits?.add(MENU_HITS.track, track.x - 14, y, track.w + 28, h, index, 0, item.id);
  }
  g.restore();
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
