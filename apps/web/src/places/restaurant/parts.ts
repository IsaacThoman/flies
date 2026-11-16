// The parts the restaurant is built of, each in its own file: the tables and
// their chairs, what is on the tables, the zinc bar, the back bar and its
// bottles, and the rest (the pass, the host's stand, the service station,
// the banquette, what hangs on the walls). Each part draws the solids of the
// world it owns, in detail for their areas and as stand-ins for the far mesh
// (builder.ts), and may shade kinds of its own (kinds.ts, PART_KINDS) with
// GLSL that the materials take in (materials.ts). The room's shell is
// shell.ts.

import { ZINC_BAR } from "@fly/world";
import type { Solid } from "@fly/world";
import type { Builder } from "./builder.ts";
import { backbar } from "./backbar.ts";
import { counter } from "./counter.ts";
import { rest } from "./rest.ts";
import { tables } from "./tables.ts";
import { tabletop } from "./tabletop.ts";

export type PartName = "tables" | "tabletop" | "counter" | "backbar" | "rest";

/** GLSL a part adds to a material: functions and uniforms (head), its kinds' look after the vertex colours (color), and what glows (emissive; clear: final, setting `rAlpha`). */
export type PartGlsl = { head?: string; color?: string; emissive?: string; final?: string };

export type Part = {
  /** Draws its solids (`solids` of the world it owns: see `owner`) in detail and as stand-ins, and whatever else is its own. */
  build(b: Builder, solids: readonly Solid[]): void;
  solid?: PartGlsl;
  clear?: PartGlsl;
};

export const PARTS: Readonly<Record<PartName, Part>> = { tables, tabletop, counter, backbar, rest };

const TABLE_THINGS = new Set(["sugar caddy", "bud vase", "flower stem", "flower", "votive", "sugar packet", "shaker", "glass foot", "glass stem", "wine glass", "ketchup", "ketchup neck", "ketchup cap", "menu", "bread basket", "bread", "saucer", "espresso cup"]);
const FURNITURE = new Set(["table", "spider", "pedestal", "table foot", "table leg", "apron", "chair seat", "chair leg", "chair post", "chair rail"]);
const BAR = new Set(["zinc", "bar front", "underbar", "foot rail", "stool foot", "stool post", "stool", "pendant", "cord", "fruit bowl", "orange", "lemon", "peach", "board", "lemon slice", "knife", "knife handle", "bar mat", "shaker tin", "cake stand", "cake plate", "cloche", "cloche knob"]);
const BACK = new Set(["back bar", "shelf", "bottle", "bottle neck"]);
const REST = new Set(["pass", "heat lamp", "ticket rail", "ticket", "dessert plate", "plates", "host stand", "menus", "book", "mints", "station", "cutlery tray", "carafe", "carafe neck", "tumbler", "banquette", "banquette back", "mirror", "chalkboard", "print", "exit sign"]);

/** Which part draws a solid of the world, or null for the room's shell (walls, the glass, the shop front, the ceiling). */
export function owner(solid: Solid): PartName | null {
  const n = solid.name;
  if (FURNITURE.has(n)) return "tables";
  if (TABLE_THINGS.has(n)) return (solid.bottom ?? 0) >= ZINC_BAR.zinc.top - 1 ? "counter" : "tabletop";
  if (BAR.has(n)) return "counter";
  // The foot rail's brackets are the bar's; the heat lamps' are the pass's.
  if (n === "bracket") return solid.footprint.x < 0 ? "counter" : "rest";
  if (BACK.has(n)) return "backbar";
  if (REST.has(n)) return "rest";
  return null;
}
