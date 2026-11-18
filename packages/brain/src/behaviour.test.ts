// What the brain does on the real connectome. It is not in git (see README),
// so these skip unless `npm run brain:pack` has been run. They take about a
// minute; scripts/report.ts measures the same things at more length.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { DEFAULT_CONNECTOME_PATH, readConnectomeFile } from "./node.ts";
import { BehaviorObserver } from "./observer.ts";
import { FlyBrain } from "./runtime.ts";
import { RESTING_SENSES } from "./types.ts";
import type { BrainCommand, BrainSenses } from "./types.ts";

const skip = existsSync(DEFAULT_CONNECTOME_PATH) ? false : `no ${DEFAULT_CONNECTOME_PATH}; run npm run brain:pack`;
const connectome = skip ? undefined : readConnectomeFile();
const TICK = 16;

const brain = (options: { spontaneous?: boolean } = {}) => new FlyBrain(connectome!, { seed: 1, ...options });
const run = (b: FlyBrain, ms: number, senses: BrainSenses = RESTING_SENSES) => {
  let state = b.tick(TICK, senses);
  for (let t = TICK; t < ms; t += TICK) state = b.tick(TICK, senses);
  return state;
};
/** Mean of each command over `ms` under these senses. */
const mean = (b: FlyBrain, ms: number, senses: BrainSenses) => {
  const sum: Record<string, number> = {};
  let n = 0;
  for (let t = 0; t < ms; t += TICK) {
    const { command } = b.tick(TICK, senses);
    n++;
    for (const [k, v] of Object.entries(command)) sum[k] = (sum[k] ?? 0) + v;
  }
  return Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, v / n])) as BrainCommand;
};
const FULL: BrainSenses = { loomLeft: 1, loomRight: 1, touch: 1, bumpLeft: 1, bumpRight: 1, wind: 1, sweet: 1, grounded: false, maleTaste: 1, wingbeat: 1, bitter: 1, water: 1, legsLeft: 1, legsRight: 1 };
const only = (key: keyof BrainSenses): BrainSenses => ({ ...RESTING_SENSES, [key]: FULL[key] });
const SENSES = Object.keys(FULL) as (keyof BrainSenses)[];

test("every group finds its neurons in the real connectome, and none is both driven and read", { skip }, () => {
  const { wiring } = brain();
  const sizes = Object.fromEntries([...wiring.senses, ...wiring.background, ...wiring.readouts].map((g) => [g.spec.name, g.neurons.length]));
  assert.deepEqual(sizes, {
    loomLeft: 165,
    loomRight: 146,
    "touch head": 932,
    "touch body": 3598,
    bumpLeft: 203,
    bumpRight: 132,
    wind: 475,
    sweet: 52,
    grounded: 13,
    maleTaste: 44,
    wingbeat: 413,
    bitter: 38,
    water: 23,
    "claw left": 50,
    "claw right": 44,
    "club left": 72,
    "club right": 65,
    "hair plates left": 37,
    "hair plates right": 41,
    "background left": 4424,
    "background right": 4466,
    DNg100: 2,
    "DNa02 left": 1,
    "DNa02 right": 1,
    MDN: 4,
    DNp01: 2,
    DNp02: 2,
    DNp11: 2,
    flight: 24,
    DNg12: 26,
    MN9: 2,
    pIP10: 2,
  });
  // The aristae's thermoreceptors, each antenna's own: three of each in a real arista (Budelli et al. 2019).
  assert.deepEqual(Object.fromEntries(wiring.thermo.map((g) => [g.spec.name, g.neurons.length])), { "heating left": 4, "cooling left": 3, "heating right": 3, "cooling right": 4 });
  const driven = new Set([...wiring.senses, ...wiring.background, ...wiring.thermo].flatMap((g) => [...g.neurons]));
  for (const group of wiring.readouts) for (const i of group.neurons) assert.ok(!driven.has(i), `${group.spec.name} neuron ${i} is also driven`);
  // Touch's regions, as README's Senses gives them: every head bristle neuron in one, by part and side.
  const regions: Record<string, number> = {};
  for (const group of wiring.senses) group.spec.regions?.forEach((r, k) => (regions[r.sense] = group.ends![k] - (k === 0 ? 0 : group.ends![k - 1])));
  assert.deepEqual(regions, {
    touchEyeLeft: 340,
    touchEyeRight: 405,
    touchFrontLeft: 39,
    touchFrontRight: 30,
    touchOcciputLeft: 9,
    touchOcciputRight: 25,
    touchMouthpartsLeft: 44,
    touchMouthpartsRight: 40,
    touchNotum: 289,
    touchWings: 391,
    touchAbdomen: 1040,
    touchLegs: 1878,
  });
});

