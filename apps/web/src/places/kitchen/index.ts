import { KITCHEN } from "@fly/world";
import type { Scene } from "../types.ts";
import { buildSet } from "./set.ts";
import { buildBackdrop } from "./backdrop.ts";
import { PALETTES } from "./palettes.ts";

export const kitchen: Scene = {
  id: "kitchen",
  place: KITCHEN,
  palettes: PALETTES,
  buildSet,
  buildBackdrop,
  camera: {
    whole: {
      around: "table",
      distance: 1000,
      height: 490,
      side: 0.08,
      low: 0,
      fov: 48,
      settle: 1.6,
    },
    vista: { x: 0, z: -1 },
  },
  open: 0.45,
  bubbles: false,
  fireflies: false,
};
