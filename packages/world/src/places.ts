// Every place a table can be in, by its id, for what needs the place without
// drawing it: the room server. The game's own list, with the places' names,
// is apps/web/src/places/catalog.ts (a test holds them to the same ids). The
// restaurant isn't one: a fly's state on the table's wire carries where it is
// to ±655 mm (packages/net/src/protocol.ts), a table's size, not a room's.

import { BAR } from "./bar.ts";
import { LAB } from "./lab.ts";
import { PICNIC } from "./picnic.ts";
import { WINDOWSILL } from "./windowsill.ts";
import type { Place } from "./world.ts";

export const WORLDS: Readonly<Record<string, Place>> = { picnic: PICNIC, windowsill: WINDOWSILL, lab: LAB, bar: BAR };
