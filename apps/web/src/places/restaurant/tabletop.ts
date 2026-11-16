// What is on the tables: the start table's sugar, vase, votive and spilt
// packet, the shakers, a glass of wine left, the ketchup and a menu, the
// bread basket, an espresso cup; crumbs, sugar, rings; and what is on the
// floor.

import type { Part } from "./parts.ts";
import { generic } from "./standins.ts";

export const tabletop: Part = {
  build(b, solids) {
    for (const s of solids) generic(b, s, true, true);
  },
};
