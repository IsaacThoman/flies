// Menu state: a vertical list of items with a focus that moves where the
// player expects, values that change with left and right, and scrolling that
// keeps the focus in view. A pointer works it too: an item is focused, tapped,
// stepped or slid by its index, and the list scrolled by rows. No drawing
// here: the screens draw a Menu however they like, and the logic is tested in
// Node.

import type { RemoteButton } from "@fly/contracts";

export type Option<V> = { value: V; label: string };

export type ActionItem = { kind: "action"; id: string; label: string; disabled?: boolean; hint?: string };
export type ChoiceItem<V = unknown> = { kind: "choice"; id: string; label: string; options: readonly Option<V>[]; index: number; disabled?: boolean; hint?: string };
export type SliderItem = { kind: "slider"; id: string; label: string; min: number; max: number; step: number; value: number; disabled?: boolean; hint?: string };
export type MenuItem = ActionItem | ChoiceItem | SliderItem;

/** What a press did. */
export type Outcome =
  | { kind: "none" }
  /** The focus moved (for a sound and a redraw). */
  | { kind: "moved" }
  /** Pressed against the end of the list or of a value's range. */
  | { kind: "blocked" }
  | { kind: "activate"; item: ActionItem }
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

  constructor(items: MenuItem[], { rows = items.length, focus }: { rows?: number; focus?: string } = {}) {
    this.items = items;
    this.rows = Math.min(items.length, Math.max(1, rows));
    const start = focus ? items.findIndex((item) => item.id === focus) : -1;
    this.focus = start >= 0 && !items[start].disabled ? start : this.#nextEnabled(-1, 1) ?? 0;
    this.#keepInView();
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
    if (this.focus < this.scroll) this.focus = this.#nextEnabled(this.scroll - 1, 1) ?? this.focus;
    else if (this.focus > last) this.focus = this.#nextEnabled(last + 1, -1) ?? this.focus;
    return true;
  }

  press(button: RemoteButton, repeat = false): Outcome {
    switch (button) {
      case "up":
      case "down": {
        const next = this.#nextEnabled(this.focus, button === "up" ? -1 : 1);
        if (next === null) return repeat ? NONE : BLOCKED;
        this.focus = next;
        this.#keepInView();
        return MOVED;
      }
      case "left":
      case "right":
        return this.#step(button === "left" ? -1 : 1, repeat);
      case "select": {
        if (repeat) return NONE;
        const item = this.focused;
        if (!item || item.disabled) return BLOCKED;
        if (item.kind === "action") return { kind: "activate", item };
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
    if (!item || item.disabled || item.kind === "action") return NONE;
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
    if (this.focus < this.scroll) this.scroll = this.focus;
    if (this.focus >= this.scroll + this.rows) this.scroll = this.focus - this.rows + 1;
    this.scroll = Math.min(maxScroll, Math.max(0, this.scroll));
  }
}

/** The value a choice is set to. */
export const choiceValue = <V>(item: ChoiceItem<V>): V => item.options[item.index].value;

/** A choice's index for a value, or 0. */
export const indexOf = <V>(options: readonly Option<V>[], value: V) => Math.max(0, options.findIndex((o) => o.value === value));
