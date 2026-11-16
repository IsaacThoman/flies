// The lab bench: the bench of a fruit-fly lab, with a stereo microscope, vials
// of flies' food, a dish of grape agar and a notebook, in a quiet lab with
// windows behind it.

import { LAB } from "@fly/world";
import type { Palettes } from "../../scene/light.ts";
import type { Scene } from "../types.ts";
import { buildBench } from "./bench.ts";
import { buildRoom } from "./room.ts";

/**
 * The lab's light through the day. By day the fluorescent panels light it
 * evenly (the hemisphere, cool white) and the "sun" is the daylight from the
 * windows behind the bench; from dusk the panels are off and the "sun" is the
 * desk lamp, low, warm and from its side of the bench (the lamp's own pool of
 * light is a light in the set, which comes on as `stars` rises).
 *
 * Indoors, zenith, middle and horizon are the room as the fly's eyes and the
 * glossy things on the bench see it (ceiling, walls, the windows' glow), and
 * haze its air; the sky through the windows is `water` high up and `cloud`
 * low down, and `glow` how much the sun lights it.
 */
const PALETTES: Palettes = {
  morning: { zenith: "#a9b0b9", middle: "#b4b9bf", horizon: "#c8c6bf", sunUp: 0.3, sunAround: -0.45, sun: "#ffe2bc", sunIntensity: 0.62, sky: "#e9eef6", ground: "#9a9a96", hemiIntensity: 0.9, haze: "#cfd5dc", water: "#5f9fe2", cloud: "#dceaf6", stars: 0, glow: 0.45, env: 0.8 },
  noon: { zenith: "#aeb4bc", middle: "#b8bdc2", horizon: "#cbcac5", sunUp: 0.62, sunAround: 0.12, sun: "#fff8ec", sunIntensity: 0.72, sky: "#eef2f8", ground: "#9d9d9a", hemiIntensity: 0.95, haze: "#d7dbe0", water: "#3c86de", cloud: "#cfe3f6", stars: 0, glow: 0.3, env: 0.85 },
  golden: { zenith: "#9a948e", middle: "#a69a8c", horizon: "#dcb27e", sunUp: 0.3, sunAround: 0.55, sun: "#ffa955", sunIntensity: 0.75, sky: "#e3e6ec", ground: "#958f86", hemiIntensity: 0.7, haze: "#d8c8b4", water: "#6b8cd0", cloud: "#ffc68a", stars: 0, glow: 0.8, env: 0.8 },
  dusk: { zenith: "#2b3044", middle: "#363850", horizon: "#634e5c", sunUp: 0.95, sunAround: 1.1, sun: "#ffbe86", sunIntensity: 0.22, sky: "#4c5578", ground: "#26262e", hemiIntensity: 0.42, haze: "#33364c", water: "#33407e", cloud: "#e88f7c", stars: 0.65, glow: 0.55, env: 0.6 },
  night: { zenith: "#12151f", middle: "#161a25", horizon: "#1f2130", sunUp: 0.95, sunAround: 1.1, sun: "#ffc68e", sunIntensity: 0.12, sky: "#2a3350", ground: "#111116", hemiIntensity: 0.3, haze: "#10131d", water: "#0a1133", cloud: "#1c2853", stars: 1, glow: 0.1, env: 0.45 },
};

export const lab: Scene = {
  id: "lab",
  place: LAB,
  palettes: PALETTES,
  buildSet: buildBench,
  buildBackdrop: buildRoom,
  camera: {
    whole: { around: "table", distance: 640, height: 200, side: 0.3, low: 0, fov: 40, settle: 1.6, orbit: 0.03 },
    // The windows.
    vista: { x: 0, z: -1 },
  },
  // It sees the weather through its windows: a grey day dims the daylight from them, and little else.
  open: 0.4,
  ambience: "lab",
  bubbles: false,
  fireflies: false,
};
