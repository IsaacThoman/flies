// The real weather outside, where the Apple TV app's host can give it
// (globalThis.__native.weather, WeatherKit): on the Weather tool's "Now" it
// takes the forecast's place, and on the Light tool's "Now" the real sunrise
// and sunset move the clock's day so that dawn and dusk come when they do
// outside. Without it (a browser, no permission, no network, an answer too
// old, or turned off in Settings) the made-up forecast and the clock's fixed
// summer day go on as before. Every change eases in: a new observation over
// minutes, and the switch between real and made-up over a minute.
//
// What WeatherKit says is mapped onto the game's four kinds of weather as
// near as they go (outsideMix): there is no snow or thunder in the game.

import type { NativeWeatherBridge, OutsideConditions, OutsideStatus, WeatherAttribution } from "@fly/contracts";
import { CLOCK_SUNRISE, CLOCK_SUNSET } from "./light.ts";
import type { Mix } from "./weather.ts";

/** An observation older than this (ms) is too old to be the weather now. */
export const STALE = 2 * 3_600_000;
/** Sunrise and sunset move by minutes a day, so they are good for longer. */
export const SUN_STALE = 2 * 86_400_000;
/** Seconds the switch between the real weather and the made-up one takes. */
export const SWITCH = 60;
/** Seconds a new observation takes to replace the last. */
export const BLEND = 600;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const wrap24 = (h: number) => ((h % 24) + 24) % 24;
/** From one hour of the day to another the short way round, k of the way. */
export const mixHours = (a: number, b: number, k: number) => wrap24(a + ((((b - a) % 24) + 36) % 24 - 12) * k);

// WeatherKit's conditions (WeatherCondition's raw values) by what the game can show of them.
const RAINY = new Set(["drizzle", "rain", "heavyRain", "sunShowers", "sleet", "wintryMix", "freezingDrizzle", "freezingRain", "hail"]);
const STORMY = new Set(["isolatedThunderstorms", "scatteredThunderstorms", "thunderstorms", "strongStorms", "tropicalStorm", "hurricane"]);
const SNOWY = new Set(["snow", "heavySnow", "blizzard", "blowingSnow"]);
const FLURRIES = new Set(["flurries", "sunFlurries"]);
const HAZY = new Set(["haze", "smoky", "blowingDust"]);

/** Wind speed (m/s) the game's windiest day is: a fresh breeze, Beaufort 5. */
export const WINDIEST = 10;
/** Rain (mm an hour) the game's rain is at its fullest: it only has light rain. */
export const FULLEST_RAIN = 1;

/**
 * The game's weather for real conditions. Cloud cover is the cloud; mist
 * comes with the visibility (all of it in fog, under a kilometre, none past
 * eight) or a haze; rain with the precipitation, the most the game shows
 * being light rain. Snow, which the game hasn't got, is a white mist under a
 * grey sky (rain would be wrong, and nothing falls), flurries a grey sky;
 * sleet, freezing rain and hail are rain, and thunderstorms heavy rain with
 * no lightning. Wind is the real speed, a fresh breeze the windiest.
 */
export function outsideMix(c: OutsideConditions, out: Mix): Mix {
  const condition = c.condition;
  const snow = SNOWY.has(condition);
  let cloud = clamp01(c.cloudCover);
  let mist = 1 - smooth(1000, 8000, c.visibility);
  if (condition === "foggy") mist = 1;
  else if (HAZY.has(condition)) mist = Math.max(mist, 0.5);
  let rain = c.precipitation >= 0.05 ? clamp01(0.4 + (0.6 * c.precipitation) / FULLEST_RAIN) : 0;
  if (RAINY.has(condition)) rain = Math.max(rain, 0.5);
  if (STORMY.has(condition)) rain = Math.max(rain, 0.8);
  if (snow) {
    rain = 0;
    cloud = Math.max(cloud, 0.9);
    mist = Math.max(mist, 0.6);
  } else if (FLURRIES.has(condition)) {
    rain = 0;
    cloud = Math.max(cloud, 0.8);
    mist = Math.max(mist, 0.3);
  }
  out.cloud = cloud;
  out.mist = mist;
  out.rain = rain;
  out.wind = clamp01(c.wind / WINDIEST);
  return out;
}

/** A day or a night shorter than this (hours) is taken as none: the sun stays up, or down. */
export const SHORTEST = 1.5;
/** Where the clock's day stands at the real sun's highest and lowest when it never sets (high noon, a low golden sun) or never rises (before dawn, deep night). */
const POLAR_DAY = [12.75, 18.5] as const;
const POLAR_NIGHT = [5, 1] as const;

