// Menu state: a vertical list of items with a focus that moves where the
// player expects, values that change with left and right, and scrolling that
// keeps the focus in view. A pointer works it too: an item is tapped, stepped,
// slid or (a choice drawn as tabs) chosen by its index, and the list scrolled
// by rows; what it touches takes the focus, so the arrows carry on from
// there, but merely hovering over an item does not. No drawing
// here: the screens draw a Menu however they like, and the logic is tested in
// Node.

import type { RemoteButton } from "@fly/contracts";

export type Option<V> = { value: V; label: string };

export type ActionItem = {
  kind: "action";
  id: string;
  label: string;
  disabled?: boolean;
  hint?: string;
  /** A dot of colour at its left: what it is about, where words would be too many (a fly at a table, by its player's colour; a room's place). */
  swatch?: string;
  /** How many of how many, as pips at its right (the flies in a room), and a padlock, for what needs a password. */
  count?: readonly [number, number];
  locked?: boolean;
};
/** A choice; `tabs` draws its options side by side, every one to be pressed, as the tabs across the top of a page. */
export type ChoiceItem<V = unknown> = { kind: "choice"; id: string; label: string; options: readonly Option<V>[]; index: number; disabled?: boolean; hint?: string; tabs?: boolean };
export type SliderItem = { kind: "slider"; id: string; label: string; min: number; max: number; step: number; value: number; disabled?: boolean; hint?: string };
/** Words to type: a name, a password (`secret`: shown masked), a code. Select starts typing into it; `placeholder` shows while it is empty. */
export type FieldItem = { kind: "field"; id: string; label: string; value: string; placeholder?: string; secret?: boolean; disabled?: boolean; hint?: string };
export type MenuItem = ActionItem | ChoiceItem | SliderItem | FieldItem;

/** What a press did. */
export type Outcome =
  | { kind: "none" }
  /** The focus moved (for a redraw). */
  | { kind: "moved" }
  /** Pressed against the end of the list or of a value's range. */
  | { kind: "blocked" }
  | { kind: "activate"; item: ActionItem }
  /** Select on a field: type into it. */
  | { kind: "edit"; item: FieldItem }
  | { kind: "change"; item: ChoiceItem | SliderItem }
  | { kind: "back" };

const NONE: Outcome = { kind: "none" };
const MOVED: Outcome = { kind: "moved" };
const BLOCKED: Outcome = { kind: "blocked" };
const BACK: Outcome = { kind: "back" };

export class Menu {
  readonly items: MenuItem[];
  /** Index of the focused item. */
  focus: number;
  /** Index of the first row shown. */
  scroll = 0;
  /** How many rows fit; the focus is kept inside them. */
  rows: number;
  /**
   * Laid out in this many columns, filled one after the other (where one
   * column of every item doesn't fit): Left and Right go across, between
   * actions, and Up and Down along the list as ever.
   */
  columns = 1;
  /** How many rows there is room for, however many items there are now. */
  #room: number;
  readonly #wrap: boolean;

  constructor(items: MenuItem[], { rows = items.length, focus, wrap = false }: { rows?: number; focus?: string; wrap?: boolean } = {}) {
    this.items = items;
    this.#wrap = wrap;
    this.#room = rows;
    this.rows = Math.min(items.length, Math.max(1, rows));
    const start = focus ? items.findIndex((item) => item.id === focus) : -1;
    this.focus = start >= 0 && !items[start].disabled ? start : this.#nextEnabled(-1, 1) ?? 0;
    this.#keepInView();
  }

  /** A tab strip stays available while its settings scroll beneath it. */
  get pinned(): number {
    const first = this.items[0];
    return this.rows > 1 && first?.kind === "choice" && first.tabs ? 1 : 0;
  }

  get focused(): MenuItem | undefined {
    return this.items[this.focus];
  }

  item(id: string): MenuItem | undefined {
    return this.items.find((item) => item.id === id);
  }

  /** Moves the focus to an item by id, if it can take it. */
  focusOn(id: string) {
    const i = this.items.findIndex((item) => item.id === id);
    if (i >= 0 && !this.items[i].disabled) {
      this.focus = i;
      this.#keepInView();
    }
  }

  /** Shows this many rows at once (the screen's shape changed), keeping the focus in view. */
  setRows(rows: number) {
    this.#room = rows;
    this.rows = Math.min(this.items.length, Math.max(1, Math.floor(rows)));
    this.#keepInView();
  }

  /** Focuses the item at `index`, if it can take it; true if the focus moved. */
  focusIndex(index: number): boolean {
    const item = this.items[index];
    if (!item || item.disabled || index === this.focus) return false;
    this.focus = index;
    this.#keepInView();
    return true;
  }

  /** A tap on the item at `index`: focuses it and does what Select does there. */
  tap(index: number): Outcome {
    const item = this.items[index];
    if (!item || item.disabled) return BLOCKED;
    this.focusIndex(index);
    return this.press("select");
  }

  /** A tap on one of a choice's or a slider's arrows: steps it that way, as left and right do. */
  stepAt(index: number, dir: -1 | 1): Outcome {
    const item = this.items[index];
    if (!item || item.disabled) return BLOCKED;
    this.focusIndex(index);
    return this.#step(dir, false);
  }

