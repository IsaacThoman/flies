import assert from "node:assert/strict";
import { mulberry32 } from "@fly/brain";
import { FLY_HEIGHT, FlyBody, MAX_SLOPE_COS, createIntent } from "@fly/body";
import type { Forces } from "@fly/body";
import { GREENHOUSE, BAR, LAB, PICNIC, RESTAURANT, WINDOWSILL, World, createSurface } from "@fly/world";
import type { Place, Vec3 } from "@fly/world";

export const places = { greenhouse: GREENHOUSE, picnic: PICNIC, windowsill: WINDOWSILL, lab: LAB, bar: BAR, restaurant: RESTAURANT };
export type PlaceId = keyof typeof places;
export const CEILING_EXCURSION = 400;
export const still: Forces = { air: { x: 0, y: 0, z: 0 }, threat: null, meal: null };
const surface = createSurface();
const inward = { x: 0, y: 0, z: 0 };
const hit = { point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 0 }, solid: -1, t: 0 };

export function checkBody(body: FlyBody, world: World) {
  for (const [name, value] of Object.entries({ position: body.position, velocity: body.velocity, up: body.up, normal: body.surface.normal })) {
    for (const n of Object.values(value)) assert.ok(Number.isFinite(n), `${name} is not finite`);
  }
  for (const n of [body.yaw, body.groundSpeed, body.turnRate, body.events.hit, body.surface.y]) assert.ok(Number.isFinite(n), "body scalar is not finite");
  const p = body.position;
  // Its feet out of everything, and room for its body over them.
  const room = world.underside(p.x, p.z, p.y) - p.y;
  if (!(room >= FLY_HEIGHT - 1e-6)) assert.fail(`inside ${world.solids[world.solidAt(p.x, p.y + Math.max(0, room) + 1e-3, p.z)]?.name ?? "a solid"}: y=${p.y}, room=${room}`);
  // On its feet, it stands on the surface under them.
  const under = world.surface(p.x, p.z, surface, p.y);
  if (body.onFeet) {
    assert.ok(under.onTable, "standing beyond the floor");
    assert.ok(under.normal.y >= MAX_SLOPE_COS - 1e-9, "standing on a steep slope");
    assert.ok(Math.abs(p.y - under.y) < 1e-6, "feet off surface");
    assert.equal(body.surface.solid, under.solid, "stale standing surface");
  }
  // The spring can overshoot the boundary under sustained thrust or a gust.
  assert.ok(world.beyond(p.x, p.z, inward) < 250, "escaped the floor's restoring force");
  assert.ok(p.y < world.place.ceiling + CEILING_EXCURSION, "escaped the ceiling's restoring force");
  if (body.events.landed && !body.events.tookOff) assert.ok(body.onFeet, "landing did not put it on its feet");
}

export function checkWalkSweep(before: Vec3, body: FlyBody, world: World, wasOnFeet: boolean) {
  if (!wasOnFeet || !body.onFeet) return;
  const dx = body.position.x - before.x;
  const dz = body.position.z - before.z;
  const length = Math.hypot(dx, dz);
  // Sliding around a corner makes a bent path: its chord is not a sweep.
  if (length < 1e-6 || Math.abs(dx * Math.cos(body.yaw) - dz * Math.sin(body.yaw)) > 1e-6) return;
  const ray = world.raycast({ x: before.x, y: Math.max(before.y, body.position.y) + 0.901, z: before.z }, { x: dx / length, y: 0, z: dz / length }, hit);
  assert.ok(!ray || ray.normal.y > 1e-6 || ray.t >= length - 1e-6, `walk tunneled through ${world.solids[hit.solid]?.name}`);
}

export function snapshot(body: FlyBody) {
  return { position: { ...body.position }, velocity: { ...body.velocity }, yaw: body.yaw, mode: body.mode };
}

function clone(body: FlyBody, world: World) {
  const copy = new FlyBody(world, { ...body.position, yaw: body.yaw });
  Object.assign(copy.position, body.position);
  Object.assign(copy.velocity, body.velocity);
  copy.mode = body.mode;
  return copy;
}

