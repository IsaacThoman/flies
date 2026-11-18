import assert from "node:assert/strict";
import { test } from "node:test";
import { PATCHES, Pantry, SOLIDS, WINDOWSILL, World, createPicnic } from "@fly/world";
import { ANTENNA_AHEAD, CONTACT_TOUCH, Contacts, FLY_HEIGHT, FLY_LENGTH, FlyBody, HIT_FULL_SPEED, HEAD_AHEAD, LOOM_DECAY, LOOM_HOLD, MOUTH_AHEAD, SenseTracker, WIND_FULL_SPEED, createIntent, FEET_SIDE, LEGS_FULL_SPEED, legMovement } from "../src/index.ts";
import type { Intent, Looming, SenseInput } from "../src/index.ts";

/** A bare round table this wide, with nothing on it. */
const openTable = (r: number) => new World({ floor: { kind: "circle", r }, solids: [], patches: [], start: { x: 0, z: 0, yaw: 0 }, ceiling: 320 });

const DT = 1 / 60;
const world = createPicnic();
const pantry = new Pantry(world, PATCHES);

function input(body: FlyBody, extra: Partial<SenseInput> = {}): SenseInput {
  return { dt: DT, body, world, pantry, looming: [], air: { x: 0, y: 0, z: 0 }, eyesOpen: false, proboscis: 0, ...extra };
}

/** A ball flying straight at the fly's head from `from`, at `speed` mm/s. */
function approach(tracker: SenseTracker, body: FlyBody, from: { x: number; y: number; z: number }, speed: number, seconds: number, eyesOpen = false) {
  const head = body.point(0.42, 0.3, 0, { x: 0, y: 0, z: 0 });
  const d = Math.hypot(from.x - head.x, from.y - head.y, from.z - head.z);
  const ball: Looming = { id: 1, position: { ...from }, r: 30 };
  let peak = { left: 0, right: 0 };
  for (let t = 0; t < seconds; t += DT) {
    const k = Math.min(1, (speed * t) / (d - 40));
    ball.position.x = from.x + (head.x - from.x) * k;
    ball.position.y = from.y + (head.y - from.y) * k;
    ball.position.z = from.z + (head.z - from.z) * k;
    const s = tracker.update(input(body, { looming: [ball], eyesOpen }));
    peak = { left: Math.max(peak.left, s.loomLeft), right: Math.max(peak.right, s.loomRight) };
  }
  return peak;
}

test("something rushing at it from its left looms in the left eye", () => {
  // Facing +z: its left is +x.
  const body = new FlyBody(world, { x: 0, z: -150, yaw: 0 });
  const peak = approach(new SenseTracker(), body, { x: 300, y: 60, z: -150 }, 900, 0.4);
  assert.ok(peak.left > 0.5, `left ${peak.left}`);
  assert.equal(peak.right, 0);
  const right = approach(new SenseTracker(), body, { x: -300, y: 60, z: -150 }, 900, 0.4);
  assert.ok(right.right > 0.5 && right.left === 0);
});

test("straight ahead looms in both eyes; slow approach doesn't loom", () => {
  const body = new FlyBody(world, { x: 0, z: -150, yaw: 0 });
  const ahead = approach(new SenseTracker(), body, { x: 0, y: 20, z: 150 }, 900, 0.4);
  assert.ok(ahead.left > 0.5 && ahead.right > 0.5);
  const slow = approach(new SenseTracker(), body, { x: 300, y: 60, z: -150 }, 60, 1);
  assert.equal(slow.left, 0);
});

test("a loom holds briefly then fades; with the eyes open there is no hand-wired looming", () => {
  const body = new FlyBody(world, { x: 0, z: -150, yaw: 0 });
  const tracker = new SenseTracker();
  approach(tracker, body, { x: 300, y: 60, z: -150 }, 900, 0.4);
  let s = tracker.update(input(body));
  for (let t = 0; t < LOOM_HOLD + LOOM_DECAY + 0.05; t += DT) s = tracker.update(input(body));
  assert.equal(s.loomLeft, 0);
  const open = approach(new SenseTracker(), body, { x: 300, y: 60, z: -150 }, 900, 0.4, true);
  assert.equal(open.left + open.right, 0);
});