  /** A tap on one of a choice's options (a tab): chooses it. */
  chooseAt(index: number, option: number): Outcome {
    const item = this.items[index];
    if (!item || item.disabled || item.kind !== "choice" || !item.options[option]) return BLOCKED;
    this.focusIndex(index);
    if (item.index === option) return NONE;
    item.index = option;
    return { kind: "change", item };
  }

  /** Puts these items in place of the ones after the first `keep` (the page under a row of tabs), keeping the focus where it was if it still can be. */
  replaceFrom(keep: number, items: readonly MenuItem[]) {
    this.items.length = keep;
    this.items.push(...items);
    if (this.focus >= this.items.length || this.items[this.focus]?.disabled) this.focus = this.#nextEnabled(-1, 1) ?? 0;
    this.setRows(this.#room);
  }

  /** Sets the slider at `index` to `k` of the way along its track (0 to 1), to the nearest step. */
  slideAt(index: number, k: number): Outcome {
    const item = this.items[index];
    if (!item || item.disabled || item.kind !== "slider") return NONE;
    this.focusIndex(index);
    const raw = item.min + Math.max(0, Math.min(1, k)) * (item.max - item.min);
    const value = Math.min(item.max, Math.max(item.min, item.min + Math.round((raw - item.min) / item.step) * item.step));
    if (value === item.value) return NONE;
    item.value = value;
    return { kind: "change", item };
  }

  /** Scrolls the list by `rows` (a drag, the wheel), bringing the focus along so it stays in view; false if it can't go that way. */
  scrollBy(rows: number): boolean {
    const maxScroll = Math.max(0, this.items.length - this.rows);
    const next = Math.min(maxScroll, Math.max(0, this.scroll + Math.round(rows)));
    if (next === this.scroll) return false;
    this.scroll = next;
    const last = this.scroll + this.rows - 1;
    if (this.focus >= this.pinned && this.focus < this.scroll + this.pinned) this.focus = this.#nextEnabled(this.scroll + this.pinned - 1, 1) ?? this.focus;
    else if (this.focus > last) this.focus = this.#nextEnabled(last + 1, -1) ?? this.focus;
    return true;
  }

  press(button: RemoteButton, repeat = false): Outcome {
    switch (button) {
      case "up":
      case "down": {
        const dir = button === "up" ? -1 : 1;
        const next = this.#nextEnabled(this.focus, dir) ?? (this.#wrap ? this.#nextEnabled(dir < 0 ? this.items.length : -1, dir) : null);
        if (next === null) return repeat ? NONE : BLOCKED;
        this.focus = next;
        this.#keepInView();
        return MOVED;
      }
      case "left":
      case "right": {
        if (this.columns > 1 && this.focused?.kind === "action") {
          const next = this.focus + (button === "left" ? -1 : 1) * Math.ceil(this.items.length / this.columns);
          if (next < 0 || next >= this.items.length || this.items[next].disabled) return repeat ? NONE : BLOCKED;
          this.focus = next;
          this.#keepInView();
          return MOVED;
        }
        return this.#step(button === "left" ? -1 : 1, repeat);
      }
      case "select": {
        if (repeat) return NONE;
        const item = this.focused;
        if (!item || item.disabled) return BLOCKED;
        if (item.kind === "action") return { kind: "activate", item };
        if (item.kind === "field") return { kind: "edit", item };
        if (item.kind === "choice") {
          // Select steps through a choice, round to the start: enough to set it without the arrows.
          item.index = (item.index + 1) % item.options.length;
          return { kind: "change", item };
        }
        return this.#step(1, false, true);
      }
      case "back":
        return repeat ? NONE : BACK;
      default:
        return NONE;
    }
  }

  #step(dir: -1 | 1, repeat: boolean, wrap = false): Outcome {
    const item = this.focused;
    if (!item || item.disabled || item.kind === "action" || item.kind === "field") return NONE;
    if (item.kind === "choice") {
      const next = item.index + dir;
      if (next < 0 || next >= item.options.length) return repeat ? NONE : BLOCKED;
      item.index = next;
      return { kind: "change", item };
    }
    let value = Math.round((item.value + dir * item.step) / item.step) * item.step;
    if (value > item.max + 1e-9) {
      if (!wrap) return repeat ? NONE : BLOCKED;
      value = item.min;
    }
    if (value < item.min - 1e-9) return repeat ? NONE : BLOCKED;
    item.value = Math.min(item.max, Math.max(item.min, value));
    return { kind: "change", item };
  }

  #nextEnabled(from: number, dir: -1 | 1): number | null {
    for (let i = from + dir; i >= 0 && i < this.items.length; i += dir) if (!this.items[i].disabled) return i;
    return null;
  }

  #keepInView() {
    const maxScroll = Math.max(0, this.items.length - this.rows);
    if (this.focus < this.scroll + this.pinned) this.scroll = Math.max(0, this.focus - this.pinned);
    if (this.focus >= this.scroll + this.rows) this.scroll = this.focus - this.rows + 1;
    this.scroll = Math.min(maxScroll, Math.max(0, this.scroll));
  }
}

/** The value a choice is set to. */
export const choiceValue = <V>(item: ChoiceItem<V>): V => item.options[item.index].value;

/** A choice's index for a value, or 0. */
export const indexOf = <V>(options: readonly Option<V>[], value: V) => Math.max(0, options.findIndex((o) => o.value === value));