test("no seizures: after each sense, and everything at once, at full strength for 2 s, activity is back in the resting band within 1 s", { skip }, () => {
  const windowRate = (b: FlyBrain) => {
    let spikes = 0;
    for (let t = 0; t < 250; t += 10) spikes += b.tick(10, RESTING_SENSES).stats.spikes;
    return spikes * 4;
  };
  const reference = brain();
  run(reference, 2000);
  let band = 0;
  for (let w = 0; w < 120; w++) band = Math.max(band, windowRate(reference));
  for (const senses of [...SENSES.map(only), FULL]) {
    const b = brain();
    run(b, 1000);
    run(b, 2000, senses);
    run(b, 750);
    const after = windowRate(b);
    assert.ok(after <= band, `${JSON.stringify(senses)}: ${after} spikes/s 1 s after, resting band tops out at ${band}`);
  }
});

test("a full-strength loom in either eye fires the giant fiber: escape passes 0.5 within 150 ms and falls below 0.3 within 300 ms of the loom ending", { skip }, () => {
  for (const eye of ["loomLeft", "loomRight"] as const) {
    // The fallback looming pulse: held at its peak for 80 ms, fading to 0 over 200 ms.
    const b = brain();
    run(b, 2000);
    let up = -1;
    let down = -1;
    for (let t = TICK; t <= 800; t += TICK) {
      const elapsed = t - TICK;
      const loom = elapsed < 80 ? 1 : Math.max(0, 1 - (elapsed - 80) / 200);
      const { command } = b.tick(TICK, { ...RESTING_SENSES, [eye]: loom });
      if (up < 0 && command.escape > 0.5) up = t;
      if (loom === 0 && down < 0 && command.escape < 0.3) down = t - 280;
    }
    assert.ok(up >= 0 && up <= 150, `${eye} pulse: escape passed 0.5 at ${up} ms`);
    assert.ok(down >= 0 && down <= 300, `${eye} pulse: escape below 0.3 ${down} ms after the loom ended`);

    // A loom held for a second, then gone.
    const held = brain();
    run(held, 2000);
    let peak = 0;
    let first = -1;
    for (let t = TICK; t <= 1008; t += TICK) {
      const { command } = held.tick(TICK, only(eye));
      if (first < 0 && command.escape > 0.5) first = t;
      peak = Math.max(peak, command.escape);
    }
    assert.ok(first >= 0 && first <= 150, `${eye} held: escape passed 0.5 at ${first} ms`);
    let settled = -1;
    for (let t = TICK; t <= 600 && settled < 0; t += TICK) if (held.tick(TICK, RESTING_SENSES).command.escape < 0.3) settled = t;
    assert.ok(settled >= 0 && settled <= 300, `${eye} held: escape below 0.3 ${settled} ms after the loom ended`);
  }
});

test("escape stays below 0.3 under every sense that isn't looming", { skip }, () => {
  for (const key of SENSES.filter((k) => !k.startsWith("loom"))) {
    const b = brain();
    run(b, 1000);
    let peak = 0;
    for (let t = 0; t < 2000; t += TICK) peak = Math.max(peak, b.tick(TICK, only(key)).command.escape);
    assert.ok(peak < 0.3, `${key}: escape reached ${peak}`);
  }
});

