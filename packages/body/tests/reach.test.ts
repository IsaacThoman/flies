// What the fly's body reaches beyond its feet, its head and abdomen and its
// legs, kept out of walls, panes and slabs: flying at them, landing by them,
// turning beside them and walking into them. Before, only the column over its
// feet kept out of things, so a fly flying at a window had its head and
// thorax through the glass (the body fuzzer's checkReach, which these use,
// found it).

import assert from "node:assert/strict";
import { test } from "node:test";
import { RESTAURANT, WINDOW, WINDOWSILL, World, createPicnic, SOLIDS } from "@fly/world";
import type { Place, Solid } from "@fly/world";
import { DINER } from "../../world/tests/diner.ts";
import { checkBody, checkReach } from "../../../scripts/fuzz/body.ts";
import { FlyBody, WALL_PATIENCE, createIntent } from "../src/index.ts";
import type { Forces, Intent } from "../src/index.ts";

const DT = 1 / 60;
const still: Forces = { air: { x: 0, y: 0, z: 0 }, threat: null, meal: null };
const intent = (i: Partial<Intent> = {}): Intent => ({ ...createIntent(), live: true, ...i });
const box = (x: number, z: number, hx: number, hz: number) => ({ kind: "box", x, z, hx, hz, angle: 0 }) as const;
const room = (solids: Solid[]): Place => ({ floor: { kind: "rect", hx: 100, hz: 100 }, solids, patches: [], start: { x: 0, z: 0, yaw: 0 }, ceiling: 200 });

function airborne(world: World, x: number, y: number, z: number, yaw: number, v = { x: 0, y: 0, z: 0 }) {
  const body = new FlyBody(world, { x, z, yaw });
  Object.assign(body.position, { x, y, z });
  Object.assign(body.velocity, v);
  body.mode = "airborne";
  return body;
}

/** Steps it, holding it to everything the fuzzer holds it to after every step; how often it hit something. */
function run(body: FlyBody, world: World, i: Intent, seconds: number, forces: Forces = still) {
  let hits = 0;
  for (let t = 0; t < seconds; t += DT) {
    body.step(i, forces, DT);
    checkBody(body, world);
    checkReach(body, world);
    if (body.events.hit > 0) hits++;
  }
  return hits;
}

test("flying at the windowsill's pane at full drive, with a gust behind it, its head stays out of the glass and it bounces off", () => {
  const world = new World(WINDOWSILL);
  // Facing the glass (at z = -125), in the air over the sill, a few millimetres out.
  const body = airborne(world, -80, 120, -118, Math.PI, { x: 0, y: 0, z: -400 });
  const gust: Forces = { ...still, air: { x: 0, y: 0, z: -600 } };
  const hits = run(body, world, intent({ wings: 1 }), 3, gust);
  assert.ok(hits > 0, "it hit the glass");
  const head = body.point(0.5, 0.32, 0, { x: 0, y: 0, z: 0 });
  assert.ok(head.z > WINDOW.glass, "its head on the room's side");
});

test("flying into the corner of the windowsill's pane and a mullion, it is kept out of both", () => {
  const world = new World(WINDOWSILL);
  const mullion = WINDOWSILL.solids.find((s) => s.name === "mullion")!.footprint as { x: number; hx: number };
  // Just off the mullion's side and the glass, heading into the corner between them: the fuzzer's first find.
  const body = airborne(world, mullion.x - mullion.hx - 0.8, 200, WINDOW.glass + 0.8, Math.atan2(0.6, -0.8));
  run(body, world, intent({ wings: 0.6 }), 2, { ...still, air: { x: 300, y: 0, z: -400 } });
});

test("at the restaurant's shop front and walls, a fly blown at them at speed stays out of the glass, the mullions and the plaster", () => {
  const world = new World(RESTAURANT);
  // Each a few millimetres in front of its face, facing it, over the window's ledge and the banquette's back:
  // the glass (at z = 3000), a mullion standing in front of it (its face at z = 2940) and the room's side wall (at x = 4200).
  const at: [string, number, number, number, number][] = [["glass", 600, 2996, 0, 1], ["mullion", 300, 2936, 0, 1], ["wall", 4196, 0, 1, 0]];
  for (const [name, x, z, dx, dz] of at) {
    const body = airborne(world, x, 1500, z, Math.atan2(dx, dz));
    const hits = run(body, world, intent({ wings: 1 }), 2, { ...still, air: { x: dx * 600, y: 0, z: dz * 600 } });
    assert.ok(hits > 0, `it hit the ${name}`);
  }
});

