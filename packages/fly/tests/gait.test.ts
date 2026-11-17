// The gait: the tripods, feet that stay where they are put while the body
// walks over them, steps that follow speed and turning, and a fly that comes
// to rest standing on all six feet.

import assert from "node:assert/strict";
import { test } from "node:test";
import { LEG_COUNT, LEGS, legPair, legSide } from "../src/anatomy.ts";
import { Gait, strideLength } from "../src/gait.ts";
import { Walker } from "./helpers.ts";

const DT = 1 / 60;
const TRIPOD_A = [0, 3, 4]; // L1 R2 L3
const TRIPOD_B = [1, 2, 5]; // R1 L2 R3

function homes(): Float64Array {
  const home = new Float64Array(LEG_COUNT * 3);
  for (let leg = 0; leg < LEG_COUNT; leg++) {
    const spec = LEGS[legPair(leg)];
    home[leg * 3] = spec.foot[0] * legSide(leg);
    home[leg * 3 + 2] = spec.foot[2];
  }
  return home;
}

/** Runs the gait at a steady speed and turn, recording when each leg lifts. */
function walk(speed: number, turn: number, seconds: number, dt = DT) {
  const home = homes();
  const gait = new Gait(home);
  const walker = new Walker();
  const lifts: number[][] = Array.from({ length: LEG_COUNT }, () => []);
  const strides: number[][] = Array.from({ length: LEG_COUNT }, () => []);
  let worstSlip = 0;
  const planted: ([number, number] | null)[] = Array(LEG_COUNT).fill(null);
  const frames = Math.round(seconds / dt);
  for (let f = 0; f < frames; f++) {
    const was = Array.from(gait.swinging);
    const before = Array.from(gait.feet);
    walker.advance(speed, turn, dt);
    gait.update(speed, turn, dt, home);
    for (let leg = 0; leg < LEG_COUNT; leg++) {
      const i = leg * 3;
      if (!was[leg] && gait.swinging[leg]) {
        lifts[leg].push(f * dt);
        strides[leg].push(Math.hypot(before[i] - gait.feet[i], before[i + 2] - gait.feet[i + 2]));
        planted[leg] = null;
      }
      if (!gait.swinging[leg]) {
        const w = walker.toWorld(gait.feet[i], gait.feet[i + 2]);
        // Measure only once the walk is established.
        if (planted[leg] && f * dt > 0.5) worstSlip = Math.max(worstSlip, Math.hypot(w[0] - planted[leg]![0], w[1] - planted[leg]![1]));
        if (!planted[leg]) planted[leg] = w;
        assert.equal(gait.feet[i + 1], 0, "a planted foot is on the ground");
      }
    }
  }
  return { gait, lifts, worstSlip };
}

test("legs lift in two alternating tripods", () => {
  // A fine time step, so the frame rate does not blur the phases.
  const { lifts } = walk(6, 0, 3, 1 / 1200);
  const period = strideLength(6) / 6;
  // Within a tripod the legs lift within a tenth of a cycle of each other...
  const nearest = (leg: number, t: number) => lifts[leg].reduce((best, x) => (Math.abs(x - t) < Math.abs(best - t) ? x : best));
  for (const tripod of [TRIPOD_A, TRIPOD_B]) {
    const ref = lifts[tripod[0]].at(-2)!;
    const times = tripod.map((leg) => nearest(leg, ref));
    const spread = (Math.max(...times) - Math.min(...times)) / period;
    assert.ok(spread < 0.1, `tripod ${tripod} lifts together (spread ${spread.toFixed(3)} of a cycle)`);
  }
  // ...and the tripods half a cycle apart.
  const a = lifts[TRIPOD_A[1]].at(-1)!, b = lifts[TRIPOD_B[1]].filter((t) => t < a).at(-1)!;
  const gap = (a - b) / period;
  assert.ok(Math.abs(gap - 0.5) < 0.06, `tripods alternate (gap ${gap.toFixed(3)} of a cycle)`);
  // Within each tripod the hind leg leads the front: the metachronal lag.
  for (const [front, hind] of [[0, 4], [1, 5]]) {
    const t = lifts[front].at(-1)!;
    const h = lifts[hind].filter((x) => x <= t).at(-1)!;
    assert.ok(t - h > 0 && t - h < period * 0.12, `hind leg ${hind} lifts just before front leg ${front}`);
  }
});

test("planted feet do not slide over the ground", () => {
  for (const [speed, turn] of [[0.5, 0], [2, 0], [6, 0], [12, 0], [-1, 0], [1.5, 1.2], [0, 3], [3, -2]]) {
    const { worstSlip } = walk(speed, turn, 3);
    assert.ok(worstSlip < 1e-9, `speed ${speed}, turn ${turn}: slipped ${worstSlip}`);
  }
});

test("cadence and stride grow with speed", () => {
  const steps = [0.5, 2, 6].map((speed) => walk(speed, 0, 4).lifts[0].length);
  assert.ok(steps[0] < steps[1] && steps[1] < steps[2], `steps per leg ${steps}`);
  assert.ok(strideLength(0.5) < strideLength(6));
});

