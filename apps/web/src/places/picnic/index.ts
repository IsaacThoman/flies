// The picnic: a round white café table by a lake on a sunny day, with lemonade,
// jam, fruit and sugar on it, under an open sky with hills and lollipop trees.

import { PICNIC } from "@fly/world";
import type { Palettes } from "../../scene/light.ts";
import type { Scene } from "../types.ts";
import { buildBackdrop } from "./backdrop.ts";
import { buildTable } from "./table.ts";

/** The open air's light through the day. */
const PALETTES: Palettes = {
  morning: { zenith: "#2f7fe0", middle: "#7cc0f4", horizon: "#e8f4ff", sunUp: 0.42, sunAround: 2.2, sun: "#fff1d6", sunIntensity: 1.43, sky: "#d8ecff", ground: "#8cc46a", hemiIntensity: 0.96, haze: "#cfe6fb", water: "#2d8fd6", cloud: "#ffffff", stars: 0, glow: 0.25, env: 1 },
  noon: { zenith: "#0f5fd8", middle: "#45a3f2", horizon: "#d9f0ff", sunUp: 1.05, sunAround: 2.6, sun: "#fffaf0", sunIntensity: 1.65, sky: "#dff0ff", ground: "#7dbf55", hemiIntensity: 1.08, haze: "#c4e3fb", water: "#1679cc", cloud: "#ffffff", stars: 0, glow: 0.18, env: 1.1 },
  golden: { zenith: "#3d6fd0", middle: "#9fb8e8", horizon: "#ffd9a0", sunUp: 0.2, sunAround: 0.8, sun: "#ffc27a", sunIntensity: 1.32, sky: "#ffe2bf", ground: "#a3b85a", hemiIntensity: 0.78, haze: "#f6d6b0", water: "#3a7cc0", cloud: "#ffe6c8", stars: 0, glow: 0.55, env: 0.95 },
  dusk: { zenith: "#24306e", middle: "#7a5aa8", horizon: "#ff9a7a", sunUp: 0.03, sunAround: 0.3, sun: "#ff8a5c", sunIntensity: 0.66, sky: "#b9a3d8", ground: "#5a6e58", hemiIntensity: 0.60, haze: "#c49ab8", water: "#43508e", cloud: "#ffb6a8", stars: 0.3, glow: 0.7, env: 0.7 },
  night: { zenith: "#050b2a", middle: "#10245a", horizon: "#2f4f8c", sunUp: 0.7, sunAround: -0.5, sun: "#b8ccff", sunIntensity: 0.30, sky: "#3c5590", ground: "#1d2c3c", hemiIntensity: 0.45, haze: "#1c2f5c", water: "#0e2050", cloud: "#5c6c9c", stars: 1, glow: 0.1, env: 0.45 },
};

export const picnic: Scene = {
  id: "picnic",
  place: PICNIC,
  palettes: PALETTES,
  buildSet: buildTable,
  buildBackdrop,
  camera: {
    whole: { around: "table", distance: 560, height: 170, side: 0.25, low: 0, fov: 40, settle: 1.6, orbit: 0.03 },
    // The lake.
    vista: { x: 0, z: -1 },
  },
  bubbles: true,
  fireflies: true,
};
