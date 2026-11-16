// The weather: clear, overcast, mist or light rain. On "Now" (the Weather
// tool) it follows the real weather outside where the Apple TV can tell it
// (scene/outside.ts), else a forecast worked out from the clock, so it
// wanders slowly over hours and is the same whenever the app is opened at the
// same hour; chosen, it holds. Changes come gradually: clouds gather before
// rain and clear after it, mist forms in the early morning and burns off
// before noon, and what the rain wetted dries over the next half hour or so.
//
// Every place's light follows it (scene/light.ts). How rain, mist and wind
// look in a place is the place's own (places/types.ts).

import { KINDS, forecast } from "@fly/world";
import type { Mix, WeatherKind } from "@fly/world";

/** The weather as it is now, each part 0 to 1. What places read (places/types.ts). */
export type Weather = {
  /** Cloud over the sky: 0 clear, 1 a grey lid with the sun behind it. */
  readonly cloud: number;
  /** Mist: the distance fading to white, the sun a pale disc. */
  readonly mist: number;
  /** Rain falling: 1 is light rain. */
  readonly rain: number;
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
export function kindOf(w: Pick<Mix, "rain" | "cloud" | "mist">): WeatherKind {
  if (w.rain > 0.3) return "rain";
  if (w.mist > 0.5) return "mist";
  return w.cloud > 0.5 ? "overcast" : "clear";
}

const scratch: Mix = { cloud: 0, mist: 0, rain: 0, wind: 0 };

/** How fast the weather moves toward a choice, per second: a chosen weather arrives in about four seconds. */
const EASE = 0.25;

/** The weather now: following the forecast, or held at a chosen kind. */
export class WeatherNow implements Weather {
  cloud = 0;
  mist = 0;
  rain = 0;
  wet = 0;
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
    Object.assign(this.#target, KINDS[kind]);
    if (settle) this.#jump();
  }

  #jump() {
    this.cloud = this.#target.cloud;
    this.mist = this.#target.mist;
    this.rain = this.#target.rain;
    this.wind = this.#target.wind;
    this.kind = kindOf(this);
  }

  update(dt: number) {
    const t = this.#target;
    const most = EASE * dt;
    const toward = (now: number, to: number) => now + Math.max(-most, Math.min(most, to - now));
    this.cloud = toward(this.cloud, t.cloud);
    this.mist = toward(this.mist, t.mist);
    this.rain = toward(this.rain, t.rain);
    this.wind = toward(this.wind, t.wind);
    this.wet = wetten(this.wet, this, dt);
    this.kind = kindOf(this);
  }
}