/** Recovery is a counterfactual physical probe, never a command to the live brain. */
export function checkRecovery(body: FlyBody, world: World) {
  const landed = clone(body, world);
  for (let i = 0; i < 1200 && !landed.onFeet; i++) {
    landed.step(createIntent(), still, 1 / 60);
    checkBody(landed, world);
  }
  assert.ok(landed.onFeet, "wings stopped but no landing within 20s");
  let canWalk = false;
  for (let direction = 0; direction < 8; direction++) {
    const probe = clone(landed, world);
    probe.yaw = direction * Math.PI / 4;
    const start = { ...probe.position };
    const intent = { ...createIntent(), live: true, speed: 16, walking: true };
    for (let i = 0; i < 180; i++) {
      probe.step(intent, still, 1 / 60);
      checkBody(probe, world);
      if (Math.hypot(probe.position.x - start.x, probe.position.z - start.z) > 3) { canWalk = true; break; }
    }
    if (canWalk) break;
  }
  // Under something lower than a jump over its body, it can only walk out.
  let canJump = world.underside(landed.position.x, landed.position.z, landed.position.y) < landed.position.y + FLY_HEIGHT + 2;
  for (let direction = 0; direction < 8 && !canJump; direction++) {
    const jump = clone(landed, world);
    jump.yaw = direction * Math.PI / 4;
    const startY = jump.position.y;
    jump.step({ ...createIntent(), takeOff: 1 }, still, 1 / 60);
    canJump ||= jump.position.y > startY + 2;
    for (let i = 0; i < 120; i++) {
      jump.step(createIntent(), still, 1 / 60);
      checkBody(jump, world);
      canJump ||= jump.position.y > startY + 2;
    }
  }
  assert.ok(canJump, "take-off cannot escape reached surface in eight directions");
  assert.ok(canWalk, "no walking escape in eight directions within 3s");
}

/**
 * A standable surface inside the floor, below the flight ceiling (or the
 * high-start limit), with room over it for the fly. Where surfaces lie one
 * above another (a place with slabs), a height is drawn too, and the start is
 * the surface at or below it; elsewhere the draws are as they always were.
 */
export function randomStart(world: World, random: () => number, highStarts = false) {
  const f = world.floor;
  const limit = world.place.ceiling + (highStarts ? CEILING_EXCURSION : 0);
  const layered = world.solids.some(s => (s.bottom ?? 0) > 0);
  for (let i = 0; i < 10000; i++) {
    const x = (random() * 2 - 1) * (f.kind === "circle" ? f.r : f.hx);
    const z = (random() * 2 - 1) * (f.kind === "circle" ? f.r : f.hz);
    const s = world.surface(x, z, createSurface(), layered ? random() * limit : Infinity);
    if (s.onTable && s.normal.y >= MAX_SLOPE_COS && s.y <= limit && s.underside >= s.y + FLY_HEIGHT) return { x, z, yaw: random() * Math.PI * 2, y: s.y };
  }
  throw new Error("could not sample a standable start");
}

/** Fuzzes the body in one of the places, or in `place` (a test's own) under that name. */
export function fuzzBody(id: string, seed: number, duration: number, highStarts = false, place: Place = places[id as PlaceId]) {
  const random = mulberry32(seed);
  const world = new World(place);
  const body = new FlyBody(world, randomStart(world, random, highStarts));
  let intent = createIntent();
  const forces: Forces = { air: { x: 0, y: 0, z: 0 }, threat: null, meal: null };
  let nextIntent = 0;
  let nextStart = 0;
  let nextProbe = 0;
  let steps = 0;
  let probes = 0;
  let starts = 0;
  for (let time = 0; time < duration; ) {
    if (time >= nextStart) {
      const start = starts++ === 0 ? world.place.start : randomStart(world, random, highStarts);
      body.place(start.x, start.z, start.yaw, start.y);
      nextStart = time + 60;
    }
    if (time >= nextIntent) {
      intent = { ...createIntent(), live: true, speed: random() < 0.3 ? 0 : (random() * 2 - 0.65) * 16, yawRate: random() < 0.3 ? 0 : (random() * 2 - 1) * 3, airYawRate: (random() * 2 - 1) * 5, wings: random() < 0.4 ? 0 : random(), takeOff: random() < 0.16 ? random() : null, feeding: random() < 0.2, feed: random() };
      forces.air = { x: (random() * 2 - 1) * 600, y: (random() * 2 - 1) * 60, z: (random() * 2 - 1) * 600 };
      forces.meal = intent.feeding ? { id: 0, kind: "honey", name: "fuzz meal", ...body.position, x: body.position.x + random() * 3, r: 1.6, sweet: 1, amount: 1, pool: false } : null;
      nextIntent = time + 0.05 + random() * 5;
    }
    const dt = Math.min(duration - time, random() < 0.025 ? 0.2 + random() * 1.8 : random() < 0.05 ? 0.00001 : 1 / (20 + random() * 120));
    const before = snapshot(body);
    try {
      body.step(intent, forces, dt);
      checkBody(body, world);
      if (body.yaw === before.yaw) checkWalkSweep(before.position, body, world, before.mode !== "airborne");
      if (time >= nextProbe) {
        checkRecovery(body, world);
        nextProbe = time + 30;
        probes++;
      }
    } catch (error) {
      throw new Error(`${id} seed=${seed} step=${steps} time=${time}\nReplay: npm run fuzz -- --kind body --place ${id} --seeds ${seed} --duration ${Math.ceil(time + dt)}${highStarts ? " --high-starts" : ""}\nSingle-step checkpoint: ${JSON.stringify({ before, intent, forces, dt, after: snapshot(body) })}`, { cause: error });
    }
    // A take-off is an edge, rather than another launch on every subframe.
    intent.takeOff = null;
    time += dt;
    steps++;
  }
  return { kind: "body", place: id, seed, highStarts, seconds: duration, steps, starts, probes };
}
