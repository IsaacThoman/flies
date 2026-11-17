// The fly's daily clock and its need for sleep: internal state the brain is
// told with its senses (packages/brain types.ts), worked out here from the
// real time of day and the fly's own stillness. Nothing here moves the fly or
// decides that it sleeps: the brain does, and the body only watches.
//
// The clock is a stand-in for the molecular clock in the clock neurons, which
// the connectome doesn't contain. A fly's two oscillators lock to the day: the
// morning (M) cells' to dawn, the evening (E) cells' to dusk, whatever the
// day's length (Grima et al. 2004; Stoleru et al. 2004; Rieger et al. 2003).
// Each is up for a few hours round its edge of the day, from about three hours
// before (the anticipation that only a clock gives); between them, at midday
// and through the night, the clock pushes toward sleep.
//
// Sleep pressure is the two-process model's homeostat (Borbély 1982), as flies
// have it (Shaw et al. 2000; Huber et al. 2004): it builds while the fly is
// awake and discharges while it sleeps, exponentially toward 1 and toward 0.
//
// Sleep itself is what the field calls it: five minutes or more without
// moving (Shaw et al. 2000; Hendricks et al. 2000). Stillness deepens: flies
// that have been still longer need stronger stimuli to rouse them (van Alphen
// et al. 2013), most of the change within the first quarter of an hour. The
// depth grows from the moment it stops, so it is already most of the way there
// by the time a stillness counts as sleep.

/** Hours, minutes and fractions of a day as the clock counts them. */
const DAY = 24;

export const RHYTHM = {
  /** Hours for sleep pressure to build most of the way (1 - 1/e) while awake, and to discharge while asleep. Round numbers, with discharge faster than build-up as in the two-process model (Daan et al. 1984). */
  build: 12,
  discharge: 3,
  /** Seconds without moving before it counts as asleep. */
  still: 300,
  /** Seconds still for its depth to come most of the way (1 - 1/e) to 1. */
  deepen: 300,
} as const;

/**
 * How the clock shapes the day: a fly's ("natural") or one livelier to watch
 * ("lively", the game's default), each with
 * - spread: hours either side of dawn and dusk that the M and E oscillators are up;
 * - daylight: the clock's push toward sleep while the sun is up;
 * - night: its push in the dark;
 * - need: how much of its sleep pressure it feels (what the brain is told);
 * - summer: whether its day is at least a summer's, whatever the sun.
 *
 * Natural: 3 hours, a round number from the anticipation's three hours. Light
 * keeps a fly awake through the large ventral lateral neurons (Shang et al.
 * 2008; Sheeba et al. 2008), so a male's midday siesta is lighter than his
 * night's sleep: 0.8 of it, a round number chosen by what it does: at 0.6 the
 * fly hardly sleeps at midday (14 to 35% of 90 minutes), at 0.8 it sleeps much
 * of it, as males do (packages/brain/README.md, Sleep and the daily rhythm).
 *
 * Lively is chosen for a wallpaper, not measured in a fly: four hours either
 * side, so the peaks run into the day and the evening; a summer's day at
 * least, so a winter evening is still its evening; a light push by day (0.1:
 * held alone, a push of 0.2 already halves its walking) and a moderate one at
 * night (0.6); and a fifth of its pressure felt, as a fly that hardly sleeps by
 * day would otherwise come to the evening with nearly the night's push from
 * pressure alone (packages/brain/README.md, The lively pace).
 */
export type DayPace = "lively" | "natural";
export const PACES: Record<DayPace, { readonly spread: number; readonly daylight: number; readonly night: number; readonly need: number; readonly summer: boolean }> = {
  lively: { spread: 4, daylight: 0.1, night: 0.6, need: 0.2, summer: true },
  natural: { spread: 3, daylight: 0.8, night: 1, need: 1, summer: false },
};

/** Where the sun is: hours of sunrise and sunset, 0 to 24, local time. */
export type Sun = { sunrise: number; sunset: number };

/** A summer day's sun, for when the real one isn't known (the game's own clock day, scene/light.ts). */
export const SUMMER: Sun = { sunrise: 5 + 40 / 60, sunset: 20 + 10 / 60 };

const wrap = (hours: number) => ((hours % DAY) + DAY) % DAY;
/** Hours from `b` to `a`, the short way round the day: -12 to 12. */
const apart = (a: number, b: number) => wrap(a - b + DAY / 2) - DAY / 2;
const clamp01 = (x: number) => (x > 0 ? (x < 1 ? x : 1) : 0);

/** A smooth rise and fall over `spread` hours either side of `at`: 1 there, 0 beyond. */
function bump(hours: number, at: number, spread: number) {
  const x = apart(hours, at) / spread;
  if (x <= -1 || x >= 1) return 0;
  const c = Math.cos((Math.PI / 2) * x);
  return c * c;
}

