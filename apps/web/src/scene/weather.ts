// The weather: clear, overcast, mist or light rain. On "Now" (the Weather
// tool) it follows the real weather outside where the Apple TV can tell it
// (scene/outside.ts), else a forecast worked out from the clock, so it
// wanders slowly over hours and is the same whenever the app is opened at the
// same hour; chosen, it holds. Changes come gradually: clouds gather before
// rain and clear after it, mist forms in the early morning and burns off
// before noon, and what the rain wetted dries over the next half hour or so.
//
// Every place's light follows it (scene/light.ts). How rain, mist and wind
// look and sound in a place is the place's own (places/types.ts).

export type WeatherKind = "clear" | "overcast" | "mist" | "rain";
export const WEATHERS: readonly WeatherKind[] = ["clear", "overcast", "mist", "rain"];

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

/** The weather's parts that are set (the wet follows from them). */
export type Mix = { cloud: number; mist: number; rain: number; wind: number };

/** Each kind of weather, settled. */
export const KINDS: Readonly<Record<WeatherKind, Readonly<Mix>>> = {
  clear: { cloud: 0, mist: 0, rain: 0, wind: 0.35 },
  overcast: { cloud: 0.9, mist: 0.08, rain: 0, wind: 0.55 },
  mist: { cloud: 0.3, mist: 1, rain: 0, wind: 0.05 },
  rain: { cloud: 1, mist: 0.3, rain: 1, wind: 0.65 },
};

/** Hours a spell of one kind of weather lasts on average, and the most its start is moved from the clock's marks. */
export const SPELL = 3;
const JITTER = 0.8;
/** Hours one spell takes to turn into the next. */
export const CHANGE = 1;
/** Hours over which the weather goes from settled to unsettled and back: it comes in systems a day or two long. */
const SYSTEM = 30;

/** A number from 0 to 1 for an integer and a salt, the same every time. */
function hash(n: number, salt: number) {
  let h = Math.imul((n | 0) ^ Math.imul(salt, 0x9e3779b1), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** The hour of the day (0 to 24) at a local hour since the epoch. */
export const hourOfDay = (hours: number) => ((hours % 24) + 24) % 24;

/** Local hours since the epoch: what the forecast is read by. */
export const forecastHours = (date: Date) => date.getTime() / 3_600_000 - date.getTimezoneOffset() / 60;

/** When spell i begins. */
const start = (i: number) => i * SPELL + (hash(i, 1) - 0.5) * 2 * JITTER;

/** A slow wave from 0 to 1, a new value every `period` hours, eased between. */
function wander(hours: number, period: number, salt: number) {
  const i = Math.floor(hours / period);
  return hash(i, salt) + (hash(i + 1, salt) - hash(i, salt)) * smooth(0, 1, hours / period - i);
}

/** The kind of weather spell i brings. */
export function spellKind(i: number): WeatherKind {
  const middle = (start(i) + start(i + 1)) / 2;
  const unsettled = wander(middle, SYSTEM, 3);
  const r = hash(i, 2);
  const clear = 0.78 - 0.5 * unsettled;
  const overcast = 0.17 + 0.18 * unsettled;
  const kind: WeatherKind = r < clear ? "clear" : r < clear + overcast ? "overcast" : "rain";
  // Mist forms in the cool of the early morning, on a still day.
  const hour = hourOfDay(middle);
  if (kind !== "rain" && hour > 3 && hour < 9 && hash(i, 4) < 0.35) return "mist";
  return kind;
}

/** How much of a spell's mist is left at an hour of the day: it burns off through the late morning. */
const misty = (hour: number) => 1 - smooth(8.5, 11, hour);

function settled(i: number, hours: number, out: Mix): Mix {
  const kind = spellKind(i);
  const k = KINDS[kind];
  out.cloud = k.cloud;
  out.mist = kind === "mist" ? k.mist * misty(hourOfDay(hours)) : k.mist;
  // Showers come and go within a spell of rain; an overcast sky thins and thickens.
  out.rain = k.rain * (0.6 + 0.4 * wander(hours, 0.7, 5));
  if (k.cloud > 0.5) out.cloud = Math.min(1, k.cloud + (wander(hours, 1.1, 6) - 0.5) * 0.2);
  out.wind = k.wind * (0.7 + 0.6 * wander(hours, 2, 7));
  return out;
}

const scratchA: Mix = { cloud: 0, mist: 0, rain: 0, wind: 0 };
const scratchB: Mix = { cloud: 0, mist: 0, rain: 0, wind: 0 };

/**
 * The weather the forecast gives at a local hour since the epoch. Clouds
 * gather in the first part of a change to rain and the rain comes in the
 * second; leaving rain, the rain stops first and the clouds go after.
 */
export function forecast(hours: number, out: Mix): Mix {
  let i = Math.floor(hours / SPELL);
  if (hours < start(i)) i--;
  else if (hours >= start(i + 1)) i++;
  const half = CHANGE / 2;
  let from = i;
  let to = i;
  let k = 0;
  if (hours - start(i) < half) {
    from = i - 1;
    k = smooth(start(i) - half, start(i) + half, hours);
  } else if (start(i + 1) - hours < half) {
    to = i + 1;
    k = smooth(start(i + 1) - half, start(i + 1) + half, hours);
  }
  const a = settled(from, hours, scratchA);
  if (from === to) return Object.assign(out, a);
  const b = settled(to, hours, scratchB);
  const kc = b.cloud > a.cloud ? smooth(0, 0.6, k) : smooth(0.4, 1, k);
  const kr = b.rain > a.rain ? smooth(0.5, 1, k) : smooth(0, 0.5, k);
  out.cloud = a.cloud + (b.cloud - a.cloud) * kc;
  out.rain = a.rain + (b.rain - a.rain) * kr;
  out.mist = a.mist + (b.mist - a.mist) * k;
  out.wind = a.wind + (b.wind - a.wind) * k;
  return out;
}

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
      forecast(h, scratchA);
      wet = wetten(wet, outside ? outside.blend(scratchA) : scratchA, step * 3600);
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