export type SunTimes = Pick<OutsideConditions, "sunrise" | "sunset" | "noon" | "daylight">;

/**
 * The hour on the clock's fixed day (scene/light.ts) that a real hour
 * (0 to 24) is, given today's real sunrise and sunset: the real day is
 * stretched or squeezed onto the clock's, from its sunrise to its sunset,
 * and the night onto its night, so the sun comes up and goes down when it
 * does outside and every colour of the day keeps its place between. Where the
 * sun doesn't set (or rise) the day swings slowly between high noon and a low
 * golden sun (or between before dawn and deep night), highest at the real
 * sun's transit.
 */
export function dayHours(hours: number, sun: SunTimes): number {
  const h = wrap24(hours);
  const rise = sun.sunrise;
  const set = sun.sunset;
  const length = rise === null || set === null ? -1 : set - rise;
  if (length < SHORTEST || length > 24 - SHORTEST) {
    const up = length < 0 ? sun.daylight : length > 12;
    const noon = sun.noon ?? (length < 0 ? 12 : (rise! + set!) / 2);
    // 0 at the sun's highest, 1 twelve hours from it.
    const t = (1 - Math.cos((2 * Math.PI * (h - noon)) / 24)) / 2;
    const [high, low] = up ? POLAR_DAY : POLAR_NIGHT;
    return high + (low - high) * t;
  }
  let x = h;
  while (x < rise!) x += 24;
  while (x >= rise! + 24) x -= 24;
  const day = CLOCK_SUNSET - CLOCK_SUNRISE;
  const g = x <= set! ? CLOCK_SUNRISE + ((x - rise!) * day) / length : CLOCK_SUNSET + ((x - set!) * (24 - day)) / (24 - length);
  return wrap24(g);
}

/** Where the game's weather and daylight come from now, for the canvas's state and the tools. */
export type OutsideState = OutsideStatus | "none" | "off" | "fed";

/** The real weather, as the game takes it: polled from the host (or fed by a script), mapped, eased. */
export class Outside {
  /** Whether the player wants it (Settings). */
  #enabled = true;
  #begun = false;
  readonly #bridge: NativeWeatherBridge | null;
  #version = 0;
  #conditions: OutsideConditions | null = null;
  #fed = false;
  /** The weather it says, eased from the last observation to the newest over BLEND. */
  readonly #from: Mix = { cloud: 0, mist: 0, rain: 0, wind: 0 };
  readonly #to: Mix = { cloud: 0, mist: 0, rain: 0, wind: 0 };
  readonly #mix: Mix = { cloud: 0, mist: 0, rain: 0, wind: 0 };
  #blend = 1;
  #sunFrom: SunTimes | null = null;
  #sun: SunTimes | null = null;
  #sunBlend = 1;
  /** 0 to 1: how much the real weather and the real sun count for now, on their way to 1 while there is a fresh answer and to 0 while not. */
  weight = 0;
  sunWeight = 0;
  #wantWeather = false;
  #wantSun = false;
  #at = -1;

  constructor(bridge: NativeWeatherBridge | null) {
    this.#bridge = bridge;
  }

  /** The host can tell the weather outside (an Apple TV app built with WeatherKit). */
  get available() {
    return this.#bridge !== null;
  }

  get enabled() {
    return this.#enabled;
  }

