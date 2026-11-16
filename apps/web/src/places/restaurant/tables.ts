// The tables and their chairs: marble tops on cast iron in the window and
// along the banquette, oak four-tops in the middle of the room, bentwood
// chairs pushed in or upturned for the night.

import type { Part } from "./parts.ts";
import { generic } from "./standins.ts";

export const tables: Part = {
  build(b, solids) {
    for (const s of solids) generic(b, s, true, true);
  },
};
