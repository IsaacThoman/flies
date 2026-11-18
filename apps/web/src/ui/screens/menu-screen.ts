// A screen that is a menu on a pane of glass (the title's is bare: its
// buttons stand over the world): the title and the settings are each one of
// these, with different items and actions. Under the rows, a line on what
// the focused one is for; along the foot of the screen, what the buttons in
// hand do with it.
//
// The remote moves its focus and presses. A pointer presses what it clicks
// or taps (which then has the focus, for the arrows to carry on from),
// slides sliders, steps choices by their arrows, picks tabs and scrolls the
// list by dragging it; hovering only brightens what it is over, and the
// focus ring is hidden while it is in use (the line under the rows is then of
// what the mouse is over, or what was last pressed). Tapping outside the pane, or its
// back button, is Back; at the root, which has no Back for a pointer, tapping
// outside does what the screen says.

import type { RemoteButton } from "@fly/contracts";
import { INK, INK_SOFT, fitText, iconButton, sameTarget, sheet, text } from "@fly/ui";
import type { ChoiceItem, FieldItem, Hit, HitMap, Menu, MenuItem, Outcome, SliderItem } from "@fly/ui";
import type { Frame } from "../../display.ts";
import { drawHintBar } from "../hint-bar.ts";
import type { Hint } from "../hint-bar.ts";
import { backButton } from "../layout.ts";
import type { MenuPanel } from "../layout.ts";
import { MENU_HITS, MenuView } from "../menu-view.ts";
import { SCREEN_HITS } from "./types.ts";
import type { Point, Screen, ScreenId, Shell } from "./types.ts";

export type MenuScreenOptions = {
  id: ScreenId;
  menu: Menu;
  /** The pane's title, or none (the title screen draws its own wordmark), and its colour, if not the ink's. */
  heading?: string;
  headingColor?: string;
  /** Where the pane and its rows go on a screen of this shape. */
  place(frame: Frame): MenuPanel;
  /** The root of the game, which a pointer can't go back from. */
  root?: boolean;
  /** No pane of glass: its buttons over the world. */
  bare?: boolean;
  /** Before each frame: what the rows show may follow the game (the room it is at). True if any changed. */
  onUpdate?(): boolean;
  /** At the root, a tap outside the pane. */
  onOutside?(): void;
  /** Keep the header and rows still while hiding unused panel space. */
  trimEmpty?: boolean;
  /** Each time it comes to the top. */
  onEnter?(): void;
  onActivate?(item: MenuItem): void;
  onChange?(item: ChoiceItem | SliderItem): void;
  /** Select on a field: start typing into it. */
  onEdit?(item: FieldItem): void;
  onSubmit?(item: FieldItem): void;
  onBack(): void;
  /** Drawn first, under the pane. */
  backdrop?(g: CanvasRenderingContext2D, t: number): void;
};

/** A drag this far (design units) is scrolling the list, not tapping a row. */
const SCROLL_SLOP = 10;

const MOVE: Hint = { glyph: "upDown" };
const ACROSS: Hint = { glyph: "arrows" };
const SELECT: Hint = { glyph: "select", label: "Select" };
const BACK: Hint = { glyph: "back", label: "Back" };
/** What the buttons do, by what has the focus: at the root (nothing to go back to), on a button, on a setting, on a field. */
const HINTS = {
  root: [MOVE, SELECT],
  rootAcross: [ACROSS, SELECT],
  action: [MOVE, SELECT, BACK],
  choice: [MOVE, { glyph: "leftRight", label: "Change" }, BACK],
  field: [MOVE, { glyph: "select", label: "Type" }, BACK],
} as const satisfies Record<string, readonly Hint[]>;

export class MenuScreen implements Screen {
  readonly id: ScreenId;
  readonly view: MenuView;
  #options: MenuScreenOptions;
  #shell: Shell;
  #dirty = true;
  #pane: MenuPanel;
  #fullHeight: number;
  #fullRows: number;
  /** What a pointer went down on: a slider it is sliding, or the list it may drag. */
  #held: { slider: number; hit: Hit | null; scroll: number; dragging: boolean } | null = null;
  #wheel = 0;
  semanticFocus = false;
  /** The row a mouse is over, or -1. */
  #hover = -1;

