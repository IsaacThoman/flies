// The weather: cloud, precipitation and electrical storms, all through the senses. On "Now" (the Weather
// tool) it follows the real weather outside where the Apple TV can tell it
// (scene/outside.ts), else a forecast worked out from the clock, so it
// wanders slowly over hours and is the same whenever the app is opened at the
// same hour; chosen, it holds. Changes come gradually: clouds gather before
// rain and clear after it, mist forms in the early morning and burns off
// before noon, and what the rain wetted dries over the next half hour or so.
//
// Every place's light follows it (scene/light.ts). How rain, mist and wind
// look in a place is the place's own (places/types.ts).

import { KINDS, forecast } from "@fly/net";
import type { Mix, WeatherKind } from "@fly/net";
export { KINDS, forecast } from "@fly/net";
export type { Mix, WeatherKind } from "@fly/net";
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const toward = (now: number, to: number, most: number) => now + Math.max(-most, Math.min(most, to - now));

/** A sparse, deterministic double pulse. No sound or behavioral command accompanies it. */
export function lightningAt(seconds: number, storm: number): number {
  const cycle = Math.floor(seconds / 19);
  const offset = 3 + 7 * fract(Math.sin(cycle * 127.1 + 7.3) * 43758.5453);
  const age = seconds - cycle * 19 - offset;
  if (age < 0 || age > 0.65) return 0;
  return storm * Math.max(Math.exp(-age * 18), 0.7 * Math.exp(-Math.abs(age - 0.22) * 28));
}
const fract = (x: number) => x - Math.floor(x);

/** The weather as it is now, each part 0 to 1. What places read (places/types.ts). */
export type Weather = {
  /** Cloud over the sky: 0 clear, 1 a grey lid with the sun behind it. */
  readonly cloud: number;
  /** Mist: the distance fading to white, the sun a pale disc. */
  readonly mist: number;
  /** Rain falling, with `heavy` increasing density and speed beyond light rain. */
  readonly rain: number;
  readonly heavy: number;
  readonly storm: number;
  readonly snow: number;
  /** Cosmetic dusting, at most 0.35 mm: no invented cold physiology or solid collision. */
  readonly snowCover: number;
  readonly lightning: number;
  /** How wet everything out in it is: follows the rain within a minute or two, and dries over half an hour or more after. */
  readonly wet: number;
  /** How windy the day is: 0 still, 1 blustery. A place open to the air makes gusts of it. */
  readonly wind: number;
  /** The weather in a word: the kind it is most like. */
  readonly kind: WeatherKind;
};

/** Seconds rain takes to wet things through, at full rain. */
const WETTING = 50;
/** Seconds things take to dry (by about two thirds) once the rain has stopped, in sun; longer under cloud and in mist. */
const DRYING = 1200;

/** How wet things are after `dt` seconds of this weather. */
export function wetten(wet: number, w: Pick<Mix, "rain" | "cloud" | "mist">, dt: number): number {
  const into = w.rain / WETTING;
  const out = Math.max(0, 1 - w.rain * 4) / (DRYING * (1 + w.cloud + 2 * w.mist));
  const rate = into + out;
  if (rate <= 0) return wet;
  const settledAt = into / rate;
  return settledAt + (wet - settledAt) * Math.exp(-rate * dt);
}

/** The kind a mix of weather is most like. */
export function kindOf(w: Mix): WeatherKind {
  if ((w.snow ?? 0) > 0.3) return w.rain > 0.25 ? "sleet" : "snow";
  if ((w.storm ?? 0) > 0.4) return "storm";
  if ((w.heavy ?? 0) > 0.4) return "heavyRain";
  if (w.rain > 0.3) return "rain";
  if (w.mist > 0.5) return "mist";
  return w.cloud > 0.5 ? "overcast" : "clear";
}

const scratch: Mix = { cloud: 0, mist: 0, rain: 0, wind: 0 };

/** How fast the weather moves toward a choice, per second: a chosen weather arrives in about four seconds. */
const EASE = 0.26;

/** The weather now: following the forecast, or held at a chosen kind. */
export class WeatherNow implements Weather {
  cloud = 0;
  mist = 0;
  rain = 0;
  wet = 0;
  heavy = 0;
  storm = 0;
  snow = 0;
  snowCover = 0;
  lightning = 0;
  #seconds = 0;
  wind = KINDS.clear.wind;
  kind: WeatherKind = "clear";
  /** The kind chosen, or null following the forecast. */
  chosen: WeatherKind | null = null;
  #target: Mix = { ...KINDS.clear };

  /**
   * Follows the forecast at a local hour since the epoch, with as much of the
   * real weather mixed in as `outside` says counts. With `settle` it is there
   * at once, as wet as the last hours' rain left it (outside, as if it had
   * been as it is now).
   */
  follow(hours: number, settle = false, outside?: { blend(forecast: Mix): Mix }) {
    this.chosen = null;
    forecast(hours, this.#target);
    outside?.blend(this.#target);
    if (!settle) return;
    let wet = 0;
    const step = 0.05;
    for (let h = hours - 3; h < hours; h += step) {
      forecast(h, scratch);
      wet = wetten(wet, outside ? outside.blend(scratch) : scratch, step * 3600);
    }
    this.wet = wet;
    this.#jump();
  }

  /** Holds a chosen weather, eased in over a few seconds, or there at once with `settle`. What it wets dries in its own time. */
  choose(kind: WeatherKind, settle = false) {
    this.chosen = kind;
    this.#target.heavy = this.#target.storm = this.#target.snow = 0;
    Object.assign(this.#target, KINDS[kind]);
    if (settle) this.#jump();
  }

  #jump() {
    this.cloud = this.#target.cloud;
    this.mist = this.#target.mist;
    this.rain = this.#target.rain;
    this.wind = this.#target.wind;
    this.heavy = this.#target.heavy ?? 0;
    this.storm = this.#target.storm ?? 0;
    this.snow = this.#target.snow ?? 0;
    this.kind = kindOf(this);
  }

  update(dt: number) {
    const t = this.#target;
    const most = EASE * dt;
    // A departing shower leaves its deck behind; observed sun showers retain
    // their sparse cloud cover rather than waiting forever for an overcast sky.
    const clearing = this.rain > t.rain || this.snow > (t.snow ?? 0);
    const deck = clearing ? Math.max(t.cloud, Math.min(0.9, (this.rain + this.snow) * 0.9)) : t.cloud;
    this.cloud = toward(this.cloud, deck, most);
    this.mist = toward(this.mist, t.mist, most);
    const gathered = t.cloud > 0.25 ? clamp((this.cloud - 0.25) / (t.cloud - 0.25)) : 1;
    this.rain = toward(this.rain, t.rain > this.rain ? t.rain * gathered : t.rain, most);
    this.wind = toward(this.wind, t.wind, most);
    this.heavy = toward(this.heavy, t.heavy ?? 0, most);
    this.storm = toward(this.storm, t.storm ?? 0, most);
    const snow = t.snow ?? 0;
    this.snow = toward(this.snow, snow > this.snow ? snow * gathered : snow, most);
    const melt = this.snowCover * (1 - this.snow) * (1 + this.rain * 3) / 180;
    const deposit = this.snow * (1 - this.snowCover) / 65;
    this.snowCover = clamp(this.snowCover + (deposit - melt) * dt);
    this.wet = wetten(clamp(this.wet + melt * dt), this, dt);
    this.#seconds += dt;
    this.lightning = lightningAt(this.#seconds, this.storm);
    this.kind = kindOf(this);
  }
}
