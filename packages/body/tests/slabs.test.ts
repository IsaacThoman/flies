// The body among slabs: walking under a table and into what is too low to
// pass under, taking off beneath one, landing on its top, falling past its
// edge, and what its antennae and feet feel there.

import assert from "node:assert/strict";
import { test } from "node:test";
import { Pantry, RESTAURANT, World } from "@fly/world";
import { DINER } from "../../world/tests/diner.ts";
import { FLY_HEIGHT, FlyBody, HEAD_AHEAD, FLY_LENGTH, SenseTracker, createIntent } from "../src/index.ts";
import type { Forces, Intent } from "../src/index.ts";

const DT = 1 / 60;
const still: Forces = { air: { x: 0, y: 0, z: 0 }, threat: null, meal: null };
const intent = (i: Partial<Intent> = {}): Intent => ({ ...createIntent(), live: true, ...i });
const world = new World(DINER);
const index = (name: string) => DINER.solids.findIndex((s) => s.name === name);
/** The table top's underside and top, and its half-sizes. */
const TABLE = { bottom: 72, top: 76, hx: 100, hz: 60 };
const underTable = (x: number, z: number) => Math.abs(x) < TABLE.hx && Math.abs(z) < TABLE.hz;

function airborne(x: number, y: number, z: number, v = { x: 0, y: 0, z: 0 }, yaw = 0) {
  const body = new FlyBody(world, { x, z, yaw, y });
  Object.assign(body.position, { x, y, z });
  Object.assign(body.velocity, v);
  body.mode = "airborne";
  return body;
}

test("it starts and is put down on the surface at or below the height it is given: the highest, if none", () => {
  assert.equal(new FlyBody(world, { x: -50, z: 0, yaw: 0, y: 10 }).position.y, 0);
  assert.equal(new FlyBody(world, { x: -50, z: 0, yaw: 0, y: 80 }).position.y, TABLE.top);
  const body = new FlyBody(world, { x: -50, z: 0, yaw: 0 });
  assert.equal(body.position.y, 320, "on the ceiling's top: the highest there is");
  body.place(20, 0, 0, 100);
  assert.equal(body.position.y, 77);
  assert.equal(body.surface.solid, index("plate"));
  body.place(20, 0, 0, 50);
  assert.equal(body.position.y, 0);
  assert.equal(body.surface.underside, TABLE.bottom);
});

test("on the floor it walks under a table as if it weren't there, and stays on the floor", () => {
  const body = new FlyBody(world, { x: -50, z: -100, yaw: 0, y: 0 });
  for (let t = 0; t < 14; t += DT) {
    body.step(intent({ speed: 10, walking: true }), still, DT);
    assert.equal(body.position.y, 0);
    assert.equal(body.blocked, false);
  }
  assert.ok(body.position.z > 35, `walked to ${body.position.z}`);
  assert.equal(body.mode, "walking");
  assert.equal(body.surface.solid, -1);
});

test("an underside lower than its body is a wall it walks into; one just high enough it walks under", () => {
  const low = new FlyBody(world, { x: -100, z: 195, yaw: 0, y: 0 });
  for (let t = 0; t < 1.8; t += DT) low.step(intent({ speed: 10, walking: true }), still, DT);
  assert.ok(low.position.z + HEAD_AHEAD * FLY_LENGTH < 210 + 0.5, `its head went under, to ${low.position.z}`);
  assert.equal(low.position.y, 0);
  assert.equal(low.blocked, true, "its head at a wall");
  const high = new FlyBody(world, { x: 100, z: 190, yaw: 0, y: 0 });
  for (let t = 0; t < 6; t += DT) high.step(intent({ speed: 10, walking: true }), still, DT);
  assert.ok(high.position.z > 240, `stopped at ${high.position.z}`);
  assert.equal(world.underside(100, 220, 0) - 0, FLY_HEIGHT, "the room it needs, exactly");
});

test("taking off under a table, it bumps its underside and comes back down, never onto its top", () => {
  const body = new FlyBody(world, { x: -50, z: 0, yaw: Math.PI / 2, y: 0 });
  body.step(intent({ takeOff: 1, wings: 0.9 }), still, DT);
  let bumped = false;
  for (let t = 0; t < 3; t += DT) {
    body.step(intent({ wings: t < 0.3 ? 0.9 : 0 }), still, DT);
    const p = body.position;
    if (underTable(p.x, p.z)) {
      assert.ok(p.y <= TABLE.bottom - FLY_HEIGHT + 1e-9 || p.y >= TABLE.top, `its body in the table top at ${p.y}`);
      bumped ||= body.events.hit > 0 && body.velocity.y < 0;
    }
  }
  assert.ok(bumped, "it hit the underside");
  assert.equal(body.mode, "standing");
  assert.equal(body.position.y, 0, "back on the floor");
});

test("it lands on a slab's top it comes down onto from above, and on what rests on it", () => {
  const table = airborne(-50, 150, 0);
  for (let t = 0; t < 2 && table.mode === "airborne"; t += DT) table.step(intent(), still, DT);
  assert.equal(table.position.y, TABLE.top);
  assert.equal(table.surface.solid, index("table"));
  const plate = airborne(20, 150, 0);
  for (let t = 0; t < 2 && plate.mode === "airborne"; t += DT) plate.step(intent(), still, DT);
  assert.equal(plate.position.y, 77);
  assert.equal(plate.surface.solid, index("plate"));
});

