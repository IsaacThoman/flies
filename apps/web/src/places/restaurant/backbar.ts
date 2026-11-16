// The back bar: its cabinets with the drinks fridge's glass doors, the
// shelves of bottles before the mirror, and the bottles on the window's
// ledge.

import type { Part } from "./parts.ts";
import { generic } from "./standins.ts";

export const backbar: Part = {
  build(b, solids) {
    for (const s of solids) generic(b, s, true, true);
  },
};
