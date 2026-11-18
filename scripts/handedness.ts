// Measures the mirrored fly (apps/web/src/brain/mirror.ts) against the
// unmirrored one on the real connectome, the brain in process. For
// docs/simulation.md, Handedness, which states the protocol.
//
//   node scripts/handedness.ts --part rest|loom|life [--minutes 10] [--seeds 1,2,3]
//   node --no-opt --no-maglev --no-sparkplug scripts/handedness.ts --part cost
//
// rest: --minutes at rest (the brain's RESTING_SENSES, 16 ms ticks), each
//   seed unmirrored and mirrored, through the diagnostic observer as
//   packages/brain/scripts/report.ts (c) counts turn events; and how many
//   ticks' commands were not exactly the unmirrored fly's reflected.
// loom: from 2 s at rest, the game's fallback looming pulse (full strength
//   for 80 ms, fading over 200 ms) in the left eye, then, from a new brain, in
//   the right, each seed unmirrored and mirrored: escape's peak and when it
//   passes 0.5, and the mean turn over the 500 ms from onset.
// life: the whole fly (apps/web/src/life.ts) in an open disc 43 mm across
//   (the behaviour audit's arena), standing at its centre facing along the
//   disc's line of symmetry, for --minutes of 60 fps frames, unmirrored and
//   mirrored, eyes shut (Node draws nothing): turn events by the observer on
//   the commands the body was given, where it ended, and how far the mirrored
//   fly's path ever was from the unmirrored one's reflection, and when it
//   first parted from it by more than 1 µm.
// cost: what the mirror adds to a frame: a stand-in brain answering every
//   frame with as many rates and regions as the real one, read as the game
//   reads it (the followed fly's command, rates and regions; another fly's
//   command), with the mirror and without. Run it interpreted, as JavaScript
//   runs on the Apple TV (--jitless can't strip TypeScript, which needs
//   WebAssembly; these flags turn off every compiler but the interpreter).

import { parseArgs } from "node:util";
import { REGIONS, RESTING_SENSES } from "@fly/brain";
import type { BrainCommand, BrainSenses, BrainState } from "@fly/brain";
import type { BrainDriver } from "@fly/contracts";
import { World } from "@fly/world";
import type { Place } from "@fly/world";
import { BehaviorObserver } from "../packages/brain/src/observer.ts";
import { MirroredBrain } from "../apps/web/src/brain/mirror.ts";
import { Life } from "../apps/web/src/life.ts";
import { InProcessBrain, brainData } from "./fuzz/brain.ts";

const { values } = parseArgs({
  options: {
    part: { type: "string" },
    minutes: { type: "string", default: "10" },
    seeds: { type: "string", default: "1,2,3" },
  },
});
const minutes = Number(values.minutes);
const seeds = values.seeds.split(",").map(Number);
const TICK = 16;
const COMMANDS = ["walk", "turn", "back", "escape", "wings", "groom", "feed", "sing"] as const;

/** The brain in process, its answers timed by fly time rather than the wall clock, so a whole life runs the same twice. */
class Clocked extends InProcessBrain {
  at = 0;
  override tick(dtMs: number, senses: BrainSenses) {
    super.tick(dtMs, senses);
    this.at += dtMs;
    this.stateAt = this.at;
  }
}

const pair = (data: ArrayBuffer, seed: number) => ({ plain: new Clocked(data, seed) as BrainDriver, mirrored: new MirroredBrain(new Clocked(data, seed)) as BrainDriver });
const reflected = (a: BrainCommand, b: BrainCommand) => COMMANDS.every((c) => (c === "turn" ? b.turn === -a.turn : b[c] === a[c]));

