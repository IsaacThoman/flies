// What is on the tables: the start table's sugar caddy, bud vase, votive,
// torn packet and the glass of wine left there; salt and pepper on most
// tables; the ketchup and a menu, the bread basket, an espresso cup; the
// crumbs, sugar and the wine's ring the world has as food, and the grains,
// dust and lint round them at a fly's scale; and the food on the floor (the
// soda by the bar, a grape under a window table). Shapes are in
// tabletop-caddy.ts, tabletop-glass.ts, tabletop-food.ts and
// tabletop-litter.ts, their own kinds' looks in tabletop-glsl.ts.

import { RESTAURANT_PATCHES, RESTAURANT_START, START_TABLE, TABLES, TABLE_TOPS } from "@fly/world";
import type { Solid } from "@fly/world";
import { random } from "../../scene/build.ts";
import { AREAS, areaAt, areaOf, distanceTo } from "./areas.ts";
import type { Part } from "./parts.ts";
import { sugarCaddy } from "./tabletop-caddy.ts";
import { breadBasket, espresso, grape, leftCrumbs, menu, soda, tornPacket } from "./tabletop-food.ts";
import { budVase, ketchup, shakers, votive, wineGlass } from "./tabletop-glass.ts";
import { litter, sugar, sugarTrail, wineRing } from "./tabletop-litter.ts";
import { TABLETOP_CLEAR, TABLETOP_SOLID } from "./tabletop-glsl.ts";

/** The world's food by name, in order. */
const food = (name: string) => RESTAURANT_PATCHES.filter((p) => p.name === name);

/** The area a point is in, or the nearest one: food on the floor in no area is drawn with what is near it. */
function areaNear(x: number, y: number, z: number) {
  const inside = areaAt(x, y, z);
  if (inside) return inside;
  let best = AREAS[0];
  for (const a of AREAS) if (distanceTo(a, x, y, z) < distanceTo(best, x, y, z)) best = a;
  return best.id;
}

export const tabletop: Part = {
  build(b, solids) {
    const named = (name: string) => solids.filter((s) => s.name === name);
    const tableOf = (id: string) => {
      const t = TABLES.find((t) => t.id === id);
      if (!t || t.kind !== "round") throw new Error(`No round table ${id}`);
      return { x: t.x, z: t.z, r: TABLE_TOPS.round.r, y: TABLE_TOPS.round.top };
    };
    const one = (name: string): Solid => {
      const s = named(name)[0];
      if (!s) throw new Error(`No ${name} on the tables`);
      return s;
    };
    const rnd = random(108);

    // The start table, and what lies on it at the fly's scale, most round where it starts.
    const start = areaOf(one("sugar caddy"));
    const table = tableOf("window");
    sugarCaddy(b, start, one("sugar caddy"));
    budVase(b, start, one("bud vase"), one("flower stem"), one("flower"));
    votive(b, start, one("votive"));
    const [spill, onPacket] = food("sugar");
    const crystals = tornPacket(b, start, one("sugar packet"), spill, onPacket, rnd);
    sugarTrail(crystals, rnd, spill, RESTAURANT_START, 90, table.y);
    litter(b, start, table, RESTAURANT_START, solids.filter((s) => areaOf(s) === start), rnd, { grains: 380, dust: 1400, lint: 22, crumbs: 22 }, crystals);
    sugar(b, start, crystals);
    wineGlass(b, start, one("glass foot"), one("glass stem"), one("wine glass"));
    wineRing(b, start, START_TABLE.ring, START_TABLE.ring.r, food("wine ring"), table.y, rnd);

    // Salt and pepper, in pairs; a few crumbs left by each pair.
    const pairs = named("shaker");
    shakers(b, pairs, areaOf);
    pairs.forEach((s, i) => {
      if (i % 2 === 0 && areaOf(s) !== start) leftCrumbs(b, areaOf(s), s.footprint.x - 60, s.footprint.z - 40, s.bottom ?? 0, rnd, 10);
    });

    // The left window table: the ketchup and the menu with ketchup on it.
    const bottle = one("ketchup");
    ketchup(b, areaOf(bottle), bottle, one("ketchup neck"), one("ketchup cap"));
    const card = one("menu");
    menu(b, areaOf(card), card, food("ketchup")[1], rnd);
    litter(b, areaOf(card), tableOf("window-left"), bottle.footprint, solids.filter((s) => areaOf(s) === areaOf(card)), rnd, { grains: 0, dust: 120, lint: 3, crumbs: 8 }, []);

    // The right window table: the bread basket, crumbs in it and brushed off it.
    const basket = one("bread basket");
    const [inBasket, onTable] = food("crumbs");
    breadBasket(b, areaOf(basket), basket, one("bread"), inBasket, rnd);
    leftCrumbs(b, areaOf(basket), onTable.x, onTable.z, onTable.y ?? basket.bottom ?? 0, rnd, 45, onTable.r);
    litter(b, areaOf(basket), tableOf("window-right"), onTable, solids.filter((s) => areaOf(s) === areaOf(basket)), rnd, { grains: 0, dust: 120, lint: 4, crumbs: 30 }, []);

    // The banquette: the espresso cup.
    const saucer = one("saucer");
    espresso(b, areaOf(saucer), saucer, one("espresso cup"), one("cup handle"), rnd);

    // On the floor.
    const [spilt] = food("soda");
    soda(b, areaNear(spilt.x, 1, spilt.z), spilt, rnd);
    const [trodden] = food("grape");
    grape(b, areaNear(trodden.x, 1, trodden.z), trodden, rnd);
  },
  solid: TABLETOP_SOLID,
  clear: TABLETOP_CLEAR,
};