test("its legs feel how fast they step: still, nothing; walking, both sides alike; turning, the outer side more; in the air, nothing", () => {
  const open = openTable(200);
  const body = new FlyBody(open, { x: 0, z: 0, yaw: 0 });
  const tracker = new SenseTracker();
  const step = (intent: Partial<Intent>) => {
    body.step({ ...createIntent(), live: true, ...intent }, { air: { x: 0, y: 0, z: 0 }, meal: null }, DT);
    return tracker.update(input(body, { world: open }));
  };
  const still = step({});
  assert.equal(still.legsLeft, 0);
  assert.equal(still.legsRight, 0);
  const walking = step({ walking: true, speed: 10 });
  assert.ok(Math.abs(walking.legsLeft! - 10 / LEGS_FULL_SPEED) < 0.01, `${walking.legsLeft}`);
  assert.equal(walking.legsLeft, walking.legsRight);
  // Toward its left: its right legs travel further.
  const turning = step({ walking: true, speed: 10, yawRate: 2 });
  assert.ok(turning.legsRight! > turning.legsLeft!);
  assert.equal(legMovement(0, 1, 1), FEET_SIDE / LEGS_FULL_SPEED);
  assert.equal(legMovement(-40, 0, -1), 1);
  body.position.y += 20;
  body.mode = "airborne";
  const aloft = tracker.update(input(body, { world: open }));
  assert.equal(aloft.legsLeft! + aloft.legsRight!, 0);
});

/** Walks `body` forward until it is pushing against what it faces (bounded). */
function walkInto(body: FlyBody) {
  const walk: Intent = { ...createIntent(), live: true, walking: true, speed: 10 };
  for (let t = 0; t < 3 && !body.blocked; t += DT) body.step(walk, { air: { x: 0, y: 0, z: 0 }, meal: null }, DT);
  assert.ok(body.blocked, "it walked into it");
}

test("standing at a wall, its forelegs hold its antennae off it; walking into the wall pushes them in", () => {
  const jam = SOLIDS.find((s) => s.name === "jam")!.footprint as { x: number; z: number; r: number };
  // Where a walk into the jar's side ends: its head at the glass, its forelegs' tarsi against it.
  const at = jam.x - jam.r - HEAD_AHEAD * FLY_LENGTH - 0.01;
  const standing = new FlyBody(world, { x: at, z: jam.z, yaw: Math.PI / 2 });
  const held = new SenseTracker().update(input(standing));
  assert.equal(held.bumpLeft + held.bumpRight, 0);
  // Walking into it straight on: both antennae.
  const square = new FlyBody(world, { x: at - 2, z: jam.z, yaw: Math.PI / 2 });
  walkInto(square);
  const pushed = new SenseTracker().update(input(square));
  assert.equal(pushed.bumpLeft, 1);
  assert.equal(pushed.bumpRight, 1);
  // Facing away from it, nothing.
  const away = new FlyBody(world, { x: at, z: jam.z, yaw: -Math.PI / 2 });
  const t = new SenseTracker().update(input(away));
  assert.equal(t.bumpLeft + t.bumpRight, 0);
});

