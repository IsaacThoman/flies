// The bar: the polished walnut counter of a small, warm bar, with a cocktail,
// a beer, salted peanuts, cherries and a candle in a storm lantern on it,
// bottles glowing on the back bar, and a street window off the counter's end.

import { BAR } from "@fly/world";
import type { Palettes } from "../../scene/light.ts";
import type { Scene } from "../types.ts";
import { buildBackdrop } from "./backdrop.ts";
import { buildBar } from "./counter.ts";

/**
 * The bar's light through the day. By day the sun is the daylight at the
 * window, quiet and soft (the window faces the sunset, so only at golden hour
 * does the sun itself come in, low and gold); the room is unlit. From golden
 * hour the lamps and the candle are lit (`glow`: 0 off to 1 full), and after
 * dark the "sun" is the warm glow of the back bar. Zenith, horizon and ground
 * are the room as glass and varnish reflect it and as the fly's eyes see
 * it; `middle` and `haze` are the sky through the window, `water` the houses
 * across the square as the light falls on them, `cloud` their lit windows
 * and the street lamps.
 */
const PALETTES: Palettes = {
  morning: { zenith: "#7a7468", middle: "#9cc0e4", horizon: "#b4ac9c", sunUp: 0.5, sunAround: -Math.PI / 2 - 0.25, sun: "#fff2e2", sunIntensity: 2.4, sky: "#c4ccd4", ground: "#6a5040", hemiIntensity: 0.42, haze: "#dce6ec", water: "#f2e2c8", cloud: "#ffd8a0", stars: 0, glow: 0, env: 0.9 },
  noon: { zenith: "#888070", middle: "#5f9ae0", horizon: "#c0b8a4", sunUp: 0.68, sunAround: -Math.PI / 2 + 0.2, sun: "#fff8ee", sunIntensity: 2.5, sky: "#d4dce4", ground: "#7a5a44", hemiIntensity: 0.46, haze: "#cfe0ee", water: "#e8e2d6", cloud: "#ffd8a0", stars: 0, glow: 0, env: 1 },
  golden: { zenith: "#6a5040", middle: "#7a90c8", horizon: "#dca070", sunUp: 0.2, sunAround: -Math.PI / 2 + 0.32, sun: "#ffb46a", sunIntensity: 5.4, sky: "#d8b090", ground: "#4a2e1e", hemiIntensity: 0.2, haze: "#ffb070", water: "#6a5058", cloud: "#ffb060", stars: 0, glow: 0.28, env: 0.95 },
  dusk: { zenith: "#2a1c18", middle: "#2c3a7a", horizon: "#7a4a30", sunUp: 0.55, sunAround: 0.12, sun: "#ffa060", sunIntensity: 0.6, sky: "#4a4c66", ground: "#24160e", hemiIntensity: 0.26, haze: "#d8806a", water: "#363c58", cloud: "#ffb060", stars: 0.45, glow: 0.85, env: 0.75 },
  night: { zenith: "#140e0c", middle: "#0a1030", horizon: "#5a3418", sunUp: 0.45, sunAround: 0.15, sun: "#ff9850", sunIntensity: 0.5, sky: "#302830", ground: "#180e08", hemiIntensity: 0.18, haze: "#2a2848", water: "#1c1e2c", cloud: "#ffb060", stars: 1, glow: 1, env: 0.6 },
};

export const bar: Scene = {
  id: "bar",
  place: BAR,
  palettes: PALETTES,
  buildSet: buildBar,
  buildBackdrop,
  camera: {
    whole: { around: "table", distance: 640, height: 230, side: 0.2, low: 0, fov: 40, settle: 1.6, orbit: 0.02 },
    // The back bar's bottles, and the window.
    vista: { x: -0.45, z: -Math.sqrt(1 - 0.45 * 0.45) },
  },
  // It sees the weather through its street window.
  open: 0.35,
  // Its shading is the TV's heaviest but the restaurant's: the company's eyes a quarter as often.
  companionEyes: 0.25,
  bubbles: false,
  fireflies: false,
};
