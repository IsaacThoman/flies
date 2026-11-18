// What the legs' proprioceptors change (packages/brain/README.md, Senses: the
// legs' proprioceptors): the brain on the real connectome, the body's
// thresholds (packages/body behavior.ts) and its legs' sense (senses.ts,
// legMovement: as fast as the brain's last command stepped them), nothing
// else of the world. Each part runs with the legs' steps fed back and with
// the legs still, the brain as it was before it felt them.
//
//   node scripts/legs.ts [--part rest|groom|flight|withdraw] [--seconds 600] [--seeds 1,2,3] [--rate <Hz>]
//
// rest: --seconds standing: the share of time walking and its bouts (the
//   diagnostic observer, as packages/brain's report.ts section c counts
//   them), turns toward the left and right, the mean `groom` and `wings`, the
//   network's spikes a second, CPU seconds per simulated second (this
//   thread's, unscaled: compare the two on one machine), and the mean of what
//   the legs sent.
// groom: wind at 0.5 for 10 s, standing (the antennae's wind neurons drive
//   grooming): the mean `groom` and the share walking.
// flight: in the air after 2 s of a walk on the ground (both sides 0.5), the
//   legs withdrawn (as off the ground) against still stepping: (a) `wingbeat`
//   held at 1 for 3 s: `wings`' mean; (b) the loop the body closes from a
//   take-off's 0.62 without the body's floor (packages/brain/scripts/
//   wingbeat.ts (c)): the brain's own `wings` at 0.5, 1, 2 and 3 s.
// withdraw: the most the legs could withdraw: every mechanosensory neuron
//   entering by a leg nerve (proprioceptive and tactile, by the anatomy
//   sidecar: `npm run brain:fetch`) held at 10 and at 50 Hz for 2 s on the
//   ground, then in the air withdrawn against held: (a) and (b) as above.
//
// --rate sets the legs' rate at full strength (io.ts's LEG_RATE).

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { Behavior, legMovement } from "@fly/body";
import type { Intent } from "@fly/body";
import { loadAnatomy } from "../packages/brain/src/anatomy.ts";
import { DEFAULT_CONNECTOME_PATH, readConnectomeFile } from "../packages/brain/src/node.ts";
import { BehaviorObserver } from "../packages/brain/src/observer.ts";
import { FlyBrain } from "../packages/brain/src/runtime.ts";
import { RESTING_SENSES } from "../packages/brain/src/types.ts";
import type { BrainSenses } from "../packages/brain/src/types.ts";

const { values } = parseArgs({
  options: {
    part: { type: "string" },
    seconds: { type: "string", default: "600" },
    seeds: { type: "string", default: "1,2,3" },
    rate: { type: "string" },
  },
});
const seconds = Number(values.seconds);
const seeds = values.seeds.split(",").map(Number);
const connectome = readConnectomeFile();
const TICK = 10;
const f = (n: number, digits = 2) => n.toFixed(digits);

const brain = (seed: number) => {
  const b = new FlyBrain(connectome, { seed });
  if (values.rate) for (const group of b.wiring.senses) if (group.spec.last) group.maxRate = Number(values.rate);
  return b;
};
/** Its legs feel how fast its last step moved them, as the game's body has them feel it. */
const feel = (senses: BrainSenses, intent: Intent) => {
  senses.legsLeft = legMovement(intent.speed, intent.yawRate, 1);
  senses.legsRight = legMovement(intent.speed, intent.yawRate, -1);
};
const LEGS = [
  ["fed back", true],
  ["still", false],
] as const;
const AIR: BrainSenses = { ...RESTING_SENSES, grounded: false };
console.log(`Seeds ${seeds.join(", ")}; the legs' rate at full strength ${brain(1).wiring.senses.find((g) => g.spec.last)!.maxRate} Hz.`);

function rest() {
  console.log(`\nrest: ${seconds} s standing: walking (bouts), turns left/right, groom, wings, spikes/s, CPU s/s, legs sent (mean left/right)`);
  for (const [name, fed] of LEGS) {
    for (const seed of seeds) {
      const b = brain(seed);
      const behavior = new Behavior();
      const observer = new BehaviorObserver();
      const senses: BrainSenses = { ...RESTING_SENSES };
      let groom = 0, wings = 0, spikes = 0, left = 0, right = 0;
      const n = (seconds * 1000) / TICK;
      const cpu = process.cpuUsage();
      for (let k = 0; k < n; k++) {
        const { command, stats } = b.tick(TICK, senses);
        observer.observe(command, TICK / 1000);
        const intent = behavior.update(command, 0, true, TICK / 1000);
        if (fed) feel(senses, intent);
        groom += command.groom / n;
        wings += command.wings / n;
        spikes += stats.spikes / seconds;
        left += (senses.legsLeft ?? 0) / n;
        right += (senses.legsRight ?? 0) / n;
      }
      const used = process.cpuUsage(cpu);
      const t = observer.tally;
      console.log(
        `  ${name.padEnd(9)} seed ${seed}: walking ${f((t.walking / seconds) * 100, 0)}% (${t.walkBouts} bouts), turns ${t.turnsLeft}/${t.turnsRight}, groom ${f(groom, 3)}, wings ${f(wings, 3)}, ${f(spikes / 1000, 0)}k, ${f((used.user + used.system) / 1e6 / seconds, 3)} s, legs ${f(left, 3)}/${f(right, 3)}`,
      );
    }
  }
}