test("standing still, it feels a stem between its forelegs on its antennae, and nothing past the table's edge", () => {
  // A stem 0.8 mm across, just ahead of its head: between its antennae's tips, short of its forelegs' tarsi.
  const ahead = (HEAD_AHEAD + ANTENNA_AHEAD) * FLY_LENGTH;
  const stem = new World({ floor: { kind: "circle", r: 100 }, solids: [{ name: "stem", footprint: { kind: "circle", x: 0, z: ahead, r: 0.4 }, top: { kind: "flat", y: 20 } }], patches: [], start: { x: 0, z: 0, yaw: 0 }, ceiling: 320 });
  const body = new FlyBody(stem, { x: 0, z: 0, yaw: 0 });
  const tracker = new SenseTracker();
  let s = tracker.update({ ...input(body), world: stem });
  for (let k = 0; k < 600; k++) s = tracker.update({ ...input(body), world: stem });
  assert.equal(s.bumpLeft, 1, "held as long as it touches");
  assert.equal(s.bumpRight, 1);
  // At the edge of a bare table, facing out: its antennae are over the drop, touching nothing.
  const table = openTable(50);
  const edge = new FlyBody(table, { x: 0, z: 50 - HEAD_AHEAD * FLY_LENGTH - 0.01, yaw: 0 });
  walkInto(edge);
  const out = new SenseTracker().update({ ...input(edge), world: table });
  assert.equal(out.bumpLeft + out.bumpRight, 0);
});

test("it tastes sugar with its feet and its mouth, only while on its feet", () => {
  const honey = PATCHES.find((p) => p.name === "honey")!;
  const body = new FlyBody(world, { x: honey.x, z: honey.z, yaw: 0 });
  const tracker = new SenseTracker();
  const s = tracker.update(input(body));
  assert.equal(s.sweet, 1);
  assert.equal(tracker.tasting.food?.name, "honey");
  body.mode = "airborne";
  assert.equal(tracker.update(input(body)).sweet, 0);
  // Mouth only: standing just short of it, facing it.
  const near = new FlyBody(world, { x: honey.x, z: honey.z - honey.r - 1.2, yaw: 0 });
  const m = new SenseTracker();
  assert.ok(m.update(input(near)).sweet > 0);
  assert.equal(m.tasting.byMouth, true);
});

test("facing up a fruit's curve, its mouth tastes what is on the fruit ahead of it", () => {
  // The windowsill's banana: the split near its stalk, with the fly a little down its side, its mouth on the juice.
  const sill = new World(WINDOWSILL);
  const pantry = new Pantry(sill, WINDOWSILL.patches);
  const banana = pantry.foods.find((f) => f.name === "banana")!;
  const yaw = Math.atan2(banana.x, banana.z);
  const back = MOUTH_AHEAD * FLY_LENGTH;
  const body = new FlyBody(sill, { x: banana.x - Math.sin(yaw) * back, z: banana.z - Math.cos(yaw) * back, yaw, y: banana.y + 0.5 });
  const mouth = body.point(MOUTH_AHEAD, 0, 0, { x: 0, y: 0, z: 0 });
  assert.ok(sill.heightAt(mouth.x, mouth.z, body.position.y + 0.5) > body.position.y + 0.05, "the banana rises under its mouth");
  const tracker = new SenseTracker();
  assert.equal(tracker.update(input(body, { world: sill, pantry })).sweet, banana.sweet);
  assert.equal(tracker.tasting.food, banana);
  assert.equal(tracker.tasting.byMouth, true);
});

test("it tastes water and bitterness as it tastes sugar: plain water as water, sugar as not, coffee's dregs as bitter", () => {
  const table = openTable(300);
  const pantry = new Pantry(table, [
    { name: "water", x: 0, z: 0, r: 3, sweet: 0, water: 1, pool: true },
    { name: "espresso", x: 100, z: 0, r: 3, sweet: 0.9, bitter: 1 },
  ]);
  const at = (x: number) => new SenseTracker().update({ ...input(new FlyBody(table, { x, z: 0, yaw: 0 })), world: table, pantry });
  assert.deepEqual([at(0).water, at(0).bitter, at(0).sweet], [1, 0, 0]);
  assert.deepEqual([at(100).water, at(100).bitter, at(100).sweet], [0, 1, 0.9]);
  assert.deepEqual([at(-100).water, at(-100).bitter], [0, 0]);
  // A dropped drop of water is water.
  const dropped = new Pantry(table);
  dropped.drop("water", 50, 50);
  assert.equal(new SenseTracker().update({ ...input(new FlyBody(table, { x: 50, z: 50, yaw: 0 })), world: table, pantry: dropped }).water, 1);
});

