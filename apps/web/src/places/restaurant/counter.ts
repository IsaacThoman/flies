// The zinc bar: its top, its panelled front, the bartender's counter behind
// it, the brass foot rail, the stools, the pendants over it (the middle one
// left on), and what is left on the zinc.

import type { Part } from "./parts.ts";
import { generic } from "./standins.ts";

export const counter: Part = {
  build(b, solids) {
    for (const s of solids) generic(b, s, true, true);
  },
};
