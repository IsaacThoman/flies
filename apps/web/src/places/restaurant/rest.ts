// The rest of the room's things: the kitchen's pass, the host's stand by the
// door, the service station, the banquette, and what hangs on the walls (the
// mirror, the chalkboard, the print, the exit sign).

import type { Part } from "./parts.ts";
import { generic } from "./standins.ts";

export const rest: Part = {
  build(b, solids) {
    for (const s of solids) generic(b, s, true, true);
  },
};