test("wind is its own speed through the air; touch lands where it does and eases out", () => {
  const body = new FlyBody(openTable(300), { x: 0, z: 0, yaw: 0 });
  const tracker = new SenseTracker();
  body.mode = "airborne";
  body.velocity.x = WIND_FULL_SPEED;
  let s = tracker.update(input(body));
  for (let i = 0; i < 30; i++) s = tracker.update(input(body));
  assert.ok(s.wind > 0.95);
  assert.equal(s.grounded, false);
  // Carried along with the air, it feels none.
  for (let i = 0; i < 60; i++) s = tracker.update(input(body, { air: { x: WIND_FULL_SPEED, y: 0, z: 0 } }));
  assert.ok(s.wind < 0.05);
  body.mode = "standing";
  body.velocity.x = 0;
  // Stroked on its back: its notum and wings feel it, its head doesn't, and nothing is felt everywhere at once.
  const contacts = new Contacts();
  contacts.add(body.position.x, body.position.y + FLY_HEIGHT, body.position.z, 1, 1);
  s = tracker.update(input(body, { contacts }));
  assert.equal(s.touchNotum, 1);
  assert.ok((s.touchWings ?? 0) > 0);
  assert.equal(s.touchFrontLeft, 0);
  assert.equal(s.touchEyeRight, 0);
  assert.equal(s.touch, 0);
  assert.equal(tracker.touched, 1);
  s = tracker.update(input(body));
  assert.ok((s.touchNotum ?? 0) < 1 && (s.touchNotum ?? 0) > 0.8);
  assert.ok(tracker.touched < 1 && tracker.touched > 0.8);
  for (let i = 0; i < 60; i++) s = tracker.update(input(body));
  assert.equal(s.touchNotum, 0);
  assert.equal(tracker.touched, 0);
});

test("bumping into something in flight is felt where it hits: flying into a wall ahead, on its face", () => {
  const body = new FlyBody(world, { x: 0, z: -150, yaw: 0 });
  body.mode = "airborne";
  const tracker = new SenseTracker();
  // It faces +z: the wall's way out is back toward -z.
  body.hitAgainst(HIT_FULL_SPEED, 0, 0, -1);
  const s = tracker.update(input(body));
  assert.equal(s.touchFrontLeft, 1);
  assert.equal(s.touchFrontRight, 1);
  assert.equal(s.touchNotum, 0);
  assert.equal(s.touchAbdomen, 0);
  assert.equal(tracker.touched, 1);
});

test("another fly pushing it is felt where it pushes", () => {
  const body = new FlyBody(openTable(300), { x: 0, z: 0, yaw: 0 });
  const tracker = new SenseTracker();
  // Against its left flank, at its middle's height (crowd.ts, Crowd.contact).
  const s = tracker.update(input(body, { pushed: { touch: CONTACT_TOUCH, contact: { x: 0.75, y: 0.75, z: -0.3 } } }));
  assert.ok((s.touchLegs ?? 0) > 0 || (s.touchAbdomen ?? 0) > 0);
  for (const part of ["touchEyeLeft", "touchEyeRight", "touchFrontLeft", "touchFrontRight", "touchNotum"] as const) assert.equal(s[part], 0, part);
  assert.equal(tracker.touched, CONTACT_TOUCH);
});