if (values.part === "rest") {
  const data = brainData();
  console.log(`At rest for ${minutes} minutes, ${TICK} ms ticks: the diagnostic observer's turn events (report.ts (c))`);
  for (const seed of seeds) {
    const { plain, mirrored } = pair(data, seed);
    const watched = { plain: new BehaviorObserver(), mirrored: new BehaviorObserver() };
    let parted = 0;
    for (let t = 0; t < minutes * 60_000; t += TICK) {
      plain.tick(TICK, RESTING_SENSES);
      mirrored.tick(TICK, RESTING_SENSES);
      watched.plain.observe(plain.state!.command, TICK / 1000);
      watched.mirrored.observe(mirrored.state!.command, TICK / 1000);
      if (!reflected(plain.state!.command, mirrored.state!.command)) parted++;
    }
    for (const side of ["plain", "mirrored"] as const) {
      const t = watched[side].tally;
      console.log(`  seed ${seed} ${side.padEnd(8)}  ${String(t.turnsLeft).padStart(4)} left, ${String(t.turnsRight).padStart(4)} right   walking ${((100 * t.walking) / t.seconds).toFixed(1)}%`);
    }
    console.log(`  seed ${seed}           ticks whose commands weren't the unmirrored fly's reflected: ${parted}`);
  }
} else if (values.part === "loom") {
  const data = brainData();
  console.log("The fallback looming pulse (full for 80 ms, fading over 200 ms) after 2 s at rest: escape's peak, when it passes 0.5, mean turn over 500 ms from onset");
  for (const seed of seeds) {
    const answers: Record<string, BrainCommand[]> = {};
    for (const eye of ["left", "right"] as const) {
      for (const side of ["plain", "mirrored"] as const) {
        const brain = pair(data, seed)[side];
        for (let t = 0; t < 2000; t += TICK) brain.tick(TICK, RESTING_SENSES);
        const answer: BrainCommand[] = (answers[`${eye} ${side}`] = []);
        let top = 0;
        let up = -1;
        let turn = 0;
        let n = 0;
        for (let t = TICK; t <= 1000; t += TICK) {
          const elapsed = t - TICK;
          const loom = elapsed < 80 ? 1 : Math.max(0, 1 - (elapsed - 80) / 200);
          brain.tick(TICK, { ...RESTING_SENSES, loomLeft: eye === "left" ? loom : 0, loomRight: eye === "right" ? loom : 0 });
          const { command } = brain.state!;
          answer.push({ ...command });
          top = Math.max(top, command.escape);
          if (up < 0 && command.escape >= 0.5) up = t;
          if (t <= 500) {
            turn += command.turn;
            n++;
          }
        }
        console.log(`  seed ${seed}, ${eye.padEnd(5)} eye, ${side.padEnd(8)}  escape ${top.toFixed(4)}, passes 0.5 at ${up} ms, turn ${(turn / n).toFixed(4)}`);
      }
    }
    const exact = (a: BrainCommand[], b: BrainCommand[]) => a.every((c, i) => reflected(c, b[i]));
    console.log(`  seed ${seed}           the mirrored fly's answer to each eye is exactly the unmirrored fly's to the other, reflected, every tick: ${exact(answers["left plain"], answers["right mirrored"]) && exact(answers["right plain"], answers["left mirrored"]) ? "yes" : "no"}`);
  }
} else if (values.part === "life") {
  const data = brainData();
  const ARENA: Place = { floor: { kind: "circle", r: 21.5 }, solids: [], patches: [], start: { x: 0, z: 0, yaw: 0 }, ceiling: 30 };
  const DT = 1 / 60;
  console.log(`The whole fly in an open disc 43 mm across, from its centre, for ${minutes} minutes of 60 fps frames, eyes shut`);
  for (const seed of seeds) {
    const { plain, mirrored } = pair(data, seed);
    const lives = { plain: new Life(new World(ARENA), plain), mirrored: new Life(new World(ARENA), mirrored) };
    const watched = { plain: new BehaviorObserver(), mirrored: new BehaviorObserver() };
    let apart = 0;
    let partedAt = -1;
    let frames = 0;
    for (let t = 0; t < minutes * 60; t += DT) {
      for (const side of ["plain", "mirrored"] as const) {
        const life = lives[side];
        life.step(DT, t * 1000);
        if (life.brain.state) watched[side].observe(life.brain.state.command, DT);
      }
      const a = lives.plain.body, b = lives.mirrored.body;
      const off = Math.max(Math.abs(a.position.x + b.position.x), Math.abs(a.position.y - b.position.y), Math.abs(a.position.z - b.position.z));
      apart = Math.max(apart, off);
      if (partedAt < 0 && off > 1e-3) partedAt = t;
      frames++;
    }
    for (const side of ["plain", "mirrored"] as const) {
      const t = watched[side].tally;
      const { x, z } = lives[side].body.position;
      console.log(`  seed ${seed} ${side.padEnd(8)}  ${String(t.turnsLeft).padStart(4)} left, ${String(t.turnsRight).padStart(4)} right   walked ${lives[side].walked.toFixed(0)} mm, ended at x ${x.toFixed(3)}, z ${z.toFixed(3)}, yaw ${lives[side].body.yaw.toFixed(3)}`);
    }
    console.log(`  seed ${seed}           furthest from the reflection: ${apart.toExponential(2)} mm over ${frames} frames; ${partedAt < 0 ? "never parted by 1 µm" : `parted by 1 µm at ${partedAt.toFixed(2)} s`}`);
  }
} else if (values.part === "cost") {
  // A brain that answers every frame into the same objects, as the native one does, with the real brain's rate names.
  const names = [
    "DNg100", "DNa02 left", "DNa02 right", "MDN", "DNp01", "flight", "DNg12", "MN9", "pIP10",
    ...["lamina", "medulla", "T4/T5", "lobula", "looming", "tangential"].flatMap((s) => [`vision.${s} left`, `vision.${s} right`]),
    ...REGIONS.map((r) => `region.${r.id}`),
  ];
  class Answering implements BrainDriver {
    status = "running" as const;
    error = null;
    neurons = 0;
    connections = 0;
    eyes = null;
    stateAt = 0;
    regionRates = new Float32Array(REGIONS.length);
    state: BrainState = { command: { walk: 0, turn: 0, back: 0, escape: 0, wings: 0, groom: 0, feed: 0, sing: 0, lean: 0 }, stats: { simMs: 0, wallMs: 0, spikes: 0, active: 0, rates: Object.fromEntries(names.map((n) => [n, 0])) } };
    tick(dtMs: number, senses: BrainSenses) {
      this.stateAt += dtMs;
      this.state.command.turn = senses.loomLeft - senses.loomRight;
      const rates = this.state.stats.rates;
      for (let i = 0; i < names.length; i++) rates[names[i]] = i + this.stateAt;
      for (let r = 0; r < this.regionRates.length; r++) this.regionRates[r] = r + this.stateAt;
    }
    dispose() {}
  }
  const senses: BrainSenses = { ...RESTING_SENSES, loomLeft: 0.2, legsLeft: 0.1, legsRight: 0.3, light: { left: new Float32Array(880), right: new Float32Array(892) } };
  const frames = 20_000;
  let sink = 0;
  // What the game reads of a fly's brain in a frame: of the followed fly's, the command, rates and regions for the display; of another, the command alone.
  const run = (brain: BrainDriver, followed: boolean) => {
    const start = process.cpuUsage();
    for (let f = 0; f < frames; f++) {
      brain.tick(16, senses);
      const state = brain.state!;
      sink += state.command.turn;
      if (followed) sink += state.stats.rates["DNa02 left"] + state.stats.rates["vision.looming left"] + brain.regionRates[5];
    }
    const used = process.cpuUsage(start);
    return ((used.user + used.system) / frames);
  };
  for (const followed of [true, false]) {
    for (let round = 0; round < 3; round++) {
      const plain = run(new Answering(), followed);
      const mirrored = run(new MirroredBrain(new Answering()), followed);
      console.log(`  ${followed ? "followed fly" : "another fly "} round ${round + 1}: ${plain.toFixed(2)} µs a frame unmirrored, ${mirrored.toFixed(2)} mirrored: the mirror adds ${(mirrored - plain).toFixed(2)} µs`);
    }
  }
  if (Number.isNaN(sink)) console.log(sink);
} else {
  console.error("--part rest, loom, life or cost");
  process.exit(1);
}
