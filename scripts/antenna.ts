// Measures what the antennae's push (packages/body/src/senses.ts, bumpLeft and
// bumpRight) does to the whole fly on the real connectome: its life frame by
// frame (apps/web/src/life.ts), the brain in process. For the brain README's
// Sleep and the daily rhythm and A push on an antenna.
//
//   node scripts/antenna.ts [--part jar|wall|flies] [--minutes 10] [--seeds 1,2,3]
//
// jar: at 01:00, from the sleep pressure the hour gives, standing where a walk
//   into the picnic's jam jar ends (its head at the glass), for --minutes: how
//   much of it asleep (five minutes or more still), how much of it the antennae
//   felt a push, how often it walked into the glass, and how it spent its time
//   (Life's activity).
// push: at 01:00 on a bare table, after 6 minutes still (asleep), another fly
//   pushing into its face for 3 s (kept crossways just ahead of its head, as it
//   is shoved back): whether it moved within that and the second after, and
//   how long it groomed.
// wall: at dawn, its morning peak, in a box 16 mm across walled 5 mm high, for
//   --minutes: how often it walked into a wall, how soon the brain stopped
//   walking once it had (the median, and the longest it kept on), how often the body turned it away (motion.ts,
//   WALL_PATIENCE), how much of it the antennae felt a push, and grooming.
// occupancy: left to itself in --place (arena: an open disc 43 mm across) for
//   --minutes after a minute settling, on the behaviour audit's terms (10 ms
//   frames, every facet at 0.5, no daily clock): how much of it grooming, how
//   much of it either antenna felt a push, and how much of it within 3 mm of the
//   table's edge.
// flies: two flies at a table, face to face with their heads 0.2 mm apart, at
//   10:00 for --minutes: how much of it each felt a push on an antenna, and
//   grooming.

import { parseArgs } from "node:util";
import { ANTENNA_AHEAD, FLY_LENGTH, HEAD_AHEAD, Rhythm, SUMMER, WALL_TURN } from "@fly/body";
import { PICNIC, WORLDS, World } from "@fly/world";
import type { Place } from "@fly/world";
import { Life } from "../apps/web/src/life.ts";
import { InProcessBrain, brainData } from "./fuzz/brain.ts";

const { values } = parseArgs({
  options: {
    part: { type: "string" },
    minutes: { type: "string", default: "10" },
    seeds: { type: "string", default: "1,2,3" },
    place: { type: "string", default: "picnic" },
  },
});
const DT = 1 / 60;
const minutes = Number(values.minutes);
const seeds = values.seeds.split(",").map(Number);
const data = brainData();
const BARE: Place = { floor: { kind: "circle", r: 200 }, solids: [], patches: [], start: { x: 0, z: 0, yaw: 0 }, ceiling: 300 };
const jam = PICNIC.solids.find((s) => s.name === "jam")!.footprint as { x: number; z: number; r: number };