test("left and right mirror each other: either eye's loom escapes alike, and a scene on either side steers toward it", { skip }, () => {
  const looms = (["loomLeft", "loomRight"] as const).map((eye) => {
    const b = brain();
    run(b, 1000);
    return mean(b, 500, only(eye));
  });
  for (const loom of looms) {
    assert.ok(loom.escape > 0.7, `escape ${loom.escape}`);
    assert.ok(loom.wings > 0.5, `wings ${loom.wings}`);
  }
  assert.ok(Math.abs(looms[0].escape - looms[1].escape) < 0.15, `escape ${looms[0].escape} vs ${looms[1].escape}`);

  // The internal state's scene, one eye at a time, with nothing else going on.
  const turns = (["left", "right"] as const).map((side) => {
    const b = brain({ spontaneous: false });
    for (const group of b.wiring.background) b.sim.setRate(group.spec.name, group.spec.side === side ? group.maxRate * 0.6 : 0);
    run(b, 500);
    return mean(b, 2000, RESTING_SENSES).turn;
  });
  assert.ok(turns[0] < -0.2, `a scene on the left turns ${turns[0]}`);
  assert.ok(turns[1] > 0.2, `a scene on the right turns ${turns[1]}`);
  const ratio = Math.abs(turns[0] / turns[1]);
  assert.ok(ratio > 1 / 1.6 && ratio < 1.6, `left ${turns[0]} against right ${turns[1]}`);

  // Either side's front-of-head bristles reach grooming. Measured: groom 0.26 from the left and 0.24 from the
  // right; 0.15 and 0 while five of the right's were muted as serotonergic (params.ts).
  const grooms = (["left", "right"] as const).map((side) => {
    const b = brain({ spontaneous: false });
    b.sim.addInput("bristles", connectome!.find({ superClass: "cb_sensory", type: "BM", side }), 50);
    run(b, 1000);
    return mean(b, 1000, RESTING_SENSES).groom;
  });
  for (const groom of grooms) assert.ok(groom > 0.1, `bristles: groom ${grooms}`);
});

test("a fed fly leaves alone sugar that a starved one feeds on", { skip }, () => {
  // Sugar at 0.8 for 3 s after 2 s of rest, seeds 1 to 3: the body feeds above 0.15. Measured since `sweet` drives the
  // mouth's sugar neurons by what they are: fed 0.06 to 0.10, starved 0.16 to 0.19.
  const feed = (hunger: number) => {
    let sum = 0;
    for (const seed of [1, 2, 3]) {
      const b = new FlyBrain(connectome!, { seed });
      run(b, 2000, { ...RESTING_SENSES, hunger });
      sum += mean(b, 3000, { ...RESTING_SENSES, sweet: 0.8, hunger }).feed;
    }
    return sum / 3;
  };
  const fed = feed(0);
  const starved = feed(1);
  assert.ok(starved > 0.15, `starved ${starved}`);
  assert.ok(fed < 0.12, `fed ${fed}`);
  assert.ok(fed < 0.6 * starved, `fed ${fed} against starved ${starved}`);
});

test("bitter on sugar stops the proboscis; water alone doesn't move it, however thirsty", { skip }, () => {
  const feed = (senses: Partial<BrainSenses>) => {
    let sum = 0;
    for (const seed of [1, 2, 3]) {
      const b = new FlyBrain(connectome!, { seed });
      run(b, 2000);
      sum += mean(b, 3000, { ...RESTING_SENSES, ...senses }).feed;
    }
    return sum / 3;
  };
  const sugar = feed({ sweet: 1 });
  assert.ok(sugar > 0.2, `sugar ${sugar}`);
  assert.ok(feed({ sweet: 1, bitter: 0.25 }) < 0.05);
  assert.ok(feed({ water: 1 }) < 0.02);
  // Thirst gates the water neurons' output (io.ts, THIRST), but nothing they reach extends the proboscis (README, Thirst).
  assert.ok(feed({ water: 1, thirst: 0 }) < 0.02);
});

