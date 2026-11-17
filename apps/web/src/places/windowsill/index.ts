// The windowsill: a deep painted sill in a cottage kitchen, a bowl of fruit, a
// pot of basil and a bottle of orange juice on it, and through the window a garden and
// the backs of a little street of houses.

import { WINDOWSILL } from "@fly/world";
import type { Palettes } from "../../scene/light.ts";
import type { Scene } from "../types.ts";
import { buildBackdrop } from "./backdrop.ts";
import { buildSill } from "./sill.ts";

/**
 * Indoors the "sun" is the light that comes in at the window (from -z), so it
 * swings across the sill through the day; from dusk it is the lamp over the
 * kitchen table, behind the camera, high enough (scene/light.ts, SETTING) that
 * on "Now" it stays lit and still through the night rather than setting like
 * a sun. The hemisphere light is the room's own light, bounced warm off its
 * walls; the sky colours are what is seen through the glass.
 */
const PALETTES: Palettes = {
  morning: { zenith: "#4c8ad6", middle: "#9cc6ee", horizon: "#f7e2c8", sunUp: 0.4, sunAround: -0.72, sun: "#ffeccc", sunIntensity: 2.1, sky: "#f2e8d8", ground: "#c9a98a", hemiIntensity: 0.6, haze: "#dfe7ee", water: "#7aa8c8", cloud: "#fff7ee", stars: 0, glow: 0.35, env: 0.9 },
  noon: { zenith: "#2a6fd6", middle: "#6aaef0", horizon: "#d8ecfa", sunUp: 0.92, sunAround: 0.12, sun: "#fff6e6", sunIntensity: 2.3, sky: "#fbf2e4", ground: "#d6b898", hemiIntensity: 0.62, haze: "#cfe2f2", water: "#5a98c8", cloud: "#ffffff", stars: 0, glow: 0.2, env: 1 },
  golden: { zenith: "#3d64b6", middle: "#a8a6cc", horizon: "#ffc684", sunUp: 0.26, sunAround: 0.82, sun: "#ffb066", sunIntensity: 2.2, sky: "#f6d6b6", ground: "#c99372", hemiIntensity: 0.55, haze: "#efcfa8", water: "#6a88b0", cloud: "#ffd6a6", stars: 0, glow: 0.62, env: 0.9 },
  dusk: { zenith: "#25306a", middle: "#7b5aa0", horizon: "#ff9479", sunUp: 0.36, sunAround: Math.PI - 0.2, sun: "#ffbc7a", sunIntensity: 0.85, sky: "#9b96ae", ground: "#6a5450", hemiIntensity: 0.57, haze: "#b68aa6", water: "#4a5088", cloud: "#f2a090", stars: 0.45, glow: 0.72, env: 0.55 },
  night: { zenith: "#060c26", middle: "#0f1f4a", horizon: "#23386a", sunUp: 0.36, sunAround: Math.PI - 0.2, sun: "#ffd29c", sunIntensity: 1.05, sky: "#8192a8", ground: "#62503e", hemiIntensity: 0.6, haze: "#142040", water: "#16244a", cloud: "#38486a", stars: 1, glow: 0.1, env: 0.5 },
};

export const windowsill: Scene = {
  id: "windowsill",
  place: WINDOWSILL,
  palettes: PALETTES,
  buildSet: buildSill,
  buildBackdrop,
  camera: {
    // From the kitchen, never through the window: it holds still rather than circling.
    whole: { around: "table", distance: 560, height: 95, side: 0.08, low: 0, fov: 44, settle: 1.6 },
    // The window.
    vista: { x: 0, z: -1 },
  },
  // It sees the sky through a big window: a grey day dims the sun coming in, and after dark, lit by its lamp, it hardly feels the weather.
  open: 0.5,
  bubbles: false,
  fireflies: false,
};
