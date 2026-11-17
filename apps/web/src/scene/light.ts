// The light of the day. Each place has five palettes (apps/web/src/places),
// one for each time of day the player can choose. On "Now" the light follows
// the clock between them: the colours ease from each palette to the next,
// the sun rises, crosses through each palette's place and sets, and the moon
// rises after it. The clock's day is a fixed summer one; where the Apple TV
// knows the real sunrise and sunset, the hour is moved to match them before
// it gets here (scene/outside.ts). Over all of it lies the weather
// (scene/weather.ts): cloud greys the sky and hides the sun, mist whitens the
// distance.

import * as THREE from "three";
import type { Weather } from "./weather.ts";

export type TimeOfDay = "morning" | "noon" | "golden" | "dusk" | "night";
export const TIMES: readonly TimeOfDay[] = ["morning", "noon", "golden", "dusk", "night"];
export const TIME_NAMES: Record<TimeOfDay, string> = { morning: "Morning", noon: "Midday", golden: "Golden hour", dusk: "Dusk", night: "Night" };

/** The hour of the day by the clock, 0 to 24. */
export const clockHours = (date: Date) => date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;

/** The time of day an hour (0 to 24) is called. */
export function timeAt(hours: number): TimeOfDay {
  const h = ((hours % 24) + 24) % 24;
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

const COLOURS = ["zenith", "middle", "horizon", "sun", "sky", "ground", "haze", "water", "cloud"] as const;
const NUMBERS = ["sunUp", "sunAround", "sunIntensity", "hemiIntensity", "stars", "glow", "env"] as const;

/** A palette worked out, its colours as colours (linear, as three.js works in). */
export type Light = Record<(typeof COLOURS)[number], THREE.Color> & Record<(typeof NUMBERS)[number], number>;

export function blankLight(): Light {
  const light = {} as Light;
  for (const c of COLOURS) light[c] = new THREE.Color();
  for (const n of NUMBERS) light[n] = 0;
  return light;
}

function resolve(p: Palette, out = blankLight()): Light {
  for (const c of COLOURS) out[c].set(p[c]);
  for (const n of NUMBERS) out[n] = p[n];
  return out;
}

function copyLight(out: Light, from: Light) {
  for (const c of COLOURS) out[c].copy(from[c]);
  for (const n of NUMBERS) out[n] = from[n];
  return out;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
/** The short way round from one angle to another. */
const turn = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/** Mixes two lights; the sun goes the short way round. */
function mixLight(out: Light, a: Light, b: Light, k: number) {
  for (const c of COLOURS) out[c].copy(a[c]).lerp(b[c], k);
  for (const n of NUMBERS) out[n] = a[n] + (b[n] - a[n]) * k;
  out.sunAround = a.sunAround + turn(a.sunAround, b.sunAround) * k;
  return out;
}

/**
 * The day's colours by the clock: each palette is full at its hour, and they
 * ease from one to the next. Dawn borrows dusk's colours (the sky glows at
 * either end of the day); the night holds from late evening to before dawn,
 * and midday from late morning through the afternoon.
 */
export const COLOUR_HOURS: readonly (readonly [number, TimeOfDay])[] = [
  [4.6, "night"],
  [5.9, "dusk"],
  [7.5, "morning"],
  [10.5, "noon"],
  [15.25, "noon"],
  [17.75, "golden"],
  [20, "dusk"],
  [21.5, "night"],
];

/**
 * Where the sun crosses the horizon on the clock's day (the picnic's
 * palettes; other places' within a few minutes): a summer day's. The real
 * sunrise and sunset, where the Apple TV knows them, are moved onto these
 * (scene/outside.ts).
 */
export const CLOCK_SUNRISE = 5 + 40 / 60;
export const CLOCK_SUNSET = 20 + 10 / 60;

/** How far below the horizon (radians) the sun and moon are when down: far enough that neither disc nor light shows. */
export const BELOW = -0.15;
/** The sun's way: up out of the morning's side, through each day palette's place at its hour, down past dusk's. */
const SUN_HOURS: readonly (readonly [number, TimeOfDay | "rise" | "set"])[] = [
  [5, "rise"],
  [7.5, "morning"],
  [12.75, "noon"],
  [17.75, "golden"],
  [20, "dusk"],
  [21.1, "set"],
];
/** The moon's (whatever lights the night): up after the sun has gone, at the night palette's place through the small hours, down before dawn. Hours past midnight count on from 24. */
const MOON_HOURS: readonly (readonly [number, number, number])[] = [
  // hour, how high (0 under the horizon, 1 the night palette's height), and how far round from the night palette's place.
  [21.1, 0, -0.35],
  [23.5, 1, -0.1],
  [26.5, 1, 0.1],
  [29, 0, 0.35],
];

/** Where the sun (or moon) is at an hour: elevation and azimuth into `out`. */
function sunAt(p: Readonly<Record<TimeOfDay, Light>>, hours: number, out: { up: number; around: number }) {
  if (hours < SUN_HOURS[0][0] || hours >= SUN_HOURS[SUN_HOURS.length - 1][0]) {
    out.up = BELOW * 2;
    out.around = p.dusk.sunAround;
    return out;
  }
  let i = 0;
  while (hours >= SUN_HOURS[i + 1][0]) i++;
  const [h0, a] = SUN_HOURS[i];
  const [h1, b] = SUN_HOURS[i + 1];
  const k = (hours - h0) / (h1 - h0);
  const from = a === "rise" ? p.morning : a === "set" ? p.dusk : p[a];
  const to = b === "rise" ? p.morning : b === "set" ? p.dusk : p[b];
  const upFrom = a === "rise" ? BELOW : from.sunUp;
  const upTo = b === "set" ? BELOW : to.sunUp;
  out.up = upFrom + (upTo - upFrom) * k;
  out.around = from.sunAround + turn(from.sunAround, to.sunAround) * k;
  return out;
}

function moonAt(night: Light, hours: number, out: { up: number; around: number }) {
  const h = hours < 12 ? hours + 24 : hours;
  const first = MOON_HOURS[0];
  const last = MOON_HOURS[MOON_HOURS.length - 1];
  if (h < first[0] || h >= last[0]) {
    out.up = BELOW * 2;
    out.around = night.sunAround;
    return out;
  }
  let i = 0;
  while (h >= MOON_HOURS[i + 1][0]) i++;
  const [h0, up0, round0] = MOON_HOURS[i];
  const [h1, up1, round1] = MOON_HOURS[i + 1];
  const k = (h - h0) / (h1 - h0);
  const high = (u: number) => BELOW + (night.sunUp - BELOW) * u;
  out.up = high(up0) + (high(up1) - high(up0)) * k;
  out.around = night.sunAround + round0 + (round1 - round0) * k;
  return out;
}

/** How much of the sun's (or moon's) light reaches the place at an elevation: none once it is down. */
export const aboveHorizon = (up: number) => {
  const t = Math.min(1, Math.max(0, (up - (BELOW + 0.05)) / (0.04 - (BELOW + 0.05))));
  return smooth(t);
};

const sunScratch = { up: 0, around: 0 };
const moonScratch = { up: 0, around: 0 };

/** Under this (radians) the dusk palette's sun is setting: the place sees a sun go down and a moon come up. Above it, its evening light is a lamp, and stays. */
export const SETTING = 0.25;

/**
 * The light by the clock at an hour (0 to 24): the colours eased between the
 * palettes by COLOUR_HOURS. Where the dusk palette's sun is setting (SETTING),
 * the sun or moon (whichever is higher) is on its way and its light fades as
 * it goes down; sun and moon pass each other only when both are under the
 * horizon, so neither disc ever jumps. Where the evening's light is a lamp
 * (high at dusk), it blends with the colours instead, and stays lit and still
 * through the night.
 */
export function clockLight(p: Readonly<Record<TimeOfDay, Light>>, hours: number, out: Light): Light {
  const h = ((hours % 24) + 24) % 24;
  const keys = COLOUR_HOURS;
  const n = keys.length;
  // Before the first key it is still the night that began the evening before.
  const at = h < keys[0][0] ? h + 24 : h;
  let i = 0;
  while (i < n - 1 && at >= keys[i + 1][0]) i++;
  const h0 = keys[i][0];
  const h1 = i < n - 1 ? keys[i + 1][0] : keys[0][0] + 24;
  mixLight(out, p[keys[i][1]], p[keys[(i + 1) % n][1]], smooth((at - h0) / (h1 - h0)));
  if (p.dusk.sunUp >= SETTING) return out;
  const sun = sunAt(p, h, sunScratch);
  const moon = moonAt(p.night, h, moonScratch);
  const body = sun.up >= moon.up ? sun : moon;
  out.sunUp = body.up;
  out.sunAround = body.around;
  out.sunIntensity *= aboveHorizon(body.up);
  return out;
}

/** Seconds a change of the Light tool's choice takes. */
const CHANGE = 2.5;

/** The light as it is now: the chosen time of day or the clock's, eased toward it, under the weather. */
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
  /** The time of day chosen, or on "Now" the one the clock is in. */
  time: TimeOfDay;
  /** On "Now", the hour it shows (0 to 24); null on a chosen time. */
  hours: number | null = null;
  /** The sun's (or moon's) elevation, radians: below 0 it is down. */
  sunUp = 0;
  #palettes = {} as Record<TimeOfDay, Light>;
  #from = blankLight();
  #to = blankLight();
  #now = blankLight();
  #blend = 1;
  #dirty = true;
  /** The weather the light was last shown under. */
  #weather = { cloud: 0, mist: 0, rain: 0, heavy: 0, snow: 0, lightning: 0 };
  /** How much of the weather's light reaches the place (Scene.open). */
  #open = 1;

  constructor(time: TimeOfDay, palettes: Palettes, open = 1) {
    this.time = time;
    this.use(palettes, open);
  }

  /** Changes to another place's palettes (and how open it is to the weather) at once, settled: behind the veil while the fly is carried there. */
  use(palettes: Palettes, open = 1) {
    this.#open = open;
    for (const t of TIMES) this.#palettes[t] = resolve(palettes[t], this.#palettes[t]);
    if (this.hours === null) copyLight(this.#to, this.#palettes[this.time]);
    else clockLight(this.#palettes, this.hours, this.#to);
    copyLight(this.#from, this.#to);
    this.#blend = 1;
    this.#show(copyLight(this.#now, this.#to), this.#weather);
  }

  /** Eases to one of the five times of day and holds it. */
  set(time: TimeOfDay) {
    if (this.hours === null && time === this.time) return;
    copyLight(this.#from, this.#now);
    copyLight(this.#to, this.#palettes[time]);
    this.time = time;
    this.hours = null;
    this.#blend = 0;
  }

  /** Follows the clock: the light at this hour (0 to 24), eased there from a chosen time, or at once with `settle`. */
  follow(hours: number, settle = false) {
    const was = this.hours;
    this.hours = hours;
    this.time = timeAt(hours);
    clockLight(this.#palettes, hours, this.#to);
    if (settle) this.#blend = 1;
    else if (was === null) {
      copyLight(this.#from, this.#now);
      this.#blend = 0;
    }
    this.#dirty = true;
  }

  /** Moves the light on, under this weather; true when it changed. */
  update(dt: number, weather: Weather): boolean {
    if (this.#blend < 1) {
      this.#blend = Math.min(1, this.#blend + dt / CHANGE);
      this.#dirty = true;
    }
    const w = this.#weather;
    if (w.cloud !== weather.cloud || w.mist !== weather.mist || w.rain !== weather.rain || w.heavy !== weather.heavy || w.snow !== weather.snow || w.lightning !== weather.lightning) {
      w.cloud = weather.cloud;
      w.mist = weather.mist;
      w.rain = weather.rain;
      w.heavy = weather.heavy;
      w.snow = weather.snow;
      w.lightning = weather.lightning;
      this.#dirty = true;
    }
    if (!this.#dirty) return false;
    this.#dirty = false;
    const now = this.#blend >= 1 ? copyLight(this.#now, this.#to) : mixLight(this.#now, this.#from, this.#to, smooth(this.#blend));
    this.#show(now, w);
    return true;
  }

  /** The light as shown: the palette's, under the weather, as much of it as reaches the place: indoors, less, and after dark, when lamps light a room, hardly any. */
  #show(l: Light, w: Pick<Weather, "cloud" | "mist" | "rain" | "heavy" | "snow" | "lightning">) {
    const open = this.#open * (1 - (1 - this.#open) * l.stars);
    const cloud = w.cloud * open;
    const mist = w.mist * open;
    const rain = w.rain * open;
    const heavy = w.heavy * open;
    // The overcast's grey: the sky's own brightness without its colour, a little cool, darker in rain.
    const lid = grey(scratchLid.copy(l.middle).lerp(l.horizon, 0.5), 0.97, 0.99, 1.03).multiplyScalar(1.05 - 0.3 * rain - 0.38 * heavy);
    // Mist: the horizon's brightness, white and a little warm.
    const veil = grey(scratchVeil.copy(l.horizon).lerp(l.haze, 0.5), 1.04, 1.03, 1.0).multiplyScalar(1.12);
    capped(veil);
    this.zenith.copy(l.zenith).lerp(scratch.copy(lid).multiplyScalar(0.86), 0.9 * cloud).lerp(veil, 0.35 * mist);
    this.middle.copy(l.middle).lerp(scratch.copy(lid).multiplyScalar(0.96), 0.9 * cloud).lerp(veil, 0.65 * mist);
    this.horizon.copy(l.horizon).lerp(scratch.copy(lid).multiplyScalar(1.04), 0.85 * cloud).lerp(veil, 0.9 * mist);
    this.haze.copy(l.haze).lerp(lid, 0.8 * cloud).lerp(veil, mist);
    this.sunColor.copy(l.sun).lerp(grey(scratch.copy(l.sun), 1, 1, 1), Math.min(1, 0.5 * cloud + 0.4 * mist));
    this.skyColor.copy(l.sky).lerp(capped(scratch.copy(lid).multiplyScalar(1.1)), 0.7 * cloud).lerp(veil, 0.5 * mist);
    this.groundColor.copy(l.ground).lerp(grey(scratch.copy(l.ground), 1, 1, 1), 0.3 * cloud);
    this.water.copy(l.water).lerp(scratch.copy(lid).multiplyScalar(0.55), 0.6 * cloud).lerp(scratch.copy(veil).multiplyScalar(0.8), 0.5 * mist);
    this.cloud.copy(l.cloud).lerp(scratch.copy(lid).multiplyScalar(0.92), cloud).lerp(veil, 0.5 * mist);
    // Cloud takes the sun; the night's light (the moon, or a lamp indoors) much less.
    const night = 1 - 0.75 * l.stars;
    this.sunIntensity = l.sunIntensity * (1 - 0.8 * cloud * night) * (1 - 0.5 * mist * night);
    this.hemiIntensity = l.hemiIntensity * (1 + 0.3 * cloud + 0.15 * mist - 0.15 * rain);
    this.glow = l.glow * (1 - 0.85 * cloud) * (1 + 0.5 * mist);
    this.env = l.env * (1 - 0.3 * cloud);
    this.hemiIntensity *= 1 - 0.3 * heavy;
    this.skyColor.multiplyScalar(1 - 0.25 * heavy);
    // A flash reaches the existing scene lights and hence the eye cubemap;
    // it never writes a startle command. Indoors its reach is the window's.
    const flash = w.lightning * this.#open;
    this.zenith.addScalar(flash * 0.65);
    this.middle.addScalar(flash * 0.9);
    this.horizon.addScalar(flash * 0.7);
    this.cloud.addScalar(flash * 1.2);
    this.haze.addScalar(flash * 0.65);
    this.skyColor.lerp(scratch.setRGB(0.78, 0.86, 1), flash * 0.8);
    this.sunColor.lerp(scratch.setRGB(0.78, 0.86, 1), flash);
    this.sunIntensity += flash * 1.8;
    this.hemiIntensity += flash * 1.15;
    this.stars = l.stars;
    this.sunUp = l.sunUp;
    // Azimuth from -z (the picnic's lake) toward +x.
    const up = l.sunUp;
    const around = l.sunAround;
    this.sunDirection.set(Math.sin(around) * Math.cos(up), Math.sin(up), -Math.cos(around) * Math.cos(up)).normalize();
  }
}

/** A colour's brightness as grey, tinted. */
function grey(c: THREE.Color, r: number, g: number, b: number) {
  const lum = c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
  return c.setRGB(lum * r, lum * g, lum * b);
}

function capped(c: THREE.Color) {
  return c.setRGB(Math.min(1, c.r), Math.min(1, c.g), Math.min(1, c.b));
}

const scratch = new THREE.Color();
const scratchLid = new THREE.Color();
const scratchVeil = new THREE.Color();
