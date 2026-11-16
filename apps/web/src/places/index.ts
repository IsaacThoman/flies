import { kitchen } from "./kitchen/index.ts";
// Every place the fly can live, by id (catalog.ts lists them in order).

import type { PlaceId } from "./catalog.ts";
import { bar } from "./bar/index.ts";
import { lab } from "./lab/index.ts";
import { picnic } from "./picnic/index.ts";
import { restaurant } from "./restaurant/index.ts";
import type { Scene } from "./types.ts";
import { windowsill } from "./windowsill/index.ts";

export const SCENES: Readonly<Record<PlaceId, Scene>> = { picnic, windowsill, lab, bar, restaurant, kitchen };
