// Menu state: a vertical list of items with a focus that moves where the
// player expects, values that change with left and right, and scrolling that
// keeps the focus in view. No drawing here: the screens draw a Menu however
// they like, and the logic is tested in Node.

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
  readonly rows: number;

  constructor(items: MenuItem[], { rows = items.length, focus }: { rows?: number; focus?: string } = {}) {
    this.items = items;
    this.rows = Math.max(1, rows);
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
