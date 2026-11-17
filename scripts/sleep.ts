// Measures sleep and the daily rhythm (packages/brain/README.md, Sleep and the
// daily rhythm): the brain on the real connectome, the body's thresholds
// (packages/body behavior.ts) and its clock and sleep (rhythm.ts), with
// nothing else of the world. For the README's tables.
//
//   node scripts/sleep.ts [--part day|threshold|cost] [--row <name>] [--minutes 30] [--seeds 1,2,3] [--trials 8]
//       [--sleep wake=1,clock=3.5,pressure=4,depth=4] [--stimulus <name>] [--hunger <0..1>] [--pace natural|lively]
//
// --sleep tries other weights for state.ts's sleep term (INTERNAL_STATE.sleep);
// --stimulus picks the threshold's stimuli whose names start with it. --hunger
// holds the fly at that hunger throughout (left out, 1: the brain as it was
// before it had one; the game starts a fly at 0.7). --pace shapes the day as
// the game's Activity setting does (rhythm.ts PACES; left out, natural).
//
// day: at each hour of a summer day (and after a night or a day kept awake),
//   held there for --minutes of fly time from the sleep pressure the hour
//   gives: how much of it walking, how often it starts to move, how much
//   asleep (five minutes or more still) and in how many bouts. --row picks one.
// threshold: woken or not, over --trials seeds, by a raindrop (touch 0.25 for
//   0.3 s), the feather resting (0.4 for 5 s), touch 0.6 and stroking (1, 3 s
//   each), a brief push on both antennae and both pressed for 3 s, the hand-wired
//   looming pulse and a dark disc looming at the right
//   eye seen through the eyes: awake at night (still, but its depth 0) against
//   asleep (depth 1).
// cost: CPU time per simulated second with the internal state left out, and at
//   night asleep.

import { parseArgs } from "node:util";
import { Behavior, PACES, Rhythm, SUMMER } from "@fly/body";
import type { Intent, DayPace } from "@fly/body";
import { FlyBrain } from "../packages/brain/src/runtime.ts";
import { readConnectomeFile } from "../packages/brain/src/node.ts";
import { INTERNAL_STATE } from "../packages/brain/src/state.ts";
import { BATTERY, facetAngles, render } from "../packages/brain/src/stimuli.ts";
import { RESTING_SENSES } from "../packages/brain/src/types.ts";
import type { BrainSenses } from "../packages/brain/src/types.ts";

const { values } = parseArgs({
  options: {
    part: { type: "string" },
    row: { type: "string" },
    minutes: { type: "string", default: "30" },
    seeds: { type: "string", default: "1,2,3" },
    trials: { type: "string", default: "8" },
    stimulus: { type: "string" },
    hunger: { type: "string" },
    sleep: { type: "string" },
    pace: { type: "string", default: "natural" },
  },
});
const weights: { wake: number; clock: number; pressure: number; depth: number } = { ...INTERNAL_STATE.sleep };
for (const pair of values.sleep?.split(",") ?? []) {
  const [key, value] = pair.split("=");
  if (!(key in weights) || !Number.isFinite(Number(value))) throw new Error(`--sleep takes wake, clock, pressure and depth, not "${pair}"`);
  weights[key as keyof typeof weights] = Number(value);
}
const internalState = { ...INTERNAL_STATE, sleep: weights };
const pace = values.pace as DayPace;
if (!Object.hasOwn(PACES, pace)) throw new Error(`--pace takes ${Object.keys(PACES).join(" or ")}, not ${values.pace}`);
const hunger = values.hunger === undefined ? undefined : Number(values.hunger);
if (hunger !== undefined && !(hunger >= 0 && hunger <= 1)) throw new Error(`--hunger takes 0 to 1, not ${values.hunger}`);
/** The resting senses, at --hunger if given. */
const resting = (): BrainSenses => (hunger === undefined ? { ...RESTING_SENSES } : { ...RESTING_SENSES, hunger });
const connectome = readConnectomeFile();
const TICK = 20;
const seeds = values.seeds.split(",").map(Number);