test("a pane thinner than its head, flown at fast from any heading, never has its head through it or in it", () => {
  // A card 0.3 mm thick standing across the room and past where it can fly, too high to go over: thinner than the fly is long, and than a frame's flight.
  const world = new World(room([{ name: "card", footprint: box(0, 0, 400, 0.15), top: { kind: "flat", y: 1000 } }]));
  for (let k = 0; k <= 12; k++) {
    // Heading into it (+z), square on or slanting up to about 70°, the air carrying it there too.
    const yaw = ((k - 6) / 6) * 1.2;
    const body = airborne(world, -20 + k * 4, 40, -6, yaw, { x: Math.sin(yaw) * 300, y: 0, z: Math.cos(yaw) * 300 });
    const hits = run(body, world, intent({ wings: 1 }), 1.5, { ...still, air: { x: 0, y: 0, z: 600 } });
    assert.ok(hits > 0);
    for (const ahead of [0.5, -0.5]) assert.ok(body.point(ahead, 0.32, 0, { x: 0, y: 0, z: 0 }).z < -0.15, "on its own side");
  }
});

test("turning on the spot beside a wall, its legs and head swing clear of it rather than through it", () => {
  const world = createPicnic();
  const jam = SOLIDS.find((s) => s.name === "jam")!.footprint as { x: number; z: number; r: number };
  // Standing beside the jar, side on to it and closer than its legs reach.
  const body = new FlyBody(world, { x: jam.x - jam.r - 0.4, z: jam.z, yaw: 0 });
  run(body, world, intent({ yawRate: 3 }), 3);
  assert.ok(body.onFeet);
  assert.ok(Math.hypot(body.position.x - jam.x, body.position.z - jam.z) > jam.r + 1.25, "as far out as its head and legs reach");
});

test("walking into a wall head on it stops with its front feet at it, and still turns away after a while", () => {
  const world = createPicnic();
  const jam = SOLIDS.find((s) => s.name === "jam")!.footprint as { x: number; z: number; r: number };
  const body = new FlyBody(world, { x: jam.x - jam.r - 5, z: jam.z, yaw: Math.PI / 2 });
  run(body, world, intent({ speed: 10, walking: true }), 1.5);
  assert.equal(body.blocked, true);
  assert.equal(body.mode, "standing", "pressed against it, not walking on the spot");
  const yaw = body.yaw;
  run(body, world, intent({ speed: 10, walking: true }), WALL_PATIENCE + 1.5);
  assert.ok(Math.abs(body.yaw - yaw) > 1, "turned away");
});

test("landing by a wall, facing it, it comes down with its head and legs out of the wall", () => {
  const world = new World(WINDOWSILL);
  const jar = WINDOWSILL.solids.find((s) => s.name === "honey jar")!.footprint as { x: number; z: number; r: number };
  // Just off the jar's side, facing into it, coming down.
  const body = airborne(world, jar.x, 6, jar.z + jar.r + 0.3, Math.PI, { x: 0, y: -100, z: -20 });
  run(body, world, intent(), 1);
  assert.ok(body.onFeet);
  assert.ok(Math.hypot(body.position.x - jar.x, body.position.z - jar.z) > jar.r + 1.2);
});

test("landed between two things closer than its legs reach, its body is kept out of both, its legs left between them, and it can fly off", () => {
  // 2.55 mm apart: its body, 2.5 mm long, fits, its legs (2.65 mm across, 3.3 mm long) don't, however it turns.
  const world = new World(room([
    { name: "left", footprint: box(-10, 0, 8.725, 5), top: { kind: "flat", y: 20 } },
    { name: "right", footprint: box(10, 0, 8.725, 5), top: { kind: "flat", y: 20 } },
  ]));
  const body = airborne(world, 0, 10, 0, Math.PI / 2);
  run(body, world, intent(), 1);
  assert.ok(body.onFeet);
  for (const ahead of [0.5, -0.5]) assert.ok(Math.abs(body.point(ahead, 0.32, 0, { x: 0, y: 0, z: 0 }).x) <= 1.275 + 1e-6, "its body between them");
  body.step(intent({ takeOff: 1 }), still, DT);
  run(body, world, intent({ wings: 1 }), 0.5);
  assert.ok(body.position.y > 20, "out over them");
});

test("flying beside a table top at the height of its body, its head stays out of the table's edge; under it nothing changes", () => {
  const world = new World(DINER);
  // Level with the table's edge (72 to 76 mm, at x = 100), facing it, its head a little short of it; and under its middle.
  const beside = airborne(world, 101.4, 72.5, 0, -Math.PI / 2, { x: -30, y: 0, z: 0 });
  run(beside, world, intent({ wings: 0.62 }), 1);
  const under = airborne(world, 0, 30, 0, 0);
  const before = { ...under.position };
  under.step(intent({ wings: 0.6 }), still, DT);
  const plain = airborne(new World({ ...DINER, solids: [] }), 0, 30, 0, 0);
  plain.step(intent({ wings: 0.6 }), still, DT);
  assert.deepEqual(under.position, plain.position, "as if the table weren't there");
  assert.notDeepEqual(under.position, before);
});
