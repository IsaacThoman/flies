import { GREENHOUSE } from "@fly/world";
import type { Scene } from "../types.ts";
import { picnic } from "../picnic/index.ts";
import { buildBackdrop } from "../windowsill/backdrop.ts";
import { buildBench } from "./set.ts";

export const greenhouse: Scene = {
  id: "greenhouse", place: GREENHOUSE,
  palettes: picnic.palettes,
  buildSet: buildBench,
  buildBackdrop,
  camera: {
    whole: { around: "table", distance: 600, height: 260, side: 0.08, low: 0, fov: 55, settle: 1.6 },
    vista: { x: 0, z: -1 },
  },
  open: 0.7, bubbles: false, fireflies: true,
};