  constructor(shell: Shell, options: MenuScreenOptions) {
    this.#shell = shell;
    this.#options = options;
    this.id = options.id;
    this.#pane = options.place(shell.shape);
    this.#fullHeight = this.#pane.panel.h;
    this.#fullRows = this.#pane.rows;
    options.menu.setRows(this.#pane.rows);
    options.menu.columns = this.#pane.list.columns;
    this.view = new MenuView(options.menu, this.#pane.list);
    this.view.finger = fingerWidth(shell.shape);
    this.#trimPane();
  }

  get menu() {
    return this.#options.menu;
  }

  /** The pane, where it is now. */
  get pane() {
    return this.#pane;
  }

  enter() {
    this.#options.onEnter?.();
    this.#dirty = true;
  }

  layout(frame: Frame) {
    this.#pane = this.#options.place(frame);
    this.#fullHeight = this.#pane.panel.h;
    this.#fullRows = this.#pane.rows;
    this.menu.setRows(this.#pane.rows);
    this.menu.columns = this.#pane.list.columns;
    this.view.place(this.#pane.list);
    this.view.finger = fingerWidth(frame);
    this.#trimPane();
    this.#dirty = true;
  }

  #trimPane() {
    if (!this.#options.trimEmpty) return;
    const { row, gap, columns } = this.#pane.list;
    const empty = Math.max(0, Math.ceil(this.#fullRows / columns) - Math.ceil(this.menu.rows / columns));
    this.#pane.panel.h = this.#fullHeight - empty * (row + gap);
    this.#pane.rows = this.menu.rows;
  }

  press(button: RemoteButton, repeat: boolean) {
    this.semanticFocus = false;
    this.#outcome(this.menu.press(button, repeat));
  }

  focus(id: string) {
    this.menu.focusOn(id);
    this.semanticFocus = true;
    this.#dirty = true;
  }

  /** Host semantics use the same outcomes as the canvas's hit targets. */
  access(id: string, value?: number) {
    const at = this.menu.items.findIndex((item) => item.id === id);
    const item = this.menu.items[at];
    if (!item || item.disabled) return;
    this.focus(id);
    this.#outcome(value === undefined ? this.menu.tap(at) : item.kind === "choice" ? this.menu.chooseAt(at, value) : this.menu.slideAt(at, value));
  }

  get heading() { return this.#options.heading ?? (this.id[0].toUpperCase() + this.id.slice(1)); }

  #outcome(outcome: Outcome) {
    switch (outcome.kind) {
      case "activate":
        this.view.pressed();
        this.#options.onActivate?.(outcome.item);
        break;
      case "change":
        this.#options.onChange?.(outcome.item);
        break;
      case "edit":
        this.#options.onEdit?.(outcome.item);
        break;
      case "back":
        this.#options.onBack();
        break;
    }
    this.#trimPane();
    this.#dirty = true;
    this.#shell.menuChanged?.();
  }

  point(p: Point) {
    if (p.type === "down" || p.type === "hover") this.semanticFocus = false;
    const menu = this.menu;
    const hit = p.hit;
    const row = hit && (hit.kind === MENU_HITS.row || hit.kind === MENU_HITS.step || hit.kind === MENU_HITS.tab || hit.kind === MENU_HITS.option || hit.kind === MENU_HITS.track || hit.kind === MENU_HITS.submit);
    // The list may have refreshed since these pixels were drawn.
    if (row && (!hit.id || menu.items[hit.index]?.id !== hit.id)) {
      if (p.type !== "hover") this.#held = null;
      return;
    }
    switch (p.type) {
      case "hover": {
        const over = hit && hit.kind !== SCREEN_HITS.panel && hit.kind !== SCREEN_HITS.back && !menu.items[hit.index]?.disabled ? hit.index : -1;
        if (over !== this.#hover) {
          this.#hover = over;
          this.#dirty = true;
        }
        break;
      }
      case "down":
        this.#held = { slider: -1, hit: hit && { ...hit }, scroll: menu.scroll, dragging: false };
        if (hit?.kind === MENU_HITS.track) {
          this.#held.slider = hit.index;
          this.#slide(hit.index, p.x);
        }
        break;
      case "drag": {
        const held = this.#held;
        if (!held) break;
        if (held.slider >= 0 && menu.items[held.slider]?.id === held.hit?.id) this.#slide(held.slider, p.x);
        else if (menu.items.length > menu.rows && (held.dragging || Math.abs(p.dy) > SCROLL_SLOP)) {
          held.dragging = true;
          const { row, gap } = this.view.layout;
          const want = held.scroll - Math.round(p.dy / (row + gap));
          if (menu.scrollBy(want - menu.scroll)) this.#outcome({ kind: "moved" });
        }
        break;
      }
      case "up": {
        const held = this.#held;
        this.#held = null;
        if (!p.tap || !held || !sameTarget(held.hit, hit) || held.dragging || held.slider >= 0) break;
        if (!hit) {
          if (!this.#options.root) this.#outcome({ kind: "back" });
          else this.#options.onOutside?.();
        } else if (hit.kind === SCREEN_HITS.back) this.#outcome({ kind: "back" });
        else if (hit.kind === MENU_HITS.submit) {
          const item = menu.items[hit.index];
          if (item?.kind === "field" && !item.disabled && item.submit && !item.submit.disabled) this.#options.onSubmit?.(item);
        }
        else if (hit.kind === MENU_HITS.step) this.#outcome(menu.stepAt(hit.index, hit.value < 0 ? -1 : 1));
        else if (hit.kind === MENU_HITS.tab || hit.kind === MENU_HITS.option) this.#outcome(menu.chooseAt(hit.index, hit.value));
        else if (hit.kind === MENU_HITS.row && menu.items[hit.index]?.kind !== "slider") this.#outcome(menu.tap(hit.index));
        break;
      }
      case "cancel":
        this.#held = null;
        break;
      case "wheel": {
        this.#wheel += p.dy;
        const { row, gap } = this.view.layout;
        const rows = Math.trunc(this.#wheel / (row + gap));
        if (rows !== 0) {
          this.#wheel -= rows * (row + gap);
          if (menu.scrollBy(rows)) this.#outcome({ kind: "moved" });
        }
        break;
      }
    }
  }

  #slide(index: number, x: number) {
    const track = this.view.track;
    const outcome = this.menu.slideAt(index, (x - track.x) / track.w);
    if (outcome.kind !== "none") this.#outcome(outcome);
  }

  update(dt: number) {
    if (this.#options.onUpdate?.()) this.#dirty = true;
    const moving = this.view.update(dt);
    const dirty = this.#dirty || moving;
    this.#dirty = false;
    // The ring's shimmer keeps turning.
    return dirty || true;
  }

  draw(g: CanvasRenderingContext2D, t: number, hits: HitMap) {
    const { heading, backdrop } = this.#options;
    const { panel } = this.#pane;
    const menu = this.menu;
    backdrop?.(g, t);
    hits.add(SCREEN_HITS.panel, panel.x, panel.y, panel.w, panel.h);
    if (!this.#options.bare) sheet(g, panel.x, panel.y, panel.w, panel.h, 28);
    const head = this.#pane.heading;
    // Smaller, if it must be, to stay clear of the back button.
    if (heading && head) text(g, heading, panel.x + panel.w / 2, head.y, { size: fitText(g, this.#options, heading, panel.w - 150, head.size).size, align: "center", color: this.#options.headingColor ?? INK });
    // For a pointer, a way back: by the heading, or, with none, beside the first row (a row of tabs leaves room for it).
    const pointing = this.#shell.glyphs === null;
    const ring = !pointing || this.semanticFocus;
    const backed = pointing && !this.#options.root;
    this.view.tabInset = backed && !head ? 44 : 0;
    this.view.draw(g, t, hits, ring, ring ? -1 : this.#hover);
    // What the row in hand is for: the focused one's, or, pointing, the one under the mouse, else the one last pressed.
    const detail = this.#pane.detail;
    const about = menu.items[!ring && this.#hover >= 0 ? this.#hover : menu.focus]?.detail;
    if (detail && about) text(g, about, panel.x + panel.w / 2, panel.y + panel.h - detail.up, { size: fitText(g, this, about, panel.w - 40, detail.size, 9).size, weight: 400, align: "center", baseline: "middle", color: INK_SOFT });
    if (backed) {
      const list = this.#pane.list;
      const b = head ? backButton(panel, head.y) : { x: list.x + 17, y: list.y + list.row / 2, r: 17 };
      iconButton(g, b.x, b.y, b.r, "back");
      // Over the row it sits beside.
      hits.add(SCREEN_HITS.back, b.x - 22, b.y - 22, 44, 44);
    }
    // The buttons are taught on a first visit, before the first game; after that the menus do without.
    if (this.#shell.teachingMenu === false) return;
    const focused = menu.focused;
    const kind = focused?.kind === "choice" || focused?.kind === "slider" ? "choice" : focused?.kind === "field" ? "field" : "action";
    drawHintBar(g, t, this.#shell, this.#options.root ? (menu.columns > 1 ? HINTS.rootAcross : HINTS.root) : HINTS[kind]);
  }
}

/** The narrowest a finger presses, design units; nothing, where nothing is pressed with one. */
const fingerWidth = (frame: Frame) => (frame.coarse ? 44 / frame.unit : 0);