/** The clock at an hour of the day: the M and E oscillators, and its push toward sleep. */
export function clockAt(hours: number, sun: Sun, out = { morning: 0, evening: 0, sleep: 0 }, pace: DayPace = "natural") {
  const { spread, daylight, night, summer } = PACES[pace];
  const sunrise = summer ? Math.min(sun.sunrise, SUMMER.sunrise) : sun.sunrise;
  const sunset = summer ? Math.max(sun.sunset, SUMMER.sunset) : sun.sunset;
  out.morning = bump(hours, sunrise, spread);
  out.evening = bump(hours, sunset, spread);
  const up = wrap(hours - sunrise) < wrap(sunset - sunrise);
  out.sleep = (1 - Math.max(out.morning, out.evening)) * (up ? daylight : night);
  return out;
}

/** Sleep pressure after `seconds` awake (or asleep) from `pressure`. */
export function pressureAfter(pressure: number, seconds: number, asleep: boolean) {
  const keep = Math.exp(-seconds / ((asleep ? RHYTHM.discharge : RHYTHM.build) * 3600));
  return asleep ? pressure * keep : 1 - (1 - pressure) * keep;
}

/**
 * Sleep pressure after `seconds` lived as a fly left to itself would live
 * them, from `pressure` at the hour `from`: asleep whenever the clock pushes it
 * more than halfway toward sleep, awake otherwise, on a model day in steps of
 * five minutes. This is how time away is lived (the game closed or hidden): a
 * stand-in, as nothing watches the fly then. Two days are enough to forget
 * where it started (the pressure keeps 2% of it after two days awake), so a
 * longer absence is lived as its last two days, from nothing.
 */
export function pressureLeftAlone(pressure: number, from: number, seconds: number, sun: Sun, pace: DayPace = "natural") {
  if (!(seconds > 0)) return clamp01(pressure);
  const step = 1 / 12;
  let hours = seconds / 3600;
  if (hours > 2 * DAY) {
    from += hours - 2 * DAY;
    hours = 2 * DAY;
    pressure = 0;
  }
  const clock = { morning: 0, evening: 0, sleep: 0 };
  for (let t = 0; t < hours; t += step) {
    const dt = Math.min(step, hours - t);
    pressure = pressureAfter(pressure, dt * 3600, clockAt(from + t, sun, clock, pace).sleep > 0.5);
  }
  return clamp01(pressure);
}

/**
 * The sleep pressure a fly left to itself would have at this hour: two days
 * lived through from nothing (`pressureLeftAlone`). So a fly with nothing to
 * remember (the first launch, or a fly away for days) is as sleepy as the hour
 * makes it, not freshly rested.
 */
export function usualPressure(hours: number, sun: Sun, pace: DayPace = "natural") {
  return pressureLeftAlone(0, hours - 2 * DAY, 2 * DAY * 3600, sun, pace);
}

/** The fly's clock and sleep, moved on frame by frame. Allocates nothing per frame. */
export class Rhythm {
  /** The hour of the day, 0 to 24, local time: set from the real clock now and then (`setTime`) and run on between. */
  hours: number;
  sun: Sun;
  /** How the clock shapes its day (PACES): changed with `setTime`, which then starts its pressure afresh. */
  pace: DayPace;
  /** The internal state the brain is told (types.ts), each 0 to 1. */
  readonly clock = { morning: 0, evening: 0, sleep: 0 };
  pressure: number;
  /** How deeply it sleeps, 0 to 1: grows with stillness. */
  depth = 0;
  /** Seconds since it last moved. */
  still = 0;
  /** Sleep bouts begun, and seconds asleep in all, counted up as they happen. */
  bouts = 0;
  slept = 0;

  constructor(hours: number, sun: Sun = SUMMER, pressure?: number, pace: DayPace = "natural") {
    this.hours = wrap(hours);
    this.sun = sun;
    this.pace = pace;
    this.pressure = clamp01(pressure ?? usualPressure(hours, sun, pace));
    clockAt(this.hours, sun, this.clock, pace);
  }

  /** The sleep pressure it feels, as its pace has it: what the brain is told. */
  get felt() {
    return this.pressure * PACES[this.pace].need;
  }

  /** Asleep: still for five minutes or more. */
  get asleep() {
    return this.still >= RHYTHM.still;
  }

  /**
   * Puts the clock right: the hour now, today's sun where it is known, and the
   * pace chosen. A new pace starts it as sleepy as that pace leaves a fly at
   * this hour: the pressure a lively day builds would make a natural fly drowsy.
   */
  setTime(hours: number, sun: Sun = this.sun, pace: DayPace = this.pace) {
    this.hours = wrap(hours);
    this.sun = sun;
    if (pace !== this.pace) this.pressure = usualPressure(this.hours, sun, pace);
    this.pace = pace;
    clockAt(this.hours, sun, this.clock, pace);
  }

  /** `dt` seconds on, in which the fly moved or didn't. */
  step(dt: number, moving: boolean) {
    if (!(dt > 0)) return;
    const wasAsleep = this.asleep;
    this.hours = wrap(this.hours + dt / 3600);
    clockAt(this.hours, this.sun, this.clock, this.pace);
    this.still = moving ? 0 : this.still + dt;
    const asleep = this.asleep;
    if (asleep && !wasAsleep) this.bouts++;
    if (asleep) this.slept += dt;
    this.pressure = pressureAfter(this.pressure, dt, asleep);
    this.depth = -Math.expm1(-this.still / RHYTHM.deepen);
  }
}
