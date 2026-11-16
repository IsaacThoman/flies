// The light of the day: five times of day the player can choose between, and
// everything that follows from one (the sky, the sun, the lights, the haze,
// the water), eased from one to the next. Each place has its own palettes
// (apps/web/src/places).

import * as THREE from "three";

export type TimeOfDay = "morning" | "noon" | "golden" | "dusk" | "night";
export const TIMES: readonly TimeOfDay[] = ["morning", "noon", "golden", "dusk", "night"];
export const TIME_NAMES: Record<TimeOfDay, string> = { morning: "Morning", noon: "Midday", golden: "Golden hour", dusk: "Dusk", night: "Night" };

/** The time of day outside, by the clock: what "Now" on the Light tool shows. */
export function timeFromClock(date: Date): TimeOfDay {
  const h = date.getHours() + date.getMinutes() / 60;
  if (h >= 5.5 && h < 9) return "morning";
  if (h >= 9 && h < 16.5) return "noon";
  if (h >= 16.5 && h < 19) return "golden";
  if (h >= 19 && h < 21) return "dusk";
  return "night";
}

/** The light of one time of day in one place. Indoors the "sun" is what comes in at the window, and the sky what is seen through it. */
export type Palette = {
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

export type Palettes = Readonly<Record<TimeOfDay, Palette>>;

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
  #palettes: Palettes;
  #from: Palette;
  #to: Palette;
  #up = 0;
  #around = 0;

  constructor(time: TimeOfDay, palettes: Palettes) {
    this.time = time;
    this.#palettes = palettes;
    this.#from = palettes[time];
    this.#to = palettes[time];
    this.#apply(1);
  }

  /** Changes to another place's palettes at once, settled: behind the veil while the fly is carried there. */
  use(palettes: Palettes) {
    this.#palettes = palettes;
    this.#from = palettes[this.time];
    this.#to = palettes[this.time];
    this.#blend = 1;
    this.#apply(1);
  }

  get settled() {
    return this.#blend >= 1;
  }

  set(time: TimeOfDay) {
    if (time === this.time) return;
    this.#from = this.#snapshot();
    this.#to = this.#palettes[time];
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
