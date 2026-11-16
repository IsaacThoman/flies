// Every place the fly can live, by id (catalog.ts lists them in order).

import type { PlaceId } from "./catalog.ts";
import { picnic } from "./picnic/index.ts";
import type { Scene } from "./types.ts";

export const SCENES: Readonly<Record<PlaceId, Scene>> = { picnic };
