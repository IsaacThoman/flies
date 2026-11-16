// A screen that is a menu on a pane of glass: the title, the pause menu and
// the settings are all one of these, with different items and actions.
//
// The remote moves its focus and presses; a pointer focuses what it hovers
// over, presses what it taps, slides sliders, steps choices by their arrows
// and scrolls the list by dragging it. Tapping outside the pane, or its back
// button, is Back.

import type { RemoteButton } from "@fly/contracts";
import { INK, glassPanel, hintChip, hintWidth, iconButton, text } from "@fly/ui";
import type { ChoiceItem, GlyphSet, HitMap, Menu, MenuItem, Outcome, SliderItem } from "@fly/ui";
import type { Frame } from "../../display.ts";
import { backButton } from "../layout.ts";
import type { MenuPanel } from "../layout.ts";
import { MENU_HITS, MenuView } from "../menu-view.ts";
import { SCREEN_HITS } from "./types.ts";
import type { Point, Screen, ScreenId, Shell } from "./types.ts";

export type MenuScreenOptions = {
  id: ScreenId;
  pauses: boolean;
  menu: Menu;
  /** The pane's title, or none (the title screen draws its own wordmark). */
  heading?: string;
  /** Where the pane and its rows go on a screen of this shape. */
  place(frame: Frame): MenuPanel;
  /** The root of the game, which a pointer can't go back from. */
  root?: boolean;
  /** Each time it comes to the top. */
  onEnter?(): void;
  onActivate?(item: MenuItem): void;
  onChange?(item: ChoiceItem | SliderItem): void;
  onBack(): void;
  /** Drawn first, under the pane. */
  backdrop?(g: CanvasRenderingContext2D, t: number): void;
};

/** A drag this far (design units) is scrolling the list, not tapping a row. */
const SCROLL_SLOP = 10;

export class MenuScreen implements Screen {
  readonly id: ScreenId;
  readonly pauses: boolean;
  readonly view: MenuView;
  #options: MenuScreenOptions;
  #shell: Shell;
  #dirty = true;
  #pane: MenuPanel;
  /** What a pointer went down on: a slider it is sliding, or the list it may drag. */
  #held: { slider: number; scroll: number; dragging: boolean } | null = null;
  #wheel = 0;

  constructor(shell: Shell, options: MenuScreenOptions) {
    this.#shell = shell;
    this.#options = options;
    this.id = options.id;
    this.pauses = options.pauses;
    this.#pane = options.place(shell.shape);
    options.menu.setRows(this.#pane.rows);
    this.view = new MenuView(options.menu, this.#pane.list);
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
    this.menu.setRows(this.#pane.rows);
    this.view.place(this.#pane.list);
    this.#dirty = true;
  }

  press(button: RemoteButton, repeat: boolean) {
    this.#outcome(this.menu.press(button, repeat));
  }

  #outcome(outcome: Outcome) {
    const shell = this.#shell;
    switch (outcome.kind) {
      case "moved":
        shell.sound("move");
        break;
      case "blocked":
        shell.sound("blocked");
        break;
      case "activate":
        this.view.pressed();
        shell.sound("select");
        this.#options.onActivate?.(outcome.item);
        break;
      case "change":
        shell.sound("tick");
        this.#options.onChange?.(outcome.item);
        break;
      case "back":
        shell.sound("back");
        this.#options.onBack();
        break;
    }
    this.#dirty = true;
  }

  point(p: Point) {
    const menu = this.menu;
    const hit = p.hit;
    switch (p.type) {
      case "hover":
        if (hit && hit.kind !== SCREEN_HITS.panel && hit.kind !== SCREEN_HITS.back && hit.kind !== MENU_HITS.more && menu.focusIndex(hit.index)) this.#outcome({ kind: "moved" });
        break;
      case "down":
        this.#held = { slider: -1, scroll: menu.scroll, dragging: false };
        if (hit?.kind === MENU_HITS.track) {
          this.#held.slider = hit.index;
          this.#slide(hit.index, p.x);
        } else if (hit && (hit.kind === MENU_HITS.row || hit.kind === MENU_HITS.step) && menu.focusIndex(hit.index)) this.#dirty = true;
        break;
      case "drag": {
        const held = this.#held;
        if (!held) break;
        if (held.slider >= 0) this.#slide(held.slider, p.x);
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
        if (!p.tap || !held || held.dragging || held.slider >= 0) break;
        if (!hit) {
          if (!this.#options.root) this.#outcome({ kind: "back" });
        } else if (hit.kind === SCREEN_HITS.back) this.#outcome({ kind: "back" });
        else if (hit.kind === MENU_HITS.step) this.#outcome(menu.stepAt(hit.index, hit.value < 0 ? -1 : 1));
        else if (hit.kind === MENU_HITS.more) {
          if (menu.scrollBy(hit.value * menu.rows)) this.#outcome({ kind: "moved" });
        } else if (hit.kind === MENU_HITS.row && menu.items[hit.index]?.kind !== "slider") this.#outcome(menu.tap(hit.index));
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
    const moving = this.view.update(dt);
    const dirty = this.#dirty || moving;
    this.#dirty = false;
    // The ring's shimmer keeps turning.
    return dirty || true;
  }

  draw(g: CanvasRenderingContext2D, t: number, hits: HitMap) {
    const { heading, backdrop } = this.#options;
    const { panel } = this.#pane;
    backdrop?.(g, t);
    hits.add(SCREEN_HITS.panel, panel.x, panel.y, panel.w, panel.h);
    glassPanel(g, panel.x, panel.y, panel.w, panel.h, 28);
    const head = this.#pane.heading;
    if (heading && head) text(g, heading, panel.x + panel.w / 2, head.y, { size: head.size, align: "center", color: INK });
    if (this.#shell.glyphs === null && !this.#options.root && head) {
      const b = backButton(panel, head.y);
      iconButton(g, b.x, b.y, b.r, "back");
      hits.add(SCREEN_HITS.back, b.x - 24, b.y - 24, 48, 48);
    }
    this.view.draw(g, t, hits);
    drawMenuHints(g, t, this.#shell);
  }
}

/** The hints every menu shows for the buttons in hand: how to move, choose and go back, along the foot of the safe area. None for a pointer. */
export function drawMenuHints(g: CanvasRenderingContext2D, t: number, shell: { shape: Frame; glyphs: GlyphSet | null }, back = "Back") {
  const set = shell.glyphs;
  if (!set) return;
  const { design, safe } = shell.shape;
  const y = design.height - safe.bottom - 26;
  const gap = 10;
  const total = hintWidth(g, "Move", 13, "upDown", set) + hintWidth(g, "Choose", 13, "select", set) + hintWidth(g, back, 13, "back", set) + 2 * gap;
  let x = safe.left + (design.width - safe.left - safe.right - total) / 2;
  x += hintChip(g, x, y, "upDown", "Move", t, 13, set) + gap;
  x += hintChip(g, x, y, "select", "Choose", t, 13, set) + gap;
  hintChip(g, x, y, "back", back, t, 13, set);
}
