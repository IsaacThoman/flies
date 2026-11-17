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
  /** Hours either side of dawn and dusk that the M and E oscillators are up. A round number from the anticipation's three hours. */
  spread: 3,
  /**
   * How much of the clock's push toward sleep is left while the sun is up:
   * light keeps a fly awake through the large ventral lateral neurons (Shang et
   * al. 2008; Sheeba et al. 2008), so a male's midday siesta is lighter than his
   * night's sleep. A round number, chosen by what it does: at 0.6 the fly
   * hardly sleeps at midday (14 to 35% of 90 minutes), at 0.8 it sleeps much of
   * it, as males do (packages/brain/README.md, Sleep and the daily rhythm).
   */
  daylight: 0.8,
  /** Hours for sleep pressure to build most of the way (1 - 1/e) while awake, and to discharge while asleep. Round numbers, with discharge faster than build-up as in the two-process model (Daan et al. 1984). */
  build: 12,
  discharge: 3,
  /** Seconds without moving before it counts as asleep. */
  still: 300,
  /** Seconds still for its depth to come most of the way (1 - 1/e) to 1. */
  deepen: 300,
} as const;

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
export function clockAt(hours: number, sun: Sun, out = { morning: 0, evening: 0, sleep: 0 }) {
  out.morning = bump(hours, sun.sunrise, RHYTHM.spread);
  out.evening = bump(hours, sun.sunset, RHYTHM.spread);
  const up = wrap(hours - sun.sunrise) < wrap(sun.sunset - sun.sunrise);
  out.sleep = (1 - Math.max(out.morning, out.evening)) * (up ? RHYTHM.daylight : 1);
  return out;
}

/** Sleep pressure after `seconds` awake (or asleep) from `pressure`. */
export function pressureAfter(pressure: number, seconds: number, asleep: boolean) {
  const keep = Math.exp(-seconds / ((asleep ? RHYTHM.discharge : RHYTHM.build) * 3600));
  return asleep ? pressure * keep : 1 - (1 - pressure) * keep;
}

/**
 * The sleep pressure a fly left to itself would have at this hour: two days
 * lived through on a model day, asleep whenever the clock pushes it more than
 * halfway toward sleep. So a fly that has just arrived (the page loaded) is as
 * sleepy as the hour makes it, not freshly rested.
 */
export function usualPressure(hours: number, sun: Sun) {
  const step = 1 / 12;
  const clock = { morning: 0, evening: 0, sleep: 0 };
  let pressure = 0;
  for (let h = hours - 2 * DAY; h < hours; h += step) pressure = pressureAfter(pressure, step * 3600, clockAt(h, sun, clock).sleep > 0.5);
  return pressure;
}

/** The fly's clock and sleep, moved on frame by frame. Allocates nothing per frame. */
export class Rhythm {
  /** The hour of the day, 0 to 24, local time: set from the real clock now and then (`setTime`) and run on between. */
  hours: number;
  sun: Sun;
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

  constructor(hours: number, sun: Sun = SUMMER, pressure = usualPressure(hours, sun)) {
    this.hours = wrap(hours);
    this.sun = sun;
    this.pressure = clamp01(pressure);
    clockAt(this.hours, sun, this.clock);
  }

  /** Asleep: still for five minutes or more. */
  get asleep() {
    return this.still >= RHYTHM.still;
  }

  /** Puts the clock right: the hour now and today's sun, where it is known. */
  setTime(hours: number, sun: Sun = this.sun) {
    this.hours = wrap(hours);
    this.sun = sun;
    clockAt(this.hours, sun, this.clock);
  }

  /** `dt` seconds on, in which the fly moved or didn't. */
  step(dt: number, moving: boolean) {
    if (!(dt > 0)) return;
    const wasAsleep = this.asleep;
    this.hours = wrap(this.hours + dt / 3600);
    clockAt(this.hours, this.sun, this.clock);
    this.still = moving ? 0 : this.still + dt;
    const asleep = this.asleep;
    if (asleep && !wasAsleep) this.bouts++;
    if (asleep) this.slept += dt;
    this.pressure = pressureAfter(this.pressure, dt, asleep);
    this.depth = -Math.expm1(-this.still / RHYTHM.deepen);
  }
}
