// The restaurant: a small city bistro, closed for the night. A whole room for
// the fly to live in, not a tabletop: marble tables in the window, oak
// four-tops with the chairs up on two of them, a zinc bar with one lamp left
// on over it, the drinks fridge glowing behind, the kitchen's pass at the
// back, and the street outside the shop front, its lamps and its passing
// cars throwing their light in.

import { RESTAURANT, RESTAURANT_START } from "@fly/world";
import type { Palettes } from "../../scene/light.ts";
import type { Scene } from "../types.ts";
import { buildStreet } from "./street.ts";
import { buildRestaurant } from "./set.ts";
import { NEAR_LAMP } from "./street/layout.ts";

/** The way to the street lamp outside from the start table: after dark the "sun" comes from it, so its glint on the marble is where the lamp is. */
const LAMP = (() => {
  const dx = NEAR_LAMP.x - RESTAURANT_START.x;
  const dy = NEAR_LAMP.y - RESTAURANT_START.y;
  const dz = NEAR_LAMP.z - RESTAURANT_START.z;
  const up = Math.atan2(dy, Math.hypot(dx, dz));
  // Azimuth from -z toward +x (scene/light.ts).
  return { up, around: Math.atan2(dx, -dz) };
})();

/**
 * The restaurant's light through the day. By day the sun is the daylight
 * coming in at the shop front: soft from the sky in the morning and at noon,
 * the sun itself low through the glass at golden hour; the room's lamps are
 * off. After dark the "sun" is the street lamp's glint: its light comes in
 * through the glass with the cars' and the neon's on their own (traffic.ts),
 * and the room's lights (the pendant, the fridge, the exit
 * sign, the kitchen) are its own (set.ts). Zenith, horizon and ground are the
 * room as its glossy things reflect it and as the fly's eyes see it;
 * `middle` and `haze` are the sky over the street and its air (street.ts).
 */
const PALETTES: Palettes = {
  morning: { zenith: "#8a8478", middle: "#9cc2e6", horizon: "#b8b0a0", sunUp: 0.42, sunAround: Math.PI + 0.1, sun: "#fff0dc", sunIntensity: 1.0, sky: "#c4c8cc", ground: "#6a5a4c", hemiIntensity: 0.42, haze: "#d8e2ea", water: "#f0e2cc", cloud: "#ffe0b0", stars: 0, glow: 0, env: 0.55 },
  noon: { zenith: "#928c80", middle: "#6aa2e2", horizon: "#c0b8a8", sunUp: 0.7, sunAround: Math.PI - 0.15, sun: "#fff8ee", sunIntensity: 1.1, sky: "#d0d6dc", ground: "#76604e", hemiIntensity: 0.46, haze: "#d2e2ee", water: "#ece6da", cloud: "#ffe0b0", stars: 0, glow: 0, env: 0.6 },
  golden: { zenith: "#7a5e48", middle: "#7e94c8", horizon: "#dca474", sunUp: 0.13, sunAround: Math.PI + 0.5, sun: "#ffb26a", sunIntensity: 4.2, sky: "#d6b496", ground: "#4a3022", hemiIntensity: 0.2, haze: "#ffb47a", water: "#7a5a58", cloud: "#ffb060", stars: 0, glow: 0.2, env: 0.55 },
  dusk: { zenith: "#2c2420", middle: "#2c3a78", horizon: "#6a4232", sunUp: LAMP.up, sunAround: LAMP.around, sun: "#c8b8d8", sunIntensity: 0.14, sky: "#4a4e6a", ground: "#22160e", hemiIntensity: 0.16, haze: "#c8806a", water: "#363c58", cloud: "#ffb060", stars: 0.55, glow: 0.8, env: 0.4 },
  night: { zenith: "#16100c", middle: "#0a1030", horizon: "#3a2414", sunUp: LAMP.up, sunAround: LAMP.around, sun: "#ffc890", sunIntensity: 0.12, sky: "#2a2622", ground: "#120c08", hemiIntensity: 0.12, haze: "#2a2848", water: "#1c1e2c", cloud: "#ffb060", stars: 1, glow: 1, env: 0.3 },
};

export const restaurant: Scene = {
  id: "restaurant",
  place: RESTAURANT,
  palettes: PALETTES,
  buildSet: buildRestaurant,
  buildBackdrop: buildStreet,
  camera: {
    // From high in the back corner by the kitchen door, across the tables to the windows and the bar; following the fly a little.
    whole: { around: "table", distance: 3300, height: 1900, side: 2.3, low: 0.05, fov: 55, settle: 2.2 },
    focus: { x: -500, y: 500, z: 700, follow: 0.12, aim: 0.75 },
    // The street, through the shop front.
    vista: { x: 0, z: 1 },
  },
  // The room is ten metres corner to corner: its near pass reaches across it.
  reach: 12_000,
  // Big windows: a grey day greys it, and after dark the street's lamps and the room's own light it.
  open: 0.5,
  ambience: "restaurant",
  bubbles: false,
  fireflies: false,
};