/** Counts what an antenna's push did over a run: seconds felt, and pushes begun. */
class Pushes {
  felt = 0;
  begun = 0;
  #was = false;
  frame(life: Life, dt = DT) {
    const on = life.sensed.bumpLeft > 0 || life.sensed.bumpRight > 0;
    if (on) this.felt += dt;
    if (on && !this.#was) this.begun++;
    this.#was = on;
  }
}

const pct = (part: number, whole: number) => `${((100 * part) / whole).toFixed(1)}%`;

function jar() {
  console.log(`At 01:00, its head at the jam jar's glass, ${minutes} minutes:`);
  for (const seed of seeds) {
    const life = new Life(new World(PICNIC), new InProcessBrain(data, seed));
    life.rhythm = new Rhythm(1, SUMMER);
    life.body.place(jam.x - jam.r - HEAD_AHEAD * FLY_LENGTH - 0.01, jam.z, Math.PI / 2);
    const pushes = new Pushes();
    let blocked = 0;
    let was = false;
    const doing = new Map<string, number>();
    const s = minutes * 60;
    for (let t = 0; t < s; t += DT) {
      life.step(DT, performance.now());
      pushes.frame(life);
      if (life.body.blocked && !was) blocked++;
      was = life.body.blocked;
      doing.set(life.activity, (doing.get(life.activity) ?? 0) + DT);
    }
    const r = life.rhythm!;
    const shares = [...doing].sort((a, b) => b[1] - a[1]).map(([what, time]) => `${what} ${pct(time, s)}`);
    console.log(
      `seed ${seed} | asleep ${pct(r.slept, s)} in ${r.bouts} bouts | antennae pressed ${pct(pushes.felt, s)} (${pushes.begun} pushes) | walked into the glass ${blocked} times | ${shares.join(", ")}`,
    );
  }
}

function push() {
  console.log("At 01:00, asleep after 6 minutes still, another fly pushing into its face for 3 s:");
  for (const seed of seeds) {
    const life = new Life(new World(BARE), new InProcessBrain(data, seed));
    life.rhythm = new Rhythm(1, SUMMER);
    for (let t = 0; t < 360; t += DT) life.step(DT, performance.now());
    const asleep = life.rhythm.asleep;
    const groomed = life.groomed;
    const other = life.crowd.add()!;
    let moved = false;
    let felt = 0;
    for (let t = 0; t < 4; t += DT) {
      if (t < 3) {
        const at = life.body.point(HEAD_AHEAD + ANTENNA_AHEAD + 0.25, 0, 0, other);
        Object.assign(other, { x: at.x, y: life.body.position.y, z: at.z, yaw: life.body.yaw + Math.PI / 2 });
      } else life.crowd.clear();
      life.step(DT, performance.now());
      felt = Math.max(felt, life.sensed.bumpLeft, life.sensed.bumpRight);
      moved ||= life.activity !== "resting" && life.activity !== "sleeping";
    }
    console.log(`seed ${seed} | asleep before ${asleep} | antennae pressed up to ${felt.toFixed(2)} | woke ${moved} | groomed ${(life.groomed - groomed).toFixed(2)} s`);
  }
}

function occupancy() {
  const place: Place = values.place === "arena" ? { floor: { kind: "circle", r: 21.5 }, solids: [], patches: [], start: { x: 0, z: 0, yaw: 0 }, ceiling: 30 } : WORLDS[values.place];
  if (!place) throw new Error(`No place "${values.place}"`);
  const dt = 0.01;
  console.log(`Left to itself at the ${values.place}, ${minutes} minutes after a minute settling, every facet at 0.5, no clock:`);
  for (const seed of seeds) {
    const brain = new InProcessBrain(data, seed);
    const life = new Life(new World(place), brain);
    const eyes = brain.eyes!;
    life.light = { left: new Float32Array(eyes.left.directions.length / 3).fill(0.5), right: new Float32Array(eyes.right.directions.length / 3).fill(0.5) };
    const pushes = new Pushes();
    const edge = { x: 0, y: 0, z: 0 };
    let grooming = 0;
    let atEdge = 0;
    const cpu = process.cpuUsage();
    for (let t = 0; t < 60; t += dt) life.step(dt, performance.now());
    const s = minutes * 60;
    for (let t = 0; t < s; t += dt) {
      life.step(dt, performance.now());
      pushes.frame(life, dt);
      if (life.activity === "grooming") grooming += dt;
      const p = life.body.position;
      if (life.body.onFeet && life.world.beyond(p.x, p.z, edge) > -3) atEdge += dt;
    }
    const used = process.cpuUsage(cpu);
    console.log(
      `seed ${seed} | grooming ${pct(grooming, s)} | antennae pressed ${pct(pushes.felt, s)} (${pushes.begun} pushes) | within 3 mm of the edge ${pct(atEdge, s)} | walked ${life.walked.toFixed(0)} mm | ${((used.user + used.system) / 1e6).toFixed(0)} s CPU`,
    );
  }
}

/** A box 16 mm across inside, its walls 5 mm high. */
const wall = (x: number, z: number, hx: number, hz: number) => ({ name: "wall", footprint: { kind: "box" as const, x, z, hx, hz, angle: 0 }, top: { kind: "flat" as const, y: 5 } });
const BOX: Place = {
  floor: { kind: "circle", r: 50 },
  solids: [wall(0, 9, 10, 1), wall(0, -9, 10, 1), wall(9, 0, 1, 8), wall(-9, 0, 1, 8)],
  patches: [],
  start: { x: 0, z: 0, yaw: 0.3 },
  ceiling: 300,
};

function walls() {
  console.log(`At dawn in a box 16 mm across, ${minutes} minutes:`);
  for (const seed of seeds) {
    const life = new Life(new World(BOX), new InProcessBrain(data, seed));
    life.rhythm = new Rhythm(SUMMER.sunrise, SUMMER);
    const pushes = new Pushes();
    let into = 0;
    let turns = 0;
    let wasBlocked = false;
    let wasTurning = false;
    let since = -1;
    let longest = 0;
    const stops: number[] = [];
    const s = minutes * 60;
    for (let t = 0; t < s; t += DT) {
      life.step(DT, performance.now());
      pushes.frame(life);
      const body = life.body;
      if (body.blocked && !wasBlocked) {
        into++;
        since = 0;
      }
      wasBlocked = body.blocked;
      if (since >= 0) {
        since += DT;
        longest = Math.max(longest, since);
        if (!life.intent.walking) {
          stops.push(since);
          since = -1;
        }
      }
      // The body's turn away: its own yaw rate, which isn't the brain's.
      const turning = Math.abs(body.turnRate) === WALL_TURN && life.intent.yawRate !== body.turnRate;
      if (turning && !wasTurning) turns++;
      wasTurning = turning;
    }
    stops.sort((a, b) => a - b);
    const median = stops.length ? stops[Math.floor(stops.length / 2)] : NaN;
    console.log(
      `seed ${seed} | walked into a wall ${into} times | walking stopped after a median ${(median * 1000).toFixed(0)} ms (${stops.length} stops), at most ${longest.toFixed(1)} s | turned away by the body ${turns} times | antennae pressed ${pct(pushes.felt, s)} (${pushes.begun} pushes) | grooming ${pct(life.groomed, s)}`,
    );
  }
}

function flies() {
  console.log(`Two flies face to face, heads 0.2 mm apart, at 10:00, ${minutes} minutes:`);
  for (const seed of seeds) {
    const pair = [new Life(new World(BARE), new InProcessBrain(data, seed)), new Life(new World(BARE), new InProcessBrain(data, seed + 100))];
    const half = HEAD_AHEAD * FLY_LENGTH + 0.1;
    pair[0].body.place(-half, 0, Math.PI / 2);
    pair[1].body.place(half, 0, -Math.PI / 2);
    const pushes = pair.map(() => new Pushes());
    for (const life of pair) life.rhythm = new Rhythm(10, SUMMER);
    const s = minutes * 60;
    for (let t = 0; t < s; t += DT) {
      for (let k = 0; k < 2; k++) {
        const other = pair[1 - k].body;
        const n = pair[k].crowd;
        n.clear();
        Object.assign(n.add()!, { x: other.position.x, y: other.position.y, z: other.position.z, yaw: other.yaw, vx: other.velocity.x, vy: other.velocity.y, vz: other.velocity.z });
      }
      for (let k = 0; k < 2; k++) {
        pair[k].step(DT, performance.now());
        pushes[k].frame(pair[k]);
      }
    }
    console.log(
      `seed ${seed} | ${pair.map((life, k) => `fly ${k + 1}: antennae pressed ${pct(pushes[k].felt, s)} (${pushes[k].begun} pushes), grooming ${pct(life.groomed, s)}`).join(" | ")}`,
    );
  }
}

const parts = values.part ? [values.part] : ["jar", "push", "wall", "flies"];
for (const part of parts) {
  if (part === "jar") jar();
  else if (part === "push") push();
  else if (part === "wall") walls();
  else if (part === "flies") flies();
  else if (part === "occupancy") occupancy();
  else throw new Error(`No part "${part}"`);
}