/** Moving, as Life counts it: anything but standing still. */
const moving = (i: Intent) => i.walking || i.backing || i.groom > 0 || i.feeding || Math.abs(i.yawRate) > 0.3 || i.takeOff !== null;
/** Moving away: moving, but not grooming in place. */
const movingAway = (i: Intent) => moving(i) && !(i.groom > 0 && !i.walking && !i.backing && Math.abs(i.yawRate) <= 0.3 && i.takeOff === null && !i.feeding);

function tell(senses: BrainSenses, r: Rhythm) {
  senses.clockMorning = r.clock.morning;
  senses.clockEvening = r.clock.evening;
  senses.clockSleep = r.clock.sleep;
  senses.sleepPressure = r.felt;
  senses.sleepDepth = r.depth;
}

const ROWS: { name: string; hours: number; pressure?: number }[] = [
  { name: "no clock", hours: -1 },
  { name: "dawn (05:40)", hours: SUMMER.sunrise },
  { name: "morning (09:00)", hours: 9 },
  { name: "siesta (13:00)", hours: 13 },
  { name: "afternoon (17:00)", hours: 17 },
  { name: "dusk (20:10)", hours: SUMMER.sunset },
  { name: "late evening (23:00)", hours: 23 },
  { name: "night (01:00)", hours: 1 },
  { name: "night, after a day kept awake", hours: 1, pressure: 0.9 },
  { name: "dawn, after a night kept awake", hours: SUMMER.sunrise, pressure: 0.9 },
];

function day() {
  const minutes = Number(values.minutes);
  console.log(`Held at each hour for ${minutes} minutes of fly time, seeds ${seeds.join(", ")}, hunger ${hunger ?? "left out"}, ${pace} pace; brain told nothing ("no clock") or the rhythm at that hour:`);
  const rows = values.row ? ROWS.filter((r) => r.name.startsWith(values.row!)) : ROWS;
  for (const row of rows) {
    for (const seed of seeds) {
      const brain = new FlyBrain(connectome, { seed, internalState });
      const behavior = new Behavior();
      const rhythm = row.hours < 0 ? null : new Rhythm(row.hours, SUMMER, row.pressure, pace);
      const pressure = rhythm?.pressure ?? 0;
      const senses: BrainSenses = resting();
      let walking = 0, starts = 0, was = false, still = 0, longest = 0;
      for (let t = 0; t < minutes * 60_000; t += TICK) {
        if (rhythm) tell(senses, rhythm);
        const intent = behavior.update(brain.tick(TICK, senses).command, 0, true, TICK / 1000);
        const m = moving(intent);
        if (intent.walking) walking += TICK / 1000;
        if (m && !was) starts++;
        was = m;
        still = m ? 0 : still + TICK / 1000;
        longest = Math.max(longest, still);
        if (rhythm) {
          rhythm.step(TICK / 1000, m);
          // Held at its hour.
          rhythm.setTime(row.hours);
        }
      }
      const s = minutes * 60;
      const slept = rhythm ? `asleep ${((100 * rhythm.slept) / s).toFixed(0)}% in ${rhythm.bouts} bouts` : "";
      console.log(
        `${row.name} | seed ${seed} | pressure ${pressure.toFixed(2)} -> ${(rhythm?.pressure ?? 0).toFixed(2)} | walking ${((100 * walking) / s).toFixed(1)}% | ${((starts / s) * 600).toFixed(1)} starts per 10 min | longest still ${(longest / 60).toFixed(1)} min | ${slept}`,
      );
    }
  }
}

type Stimulus = { name: string; ms: number; senses: (t: number, out: BrainSenses) => void };