test("touch on its notum makes it back away, on its face groom, as wind or a push on either antenna does; sweet makes it feed, and looming opens the wings", { skip }, () => {
  const restB = brain();
  run(restB, 1000);
  const rest = mean(restB, 1000, RESTING_SENSES);
  // A push on an antenna grooms past 0.2, where the body starts to show it.
  for (const [sense, command, over] of [
    ["touchNotum", "back", 0.2],
    ["touchFrontLeft", "groom", 0.2],
    ["touchFrontRight", "groom", 0.2],
    ["wind", "groom", 0.3],
    ["bumpLeft", "groom", 0.2],
    ["bumpRight", "groom", 0.2],
    ["sweet", "feed", 0.3],
    ["loomLeft", "wings", 0.3],
  ] as const) {
    const b = brain();
    run(b, 1000);
    const response = mean(b, 1000, { ...RESTING_SENSES, [sense]: sense.startsWith("touch") ? 1 : FULL[sense as keyof typeof FULL] });
    assert.ok(response[command] > over, `${sense}: ${command} ${response[command]}`);
    assert.ok(rest[command] < 0.1, `at rest: ${command} ${rest[command]}`);
  }
});

test("the wings' own strain sensors drive the flight motor neurons, short of holding the fly up: the loop they close with the body dies away", { skip }, () => {
  const air: BrainSenses = { ...RESTING_SENSES, grounded: false };
  // Beating at full power (measured: wings 0.30 to 0.32 on average, seeds 1 to 3; 0.6 holds the fly up).
  const held = brain();
  run(held, 1000, air);
  const beating = mean(held, 2000, { ...air, wingbeat: 1 }).wings;
  assert.ok(beating > 0.2 && beating < 0.45, `wings ${beating}`);
  // The body flying on the brain's wings alone, felt by the wings' sensors, from a take-off's 0.62:
  // the brain answers with less than it is given, and the wings come down within a second (measured: 0.00 to 0.02).
  const loop = brain();
  run(loop, 2000);
  let drive = 0.62;
  let wings = 1;
  for (let t = 0; t < 1000; t += TICK) {
    wings = loop.tick(TICK, { ...air, wingbeat: drive }).command.wings;
    drive += (wings - drive) * (1 - Math.exp(-12 * (TICK / 1000)));
  }
  assert.ok(wings < 0.15, `wings ${wings} after a second`);
});

test("at rest it walks in bouts, turns both ways and never escapes (3 minutes of fly time)", { skip }, () => {
  const b = brain();
  const observer = new BehaviorObserver();
  for (let t = 0; t < 180_000; t += TICK) observer.observe(b.tick(TICK, RESTING_SENSES).command, TICK / 1000);
  const t = observer.tally;
  const share = t.walking / t.seconds;
  assert.ok(share > 0.2 && share < 0.7, `walking ${(share * 100).toFixed(0)}% of the time`);
  assert.ok(t.walkBouts >= 15, `${t.walkBouts} walking bouts`);
  assert.ok(t.turnsLeft >= 1 && t.turnsRight >= 1, `${t.turnsLeft} turns left, ${t.turnsRight} right`);
  assert.equal(t.escapes, 0);
  assert.ok(t.peak.escape < 0.3, `escape reached ${t.peak.escape}`);
  // The body sings past 0.4 (packages/body's SING_ON): alone, it never comes near.
  assert.ok(t.peak.sing < 0.25, `sing reached ${t.peak.sing}`);
});

test("a male's taste on its front legs doesn't make it sing; P1, the courtship neurons, does, through pIP10", { skip }, () => {
  // Every sense at full strength alone, the taste of a male among them, stays well under the body's 0.4.
  for (const sense of SENSES) {
    const b = brain();
    run(b, 1000);
    let peak = 0;
    for (let t = 0; t < 3000; t += TICK) peak = Math.max(peak, b.tick(TICK, only(sense)).command.sing);
    assert.ok(peak < 0.25, `${sense}: sing reached ${peak}`);
  }
  // pC1_1 to pC1_19, P1 in the male CNS, at 30 Hz: pIP10 sings.
  const b = brain();
  b.sim.addInput("P1", connectome!.filter((i) => /^pC1_\d/.test(connectome!.columns.type.value(i))), 30);
  assert.ok(mean(b, 1000, RESTING_SENSES).sing > 0.9);
});
