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
    whole: { around: "table", distance: 610, height: 180, side: 0.15, low: 0, fov: 52, settle: 1.6 },
    vista: { x: -0.6, z: -0.8 },
  },
  open: 0.7, bubbles: false, fireflies: true,
};
