// Playing with others: a table of up to eight people's flies, joined by a
// link (docs/online.md). Few words: alone, a button to start a table; at
// one, a button to hand its link on, one to leave, and for whoever started
// it each other fly by its player's colour, to take it off the table. Who is
// there shows in the world itself, a dab of each player's colour on their fly.

import type { RemoteButton } from "@fly/contracts";
import { Menu } from "@fly/ui";
import type { HitMap, MenuItem } from "@fly/ui";
import type { Frame } from "../../display.ts";
import { fitMenu, safeRect } from "../layout.ts";
import { MenuScreen } from "./menu-screen.ts";
import type { Point, Screen, Shell } from "./types.ts";

/** Seconds "Link copied" shows before the button says what it does again. */
const COPIED_FOR = 2.5;

export class TogetherScreen implements Screen {
  readonly id = "together";
  readonly #shell: Shell;
  #screen: MenuScreen;
  /** What the rows were made from, to tell when they need making again. */
  #shape = "";
  #copied = -1;
  #time = 0;

  constructor(shell: Shell) {
    this.#shell = shell;
    this.#screen = this.#build();
  }

  /** The rows for how things are now. */
  #rows(): MenuItem[] {
    const table = this.#shell.table;
    if (!table) return [{ kind: "action", id: "start", label: "Start a table", disabled: !this.#shell.canPlayTogether }];
    const copied = this.#copied >= 0 && this.#time - this.#copied < COPIED_FOR;
    const rows: MenuItem[] = [{ kind: "action", id: "share", label: copied ? "Link copied" : "Share the link", disabled: !table.joined }];
    if (table.starting) for (const o of table.others) rows.push({ kind: "action", id: `remove:${o.id}`, label: "Remove", swatch: o.colour });
    rows.push({ kind: "action", id: "leave", label: "Leave the table" });
    return rows;
  }

  #key() {
    const table = this.#shell.table;
    const copied = this.#copied >= 0 && this.#time - this.#copied < COPIED_FOR;
    return table ? `${table.joined}|${table.starting}|${copied}|${table.others.map((o) => o.id).join(",")}` : `alone|${this.#shell.canPlayTogether}`;
  }

  #build(focus?: string) {
    const shell = this.#shell;
    const items = this.#rows();
    this.#shape = this.#key();
    const menu = new Menu(items, { focus });
    return new MenuScreen(shell, {
      id: "together",
      menu,
      heading: "Together",
      place: (frame) => fitMenu(safeRect(frame), { items: items.length, width: 340, row: 40, heading: true, foot: 34, values: false, raise: 12 }),
      onActivate: (item) => {
        if (item.id === "start") {
          shell.startTable();
          this.#refresh("share");
        } else if (item.id === "share") {
          void shell.shareTable().then((how) => {
            if (how === "copied") this.#copied = this.#time;
            this.#refresh("share");
          });
        } else if (item.id === "leave") {
          shell.leaveTable();
          this.#refresh("start");
        } else if (item.id.startsWith("remove:")) {
          shell.removeFly(Number(item.id.slice(7)));
        }
      },
      onBack: () => shell.back(),
    });
  }

  /** The rows again, keeping the focus where it was (or on `focus`). */
  #refresh(focus?: string) {
    const was = this.#screen.menu.focused?.id;
    this.#screen = this.#build(focus ?? was);
    this.#screen.enter();
  }

  enter() {
    this.#refresh();
  }

  layout(frame: Frame) {
    this.#screen.layout(frame);
  }

  press(button: RemoteButton, repeat: boolean) {
    this.#screen.press(button, repeat);
  }

  point(p: Point) {
    this.#screen.point(p);
  }

  update(dt: number) {
    this.#time += dt;
    // Someone came or went, the table answered, or "Link copied" has had its moment.
    if (this.#key() !== this.#shape) {
      this.#refresh();
      return true;
    }
    return this.#screen.update(dt);
  }

  draw(g: CanvasRenderingContext2D, t: number, hits: HitMap) {
    this.#screen.draw(g, t, hits);
  }
}