test("turning shortens the steps on the inside", () => {
  const { gait } = walk(1, 2, 0.1);
  const home = homes();
  const walker = new Walker();
  const travel = new Float64Array(LEG_COUNT);
  // Over a stance, how far does each planted foot move in the body's frame?
  for (let f = 0; f < 240; f++) {
    const before = Array.from(gait.feet);
    const swinging = Array.from(gait.swinging);
    walker.advance(1, 2, DT);
    gait.update(1, 2, DT, home);
    for (let leg = 0; leg < LEG_COUNT; leg++) {
      if (swinging[leg] || gait.swinging[leg]) continue;
      travel[leg] += Math.hypot(gait.feet[leg * 3] - before[leg * 3], gait.feet[leg * 3 + 2] - before[leg * 3 + 2]);
    }
  }
  // Turning left (positive): the left legs (even) are on the inside.
  for (const pair of [0, 1, 2]) assert.ok(travel[pair * 2] < travel[pair * 2 + 1], `pair ${pair}: inside ${travel[pair * 2]} < outside ${travel[pair * 2 + 1]}`);
});

test("walking backwards steps backwards", () => {
  const { gait } = walk(-1, 0, 2);
  const home = homes();
  // Swinging feet land behind home, so stance carries them forward past it.
  let landedBehind = 0, landings = 0;
  for (let f = 0; f < 120; f++) {
    const swinging = Array.from(gait.swinging);
    gait.update(-1, 0, DT, home);
    for (let leg = 0; leg < LEG_COUNT; leg++) {
      if (swinging[leg] && !gait.swinging[leg]) {
        landings++;
        if (gait.feet[leg * 3 + 2] < home[leg * 3 + 2]) landedBehind++;
      }
    }
  }
  assert.ok(landings > 6 && landedBehind === landings, `${landedBehind} of ${landings} landings behind home`);
});

test("a fly that stops settles onto all six feet at home and stops stepping", () => {
  const { gait } = walk(3, 0.5, 1.3);
  const home = homes();
  for (let f = 0; f < 120; f++) gait.update(0, 0, DT, home);
  const steps = Array.from(gait.steps);
  for (let f = 0; f < 120; f++) gait.update(0, 0, DT, home);
  assert.deepEqual(Array.from(gait.steps), steps, "no more steps once settled");
  for (let leg = 0; leg < LEG_COUNT; leg++) {
    assert.equal(gait.swinging[leg], 0);
    const d = Math.hypot(gait.feet[leg * 3] - home[leg * 3], gait.feet[leg * 3 + 2] - home[leg * 3 + 2]);
    assert.ok(d < 0.013, `leg ${leg} is ${d.toFixed(4)} from home`);
  }
});

test('contact durations follow published stance scaling and maintain fast support', () => {
  // DeAngelis 2019 Methods Eq. 1: stance_ms = 932.8 * speed_mm^-1.025.
  // Compare extracted contacts; no timing helper from the implementation.
  for (const speed of [0.5, 3, 6, 10, 14]) {
    const home = homes(), gait = new Gait(home), dt = 0.001;
    const landed = new Float64Array(6), stances: number[] = [];
    let supported = 0, samples = 0, five = 0;
    for (let f = 0; f < 10000; f++) {
      const prev = gait.swinging.slice();
      gait.update(speed, 0, dt, home);
      const t = f * dt;
      let feet = 0;
      for (let l = 0; l < 6; l++) {
        if (prev[l] && !gait.swinging[l]) landed[l] = t;
        if (!prev[l] && gait.swinging[l] && t > 3) stances.push(t - landed[l]);
        if (!gait.swinging[l]) feet++;
      }
      if (t > 3) { supported += feet >= 3 ? 1 : 0; five += feet >= 5 ? 1 : 0; samples++; }
    }
    const stance = stances.reduce((a,b)=>a+b,0) / stances.length;
    const reference = 0.9328 * (speed * 2.5) ** -1.025;
    assert.ok(Math.abs(stance/reference-1)<0.2, `${speed}: stance ${stance}, reference ${reference}`);
    assert.ok(supported/samples>0.98, `${speed}: support ${supported/samples}`);
    if(speed===0.5) assert.ok(five/samples>0.95, 'slow metachronal steps retain five-foot support');
  }
});

test('recovery is visible at the 30 Hz display rate', () => {
  const home=homes(), gait=new Gait(home);
  let lifted=0;
  for(let i=0;i<120;i++) {
    gait.update(10,0,1/30,home);
    if(i>30) for(const height of gait.lifted) if(height>0.3)lifted++;
  }
  assert.ok(lifted>50, `visible recovery frames ${lifted}`);
});

test("contact events retain their timing at 30, 60 and 120 Hz", () => {
  for (const fps of [30, 60, 120]) for (const speed of [0.5, 3, 6, 10, 14]) {
    const gait = new Gait(homes()), home = homes(), dt = 1 / fps;
    let stance = 0, count = 0, lifted = 0;
    for (let f = 0; f < fps * 6; f++) {
      const prevLift = gait.lastLift.slice(), prevLand = gait.lastLand.slice();
      gait.update(speed, 0, dt, home);
      if (f < fps * 3) continue;
      for (let l = 0; l < 6; l++) {
        if (gait.lastLift[l] !== prevLift[l]) {
          stance += gait.lastLift[l] - (gait.lastLand[l] < gait.lastLift[l] ? gait.lastLand[l] : prevLand[l]); count++;
        }
        if (gait.lifted[l] > 0.2) lifted++;
      }
    }
    const reference = 0.9328 * (speed * 2.5) ** -1.025;
    assert.ok(Math.abs(stance / count / reference - 1) < 0.2, `${fps} Hz, ${speed} BL/s: ${stance / count}, fit ${reference}`);
    assert.ok(lifted > fps / 2, `${fps} Hz, ${speed} BL/s: visible recovery ${lifted}`);
  }
});