  set enabled(on: boolean) {
    if (on === this.#enabled) return;
    this.#enabled = on;
    if (!this.#begun || !this.#bridge) return;
    if (on) this.#bridge.start();
    else this.#bridge.stop();
  }

  /** Starts asking the host, if it is wanted: the first time, the host asks for permission to know where it is. */
  begin() {
    if (this.#begun) return;
    this.#begun = true;
    if (this.#enabled) this.#bridge?.start();
  }

  /** What it is doing, in a word: "off" turned off, "fed" by a script, "none" without a host that can tell, else the host's status. */
  get state(): OutsideState {
    if (!this.#enabled) return "off";
    if (this.#fed) return "fed";
    return this.#bridge ? this.#bridge.status() : "none";
  }

  /** Why the host has nothing, when it says, or "". */
  get error(): string {
    return this.#enabled && !this.#fed ? (this.#bridge?.error() ?? "") : "";
  }

  /** The real weather is what the Weather tool's "Now" shows, or is easing in to. */
  get following() {
    return this.#wantWeather;
  }

  /** The real sunrise and sunset are what the Light tool's "Now" follows, or is easing in to. */
  get sunFollowing() {
    return this.#wantSun;
  }

  /** How old the latest observation is (s) at `now` (ms since the epoch), or null with none. */
  age(now: number): number | null {
    return this.#conditions ? Math.max(0, now - this.#conditions.observedAt) / 1000 : null;
  }

  attribution(): WeatherAttribution | null {
    return this.#bridge?.attribution() ?? null;
  }

  /** Hands it conditions as if the host had answered, for scripts and tests in a browser; null goes back to the host's. With `settle` the change is made at once. */
  feed(conditions: Omit<OutsideConditions, "source"> | null, settle = true) {
    this.#fed = conditions !== null;
    this.#version = -1;
    if (conditions) this.#take({ ...conditions, source: "fed" }, settle);
    else this.#conditions = null;
    this.update(Date.now(), settle);
  }

  /** Looks at the host's answer and moves the easing on to `now` (ms since the epoch). With `settle`, everything is where it is going at once. */
  update(now: number, settle = false) {
    const dt = settle || this.#at < 0 ? 0 : Math.min(5, Math.max(0, (now - this.#at) / 1000));
    this.#at = now;
    if (!this.#fed && this.#bridge) {
      const version = this.#bridge.version();
      if (version !== this.#version) {
        this.#version = version;
        const c = version > 0 ? this.#bridge.conditions() : null;
        if (c) this.#take(c, settle);
      }
    }
    const c = this.#conditions;
    const age = c ? now - c.observedAt : Infinity;
    this.#wantWeather = this.#enabled && age < STALE;
    this.#wantSun = this.#enabled && age < SUN_STALE;
    // Wall time, but no more than a few seconds at once: after the app has been asleep the change still eases in.
    const step = settle ? 1 : dt / SWITCH;
    this.weight += Math.max(-step, Math.min(step, (this.#wantWeather ? 1 : 0) - this.weight));
    this.sunWeight += Math.max(-step, Math.min(step, (this.#wantSun ? 1 : 0) - this.sunWeight));
    this.#blend = settle ? 1 : Math.min(1, this.#blend + dt / BLEND);
    this.#sunBlend = settle ? 1 : Math.min(1, this.#sunBlend + dt / BLEND);
    const k = smooth(0, 1, this.#blend);
    const m = this.#mix;
    const from = this.#from;
    const to = this.#to;
    m.cloud = from.cloud + (to.cloud - from.cloud) * k;
    m.mist = from.mist + (to.mist - from.mist) * k;
    m.rain = from.rain + (to.rain - from.rain) * k;
    m.wind = from.wind + (to.wind - from.wind) * k;
  }

  #take(c: OutsideConditions, settle: boolean) {
    // The first answer, or one after none counted, needs no easing from the last: the weight brings it in.
    const fresh = settle || !this.#conditions || this.weight === 0;
    if (fresh) outsideMix(c, this.#from);
    else Object.assign(this.#from, this.#mix);
    outsideMix(c, this.#to);
    this.#blend = fresh ? 1 : 0;
    const sunFresh = settle || !this.#sun || this.sunWeight === 0;
    this.#sunFrom = sunFresh ? null : this.#sun;
    this.#sun = { sunrise: c.sunrise, sunset: c.sunset, noon: c.noon, daylight: c.daylight };
    this.#sunBlend = sunFresh ? 1 : 0;
    this.#conditions = c;
  }

  /** The forecast's weather, with as much of the real weather as counts now mixed in. */
  blend(forecast: Mix): Mix {
    const k = smooth(0, 1, this.weight);
    if (k <= 0) return forecast;
    const m = this.#mix;
    forecast.cloud += (m.cloud - forecast.cloud) * k;
    forecast.mist += (m.mist - forecast.mist) * k;
    forecast.rain += (m.rain - forecast.rain) * k;
    forecast.wind += (m.wind - forecast.wind) * k;
    return forecast;
  }

  /** The hour (0 to 24) the clock's light shows at this hour by the clock: moved to the real sunrise and sunset as much as they count now. */
  lightHours(hours: number): number {
    const sun = this.#sun;
    const k = smooth(0, 1, this.sunWeight);
    if (!sun || k <= 0) return hours;
    let real = dayHours(hours, sun);
    if (this.#sunFrom && this.#sunBlend < 1) real = mixHours(dayHours(hours, this.#sunFrom), real, smooth(0, 1, this.#sunBlend));
    return mixHours(hours, real, k);
  }
}

/** The host's weather service, when it has one. */
export function nativeWeather(): NativeWeatherBridge | null {
  return (globalThis as { __native?: { weather?: NativeWeatherBridge } }).__native?.weather ?? null;
}