test("the strongest contacted intensity wins regardless of food order or taste site", () => {
  const world = openTable(30);
  const body = new FlyBody(world, { x: 0, z: 0, yaw: 0 });
  const mouth = body.point(MOUTH_AHEAD, 0, 0, { x: 0, y: 0, z: 0 });
  const pairs = [
    [{ sweet: 1, amount: 0.25 }, { sweet: 0.5, amount: 1 }],
    [{ sweet: 1, amount: 0.25 }, { sweet: 0.5, amount: 0.5 }],
    [{ sweet: 1, amount: 0.1 }, { sweet: 0.5, amount: 0.25 }],
    [{ sweet: 1, amount: 0.05 }, { sweet: 0.5, amount: 0.15 }],
  ];
  // Both foods at either site, then one at each site in both arrangements.
  for (const positions of [[-0.6, -0.6], [mouth.z, mouth.z], [-0.6, mouth.z], [mouth.z, -0.6]]) {
    for (const pair of pairs) {
      for (const order of [[0, 1], [1, 0]]) {
        const pantry = new Pantry(world);
        for (const i of order) {
          const food = pantry.add(`food ${i}`, 0, positions[i], 0.05, pair[i].sweet);
          food.amount = pair[i].amount;
        }
        const tracker = new SenseTracker();
        const felt = tracker.update(input(body, { world, pantry }));
        const expected = Math.max(...pair.map(f => f.sweet * Math.min(1, 4 * f.amount)));
        assert.equal(felt.sweet, expected, JSON.stringify({ positions, pair, order }));
      }
    }
  }
});

test("mouth food remains eligible when the feet taste something stronger", () => {
  const world = openTable(30);
  const body = new FlyBody(world, { x: 0, z: 0, yaw: 0 });
  const mouth = body.point(MOUTH_AHEAD, 0, 0, { x: 0, y: 0, z: 0 });
  const pantry = new Pantry(world);
  const feetFood = pantry.add("sugar", 0, -0.6, 0.05, 1);
  const tracker = new SenseTracker();
  assert.equal(tracker.update(input(body, { world, pantry })).sweet, 1);
  assert.equal(tracker.tasting.food, feetFood);
  assert.equal(tracker.tasting.byMouth, false);
  for (const sweet of [0.4, 0]) {
    const mouthFood = pantry.add("mouth food", mouth.x, mouth.z, 0.05, sweet);
    assert.equal(tracker.update(input(body, { world, pantry })).sweet, 1);
    assert.equal(tracker.tasting.food, mouthFood);
    assert.equal(tracker.tasting.byMouth, true);
    pantry.remove(mouthFood);
  }
  body.mode = "airborne";
  assert.equal(tracker.update(input(body, { world, pantry })).sweet, 0);
  assert.equal(tracker.tasting.food, null);
  assert.equal(tracker.tasting.byMouth, false);
});

test("each antenna feels the air's temperature at its tip: 25 °C on a plain table, more on the side nearer a warm spot", () => {
  const table = openTable(100);
  const body = new FlyBody(table, { x: 0, z: 0, yaw: 0 });
  const tracker = new SenseTracker();
  const plain = tracker.update(input(body, { world: table, pantry: new Pantry(table, []) }));
  assert.equal(plain.temperatureLeft, 25);
  assert.equal(plain.temperatureRight, 25);
  // Facing +z, its left is +x: a warm spot off to its left.
  table.temperature.spots.push({ x: 3, y: 0, z: 1, radius: 2, delta: 6 });
  const s = tracker.update(input(body, { world: table, pantry: new Pantry(table, []) }));
  assert.ok(s.temperatureLeft! > s.temperatureRight! + 0.1, `left ${s.temperatureLeft}, right ${s.temperatureRight}`);
  assert.ok(s.temperatureRight! > 25);
  const tip = body.point(HEAD_AHEAD + ANTENNA_AHEAD, 0.3, 0.12, { x: 0, y: 0, z: 0 });
  assert.equal(s.temperatureLeft, table.temperature.at(tip.x, tip.y, tip.z));
});
