// The made-up forecast: the weather worked out from a local hour, so it
// wanders slowly over hours and is the same whenever and wherever it is read
// at the same hour. The game follows it on "Now" (apps/web/src/scene/weather.ts),
// and a shared table's server reads it to know when it rains there.

export type WeatherKind = "clear" | "overcast" | "mist" | "rain";
export const WEATHERS: readonly WeatherKind[] = ["clear", "overcast", "mist", "rain"];

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
