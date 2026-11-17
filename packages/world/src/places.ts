// Every place by its id, for what needs the place a table is in without
// drawing it: the room server. The game's own list, with the places' names,
// is apps/web/src/places/catalog.ts (a test holds them to the same ids).

import { GREENHOUSE } from "./greenhouse.ts";
import { BAR } from "./bar.ts";
import { LAB } from "./lab.ts";
import { PICNIC } from "./picnic.ts";
import { RESTAURANT } from "./restaurant.ts";
import { WINDOWSILL } from "./windowsill.ts";
import type { Place } from "./world.ts";

export const WORLDS: Readonly<Record<string, Place>> = { greenhouse: GREENHOUSE, picnic: PICNIC, windowsill: WINDOWSILL, lab: LAB, bar: BAR, restaurant: RESTAURANT };
