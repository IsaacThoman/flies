// The light of the day: five times of day the player can choose between, and
// everything that follows from one (the sky, the sun, the lights, the haze,
// the water), eased from one to the next.

import * as THREE from "three";

export type TimeOfDay = "morning" | "noon" | "golden" | "dusk" | "night";
export const TIMES: readonly TimeOfDay[] = ["morning", "noon", "golden", "dusk", "night"];
export const TIME_NAMES: Record<TimeOfDay, string> = { morning: "Morning", noon: "Midday", golden: "Golden hour", dusk: "Dusk", night: "Night" };

type Palette = {
  zenith: string;
  middle: string;
  horizon: string;
  /** Elevation and azimuth of the sun (or moon), radians. */
  sunUp: number;
  sunAround: number;
  sun: string;
  sunIntensity: number;
  sky: string;
  ground: string;
  hemiIntensity: number;
  haze: string;
  water: string;
  cloud: string;
  stars: number;
  /** How much the glow of the sun spreads through the sky. */
  glow: number;
  /** Exposure of the environment reflections. */
  env: number;
};

const PALETTES: Record<TimeOfDay, Palette> = {
  morning: { zenith: "#2f7fe0", middle: "#7cc0f4", horizon: "#e8f4ff", sunUp: 0.42, sunAround: 2.2, sun: "#fff1d6", sunIntensity: 1.43, sky: "#d8ecff", ground: "#8cc46a", hemiIntensity: 0.96, haze: "#cfe6fb", water: "#2d8fd6", cloud: "#ffffff", stars: 0, glow: 0.25, env: 1 },
  noon: { zenith: "#0f5fd8", middle: "#45a3f2", horizon: "#d9f0ff", sunUp: 1.05, sunAround: 2.6, sun: "#fffaf0", sunIntensity: 1.65, sky: "#dff0ff", ground: "#7dbf55", hemiIntensity: 1.08, haze: "#c4e3fb", water: "#1679cc", cloud: "#ffffff", stars: 0, glow: 0.18, env: 1.1 },
  golden: { zenith: "#3d6fd0", middle: "#9fb8e8", horizon: "#ffd9a0", sunUp: 0.2, sunAround: 0.8, sun: "#ffc27a", sunIntensity: 1.32, sky: "#ffe2bf", ground: "#a3b85a", hemiIntensity: 0.78, haze: "#f6d6b0", water: "#3a7cc0", cloud: "#ffe6c8", stars: 0, glow: 0.55, env: 0.95 },
  dusk: { zenith: "#24306e", middle: "#7a5aa8", horizon: "#ff9a7a", sunUp: 0.03, sunAround: 0.3, sun: "#ff8a5c", sunIntensity: 0.66, sky: "#b9a3d8", ground: "#5a6e58", hemiIntensity: 0.60, haze: "#c49ab8", water: "#43508e", cloud: "#ffb6a8", stars: 0.3, glow: 0.7, env: 0.7 },
  night: { zenith: "#050b2a", middle: "#10245a", horizon: "#2f4f8c", sunUp: 0.7, sunAround: -0.5, sun: "#b8ccff", sunIntensity: 0.30, sky: "#3c5590", ground: "#1d2c3c", hemiIntensity: 0.45, haze: "#1c2f5c", water: "#0e2050", cloud: "#5c6c9c", stars: 1, glow: 0.1, env: 0.45 },
};

/** The light as it is now, eased toward the chosen time of day. */
export class Daylight {
  readonly zenith = new THREE.Color();
  readonly middle = new THREE.Color();
  readonly horizon = new THREE.Color();
  readonly sunDirection = new THREE.Vector3();
  readonly sunColor = new THREE.Color();
  sunIntensity = 0;
  readonly skyColor = new THREE.Color();
  readonly groundColor = new THREE.Color();
  hemiIntensity = 0;
  readonly haze = new THREE.Color();
  readonly water = new THREE.Color();
  readonly cloud = new THREE.Color();
  stars = 0;
  glow = 0;
  env = 1;
  time: TimeOfDay;
  /** 0 to 1 through a change of time; 1 when settled. */
  #blend = 1;
  #from: Palette;
  #to: Palette;
  #up = 0;
  #around = 0;

  constructor(time: TimeOfDay) {
    this.time = time;
    this.#from = PALETTES[time];
    this.#to = PALETTES[time];
    this.#apply(1);
  }

  get settled() {
    return this.#blend >= 1;
  }

  set(time: TimeOfDay) {
    if (time === this.time) return;
    this.#from = this.#snapshot();
    this.#to = PALETTES[time];
    this.time = time;
    this.#blend = 0;
  }

  /** Advances a change of time; true while the light is changing. */
  update(dt: number): boolean {
    if (this.#blend >= 1) return false;
    this.#blend = Math.min(1, this.#blend + dt / 2.5);
    const k = this.#blend * this.#blend * (3 - 2 * this.#blend);
    this.#apply(k);
    return true;
  }

  #snapshot(): Palette {
    const hex = (c: THREE.Color) => `#${c.getHexString()}`;
    return {
      zenith: hex(this.zenith), middle: hex(this.middle), horizon: hex(this.horizon), sunUp: this.#up, sunAround: this.#around,
      sun: hex(this.sunColor), sunIntensity: this.sunIntensity, sky: hex(this.skyColor), ground: hex(this.groundColor), hemiIntensity: this.hemiIntensity,
      haze: hex(this.haze), water: hex(this.water), cloud: hex(this.cloud), stars: this.stars, glow: this.glow, env: this.env,
    };
  }

  #apply(k: number) {
    const a = this.#from;
    const b = this.#to;
    const mix = (out: THREE.Color, x: string, y: string) => out.set(x).lerp(tmp.set(y), k);
    const num = (x: number, y: number) => x + (y - x) * k;
    mix(this.zenith, a.zenith, b.zenith);
    mix(this.middle, a.middle, b.middle);
    mix(this.horizon, a.horizon, b.horizon);
    mix(this.sunColor, a.sun, b.sun);
    mix(this.skyColor, a.sky, b.sky);
    mix(this.groundColor, a.ground, b.ground);
    mix(this.haze, a.haze, b.haze);
    mix(this.water, a.water, b.water);
    mix(this.cloud, a.cloud, b.cloud);
    this.sunIntensity = num(a.sunIntensity, b.sunIntensity);
    this.hemiIntensity = num(a.hemiIntensity, b.hemiIntensity);
    this.stars = num(a.stars, b.stars);
    this.glow = num(a.glow, b.glow);
    this.env = num(a.env, b.env);
    // The sun goes the short way round.
    let around = b.sunAround - a.sunAround;
    around = Math.atan2(Math.sin(around), Math.cos(around));
    this.#around = a.sunAround + around * k;
    this.#up = num(a.sunUp, b.sunUp);
    // Azimuth from -z (the lake) toward +x.
    this.sunDirection.set(Math.sin(this.#around) * Math.cos(this.#up), Math.sin(this.#up), -Math.cos(this.#around) * Math.cos(this.#up)).normalize();
  }
}

const tmp = new THREE.Color();