function threshold() {
  const trials = Number(values.trials);
  const probe = new FlyBrain(connectome, { seed: 1, internalState });
  const angles = facetAngles(probe.eyes!);
  const disc = BATTERY.find((s) => s.name === "loom right")!;
  const sizes = { left: probe.eyes!.left.directions.length / 3, right: probe.eyes!.right.directions.length / 3 };
  const lit = (scene: (t: number, az: number, el: number) => number, t: number) => {
    const light = { left: new Float32Array(sizes.left), right: new Float32Array(sizes.right) };
    render(scene, t, angles, light);
    return light;
  };
  const ground = lit(() => disc.ground, 0);
  const STIMULI: Stimulus[] = [
    { name: "a raindrop (touch 0.25, 0.3 s)", ms: 2000, senses: (t, s) => void (s.touch = t < 300 ? 0.25 : 0) },
    { name: "the feather resting (touch 0.4, 5 s)", ms: 5000, senses: (_, s) => void (s.touch = 0.4) },
    { name: "touch 0.6 (3 s)", ms: 3000, senses: (_, s) => void (s.touch = 0.6) },
    { name: "stroking (touch 1, 3 s)", ms: 3000, senses: (_, s) => void (s.touch = 1) },
    { name: "a brief push on both antennae (bump 1, 0.3 s)", ms: 1000, senses: (t, s) => void (s.bumpLeft = s.bumpRight = t < 300 ? 1 : 0) },
    { name: "both antennae pressed (bump 1, 3 s)", ms: 3000, senses: (_, s) => void (s.bumpLeft = s.bumpRight = 1) },
    { name: "the looming pulse (0.1 s, eyes shut)", ms: 1000, senses: (t, s) => void (s.loomRight = t < 100 ? 1 : 0) },
    { name: "a disc looming at the right eye (eyes open)", ms: disc.seconds * 1000, senses: (t, s) => void (s.light = lit(disc.scene, t / 1000)) },
  ];
  console.log(`Woken (moved within the stimulus and 1 s after; in brackets, moved away, not only groomed in place) in ${trials} seeds, at night (clock push 1, pressure 0.5); awake = still but depth 0, asleep = depth 1:`);
  for (const stimulus of STIMULI.filter((s) => !values.stimulus || s.name.startsWith(values.stimulus))) {
    const woken = { awake: 0, asleep: 0 };
    const away = { awake: 0, asleep: 0 };
    for (const depth of [0, 1] as const) {
      for (let k = 0; k < trials; k++) {
        const brain = new FlyBrain(connectome, { seed: 200 + k, internalState });
        const behavior = new Behavior();
        const senses: BrainSenses = { ...resting(), clockSleep: 1, sleepPressure: 0.5, sleepDepth: depth };
        const eyes = stimulus.name.includes("eyes open");
        if (eyes) senses.light = ground;
        for (let t = 0; t < 20_000; t += TICK) behavior.update(brain.tick(TICK, senses).command, 0, true, TICK / 1000);
        let woke = false;
        let left = false;
        for (let t = 0; t < stimulus.ms + 1000; t += TICK) {
          const each: BrainSenses = { ...senses };
          if (t < stimulus.ms) stimulus.senses(t, each);
          const intent = behavior.update(brain.tick(TICK, each).command, 0, true, TICK / 1000);
          if (moving(intent)) woke = true;
          if (movingAway(intent)) left = true;
        }
        if (woke) woken[depth === 0 ? "awake" : "asleep"]++;
        if (left) away[depth === 0 ? "awake" : "asleep"]++;
      }
    }
    console.log(`${stimulus.name} | awake ${woken.awake}/${trials} (${away.awake}) | asleep ${woken.asleep}/${trials} (${away.asleep})`);
  }
}

function cost() {
  const seconds = 60;
  const cases: [string, BrainSenses][] = [
    ["internal state left out", resting()],
    ["at dusk, awake (no sleep push, pressure 0.3)", { ...resting(), clockEvening: 1, sleepPressure: 0.3 }],
    ["at night, asleep", { ...resting(), clockSleep: 1, sleepPressure: 0.5, sleepDepth: 1 }],
  ];
  for (const [name, senses] of cases) {
    for (const seed of seeds) {
      const brain = new FlyBrain(connectome, { seed, internalState });
      for (let t = 0; t < 5000; t += TICK) brain.tick(TICK, senses);
      const before = process.cpuUsage();
      for (let t = 0; t < seconds * 1000; t += TICK) brain.tick(TICK, senses);
      const used = process.cpuUsage(before);
      console.log(`${name} | seed ${seed} | ${((used.user + used.system) / 1e6 / seconds).toFixed(3)} s CPU per simulated s`);
    }
  }
}

const parts = values.part ? [values.part] : ["day", "threshold", "cost"];
for (const part of parts) {
  if (part === "day") day();
  else if (part === "threshold") threshold();
  else if (part === "cost") cost();
  else throw new Error(`No part "${part}"`);
}
