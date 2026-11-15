// A screen that is a menu on a pane of glass: the title, the pause menu and
// the settings are all one of these, with different items and actions.

import type { RemoteButton } from "@fly/contracts";
import { INK, glassPanel, hintChip, hintWidth, text } from "@fly/ui";
import type { ChoiceItem, Menu, MenuItem, SliderItem } from "@fly/ui";
import { DESIGN_HEIGHT, DESIGN_WIDTH } from "../../display.ts";
import { MenuView } from "../menu-view.ts";
import type { Screen, ScreenId, Shell } from "./types.ts";

export type MenuScreenOptions = {
  id: ScreenId;
  pauses: boolean;
  menu: Menu;
  /** The pane's title, or none (the title screen draws its own wordmark). */
  heading?: string;
  /** The pane's place and size, and the rows inside it. */
  panel: { x: number; y: number; w: number; h: number };
  row?: number;
  onActivate(item: MenuItem): void;
  onChange?(item: ChoiceItem | SliderItem): void;
  onBack(): void;
  /** Drawn first, under the pane. */
  backdrop?(g: CanvasRenderingContext2D, t: number): void;
};

export class MenuScreen implements Screen {
  readonly id: ScreenId;
  readonly pauses: boolean;
  readonly view: MenuView;
  #options: MenuScreenOptions;
  #shell: Shell;
  #dirty = true;

  constructor(shell: Shell, options: MenuScreenOptions) {
    this.#shell = shell;
    this.#options = options;
    this.id = options.id;
    this.pauses = options.pauses;
    const { panel } = options;
    const row = options.row ?? 40;
    const top = panel.y + (options.heading ? 70 : 26);
    this.view = new MenuView(options.menu, { x: panel.x + 28, y: top, width: panel.w - 56, row, gap: 12 });
  }

  get menu() {
    return this.#options.menu;
  }

  enter() {
    this.#dirty = true;
  }

  press(button: RemoteButton, repeat: boolean) {
    const outcome = this.menu.press(button, repeat);
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
        this.#options.onActivate(outcome.item);
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

  update(dt: number) {
    const moving = this.view.update(dt);
    const dirty = this.#dirty || moving;
    this.#dirty = false;
    // The ring's shimmer keeps turning.
    return dirty || true;
  }

  draw(g: CanvasRenderingContext2D, t: number) {
    const { panel, heading, backdrop } = this.#options;
    backdrop?.(g, t);
    glassPanel(g, panel.x, panel.y, panel.w, panel.h, 28);
    if (heading) text(g, heading, panel.x + panel.w / 2, panel.y + 46, { size: 28, align: "center", color: INK });
    this.view.draw(g, t);
    drawMenuHints(g, t);
  }
}

/** The hints every menu shows: how to move, choose and go back. */
export function drawMenuHints(g: CanvasRenderingContext2D, t: number, back = "Back") {
  const y = DESIGN_HEIGHT - 26;
  const labels: [Parameters<typeof hintChip>[3], string][] = [["upDown", "Move"], ["select", "Choose"], ["back", back]];
  const gap = 10;
  const total = labels.reduce((w, [, label]) => w + hintWidth(g, label, 13) + gap, -gap);
  let x = (DESIGN_WIDTH - total) / 2;
  for (const [glyph, label] of labels) x += hintChip(g, x, y, glyph, label, t, 13) + gap;
}