function groom() {
  console.log("\ngroom: wind 0.5 for 10 s standing, after 2 s at rest: groom mean, walking share");
  for (const [name, fed] of LEGS) {
    const rows = seeds.map((seed) => {
      const b = brain(seed);
      const behavior = new Behavior();
      const senses: BrainSenses = { ...RESTING_SENSES };
      const run = (ms: number, wind: number) => {
        let groom = 0, walking = 0;
        senses.wind = wind;
        for (let t = 0; t < ms; t += TICK) {
          const { command } = b.tick(TICK, senses);
          const intent = behavior.update(command, 0, true, TICK / 1000);
          if (fed) feel(senses, intent);
          groom += command.groom / (ms / TICK);
          if (intent.walking) walking += TICK / ms;
        }
        return { groom, walking };
      };
      run(2000, 0);
      const { groom, walking } = run(10_000, 0.5);
      return `${f(groom)} ${f(walking * 100, 0)}%`;
    });
    console.log(`  ${name.padEnd(9)}${rows.join("   ")}`);
  }
}

/**
 * In the air after `ground` has run 2 s on the ground, with `air` each tick: (a) `wingbeat` held at 1 for
 * 3 s, `wings`' mean; (b) the loop from a take-off's 0.62 without the floor, the brain's own `wings` at
 * 0.5, 1, 2 and 3 s.
 */
function aloft(name: string, ground: (b: FlyBrain) => void, air: (b: FlyBrain) => Partial<BrainSenses>) {
  const ready = (seed: number) => {
    const b = brain(seed);
    for (let t = 0; t < 2000; t += TICK) ground(b);
    return b;
  };
  const held = seeds.map((seed) => {
    const b = ready(seed);
    let mean = 0;
    for (let t = 0; t < 3000; t += TICK) mean += b.tick(TICK, { ...AIR, ...air(b), wingbeat: 1 }).command.wings / (3000 / TICK);
    return f(mean);
  });
  const loop = seeds.map((seed) => {
    const b = ready(seed);
    let smoothed = 0.62;
    const at: string[] = [];
    for (let t = TICK; t <= 3000; t += TICK) {
      const { wings } = b.tick(TICK, { ...AIR, ...air(b), wingbeat: smoothed }).command;
      smoothed += (wings - smoothed) * (1 - Math.exp(-12 * (TICK / 1000)));
      if (t === 500 || t % 1000 === 0) at.push(f(wings));
    }
    return at.join(" ");
  });
  console.log(`\n${name}: (a) wingbeat 1 held 3 s, wings mean: ${held.join("   ")}`);
  console.log(`  (b) the loop without the floor, wings at 0.5, 1, 2, 3 s: ${loop.join("   ")}`);
}

function flight() {
  const WALK: Partial<BrainSenses> = { legsLeft: 0.5, legsRight: 0.5 };
  const walk = (b: FlyBrain) => void b.tick(TICK, { ...RESTING_SENSES, ...WALK });
  aloft("flight, legs withdrawn", walk, () => ({}));
  aloft("flight, legs still stepping", walk, () => WALK);
}

async function withdraw() {
  const path = fileURLToPath(new URL("../packages/brain/data/anatomy.bin", import.meta.url));
  if (!existsSync(path)) throw new Error(`withdraw needs the anatomy sidecar at ${path} (npm run brain:fetch)`);
  const bytes = (p: string) => {
    const b = readFileSync(p);
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  };
  const anatomy = await loadAnatomy(bytes(path), bytes(DEFAULT_CONNECTOME_PATH));
  const legs = connectome.filter((i) => /^(Pro|Meso|Meta)LN/.test(anatomy.columns.entryNerve.value(i)) && /^mechanosensory_(proprioceptive|tactile)$/.test(connectome.columns.class.value(i)));
  console.log(`\nwithdraw: ${legs.length} mechanosensory neurons enter by the leg nerves`);
  // Added after every other input, so every other input draws what it drew.
  const added = new WeakSet<FlyBrain>();
  const every = (b: FlyBrain) => {
    if (added.has(b)) return;
    b.sim.addInput("every leg", legs);
    added.add(b);
  };
  for (const rate of [10, 50]) {
    const on = (b: FlyBrain) => {
      every(b);
      b.sim.setRate("every leg", rate);
      b.tick(TICK, RESTING_SENSES);
    };
    aloft(`withdraw, all at ${rate} Hz on the ground, withdrawn in the air`, on, (b) => (b.sim.setRate("every leg", 0), {}));
    aloft(`withdraw, all at ${rate} Hz on the ground, held in the air`, on, () => ({}));
  }
}

const parts = values.part ? [values.part] : ["rest", "groom", "flight", "withdraw"];
for (const part of parts) {
  if (part === "rest") rest();
  else if (part === "groom") groom();
  else if (part === "flight") flight();
  else if (part === "withdraw") await withdraw();
  else throw new Error(`No part "${part}"`);
}