test("it falls past a slab it is beside, comes down onto a table top it rose above from beside it, and under one it stays below", () => {
  const past = airborne(-105, 150, 50);
  for (let t = 0; t < 2 && past.mode === "airborne"; t += DT) past.step(intent(), still, DT);
  assert.equal(past.position.y, 0, "past the table's edge to the floor");
  const onto = airborne(-112, 60, 30, { x: 400, y: 900, z: 0 }, Math.PI / 2);
  for (let t = 0; t < 2 && onto.mode === "airborne"; t += DT) onto.step(intent(), still, DT);
  assert.equal(onto.position.y, TABLE.top, `came down at ${onto.position.x}`);
  assert.ok(underTable(onto.position.x, onto.position.z));
  const under = airborne(-112, 60, 30, { x: 500, y: 700, z: 0 }, Math.PI / 2);
  for (let t = 0; t < 2 && under.mode === "airborne"; t += DT) {
    under.step(intent(), still, DT);
    if (underTable(under.position.x, under.position.z)) assert.ok(under.position.y <= TABLE.bottom - FLY_HEIGHT + 1e-9);
  }
  assert.equal(under.position.y, 0);
  assert.ok(underTable(under.position.x, under.position.z));
});

test("walking off a table's edge, it falls onto the chair seat pushed in under it", () => {
  const body = new FlyBody(world, { x: -90, z: 0, yaw: -Math.PI / 2, y: 80 });
  let fell = false;
  for (let t = 0; t < 3; t += DT) {
    body.step(intent({ speed: 10, walking: true }), still, DT);
    fell ||= body.mode === "airborne";
    if (fell && body.mode !== "airborne") break;
  }
  assert.ok(fell);
  assert.equal(body.surface.solid, index("seat"));
  assert.ok(body.position.y > 44 && body.position.y < 48);
});

test("under a table its antennae feel a leg they walk into, not the table top over them; in the air, the table top's edge", () => {
  const senses = new SenseTracker();
  const pantry = new Pantry(world, []);
  const feel = (body: FlyBody) => senses.update({ dt: DT, body, world, pantry, looming: [], stroke: 0, air: still.air, eyesOpen: false, proboscis: 0 });
  const open = new FlyBody(world, { x: -50, z: 0, yaw: 0, y: 0 });
  assert.equal(feel(open).bumpLeft + feel(open).bumpRight, 0);
  const leg = new FlyBody(world, { x: -90 - 4 - HEAD_AHEAD * FLY_LENGTH - 2, z: -50, yaw: Math.PI / 2, y: 0 });
  for (let t = 0; t < 3 && !leg.blocked; t += DT) leg.step(intent({ speed: 10, walking: true }), still, DT);
  const touched = feel(leg);
  assert.ok(touched.bumpLeft > 0 && touched.bumpRight > 0);
  const edge = airborne(-100 - HEAD_AHEAD * FLY_LENGTH - 0.2, 73, 0, { x: 0, y: 0, z: 0 }, Math.PI / 2);
  assert.ok(feel(edge).bumpLeft > 0);
});

test("on a plate on the table it tastes what is on the plate, and under the table what is on the floor", () => {
  const pantry = new Pantry(world, DINER.patches);
  assert.equal(pantry.touching(20, 77, 0, 0.3)?.name, "jam");
  assert.equal(pantry.touching(20, 0, 0, 0.3)?.name, "grape");
});

test("falling onto the steep outside of the bar's fruit bowl, it slides off rather than hanging there", () => {
  // Found by the body fuzzer (restaurant, seed 1): its feet went through the bowl into the zinc under it.
  const bar = new World(RESTAURANT);
  const body = new FlyBody(bar, { x: 0, z: 0, yaw: 0 });
  Object.assign(body.position, { x: -2755.9631982656233, y: 1244.8679240168035, z: 905.2906803769513 });
  Object.assign(body.velocity, { x: -31.197250384928488, y: -528.6359579982164, z: 397.6329729124999 });
  body.yaw = -0.6442752531438045;
  body.mode = "airborne";
  for (let t = 0; t < 20 && body.mode === "airborne"; t += DT) body.step(intent(), still, DT);
  assert.equal(body.onFeet, true);
  assert.ok(bar.underside(body.position.x, body.position.z, body.position.y) >= body.position.y + FLY_HEIGHT);
});

test("taking off from under something it barely fits beneath, it slides out along the underside rather than stopping dead", () => {
  // Found by the body fuzzer (the diner, seed 1): every launch from under the high rail went nowhere.
  const body = new FlyBody(world, { x: 123, z: 227, yaw: 0, y: 0 });
  body.step(intent({ takeOff: 1 }), still, DT);
  for (let t = 0; t < 0.5 && body.position.z < 231; t += DT) {
    assert.ok(world.underside(body.position.x, body.position.z, body.position.y) >= body.position.y + FLY_HEIGHT - 1e-9);
    body.step(intent({ wings: 0.8 }), still, DT);
  }
  assert.ok(body.position.z > 230, `still under the rail at ${body.position.z}`);
});

test("beyond the floor on the pass's shelf, drawn back toward the room against the plates stacked there, it slides round them", () => {
  // Found by the body fuzzer (restaurant, seed 4, high starts): held behind the stack, inside the wall's thickness.
  const bar = new World(RESTAURANT);
  const body = new FlyBody(bar, { x: 0, z: 0, yaw: 0 });
  Object.assign(body.position, { x: 2063.836918377752, y: 1130, z: -3094.0348167647403 });
  Object.assign(body.velocity, { x: 91.85827166460899, y: 0, z: -3.8746351082156405 });
  body.yaw = 0.3678361286124522;
  body.mode = "airborne";
  for (let t = 0; t < 20 && body.mode === "airborne"; t += DT) body.step(intent(), still, DT);
  assert.equal(body.onFeet, true);
  assert.ok(bar.onTable(body.position.x, body.position.z));
});
