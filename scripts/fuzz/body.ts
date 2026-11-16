import assert from "node:assert/strict";
import { mulberry32 } from "@fly/brain";
import { BODY_REACH, FEET_REACH, FLY_HEIGHT, FlyBody, MAX_SLOPE_COS, STEP_UP, createIntent } from "@fly/body";
import type { Forces } from "@fly/body";
import { BAR, LAB, PICNIC, RESTAURANT, WINDOWSILL, World, createSurface } from "@fly/world";
import type { Place, Vec3 } from "@fly/world";

export const places = { picnic: PICNIC, windowsill: WINDOWSILL, lab: LAB, bar: BAR, restaurant: RESTAURANT };
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

/** How high the middle of its head, thorax and abdomen are over its feet, in body lengths. */
const BODY_MIDDLE = 0.32;
/** How far (mm) a point it reaches may be inside something. */
export const REACH_SLOP = 0.02;
const offset = { x: 0, y: 0, z: 0 };
const middle = { x: 0, y: 0, z: 0 };
const point = { x: 0, y: 0, z: 0 };

/** How deep (mm) the way from `from` to `to`, both at the height `y`, has gone into something: 0 if `to` is in nothing. */
function depthInside(world: World, from: Vec3, to: Vec3, y: number) {
  if (world.solidAt(to.x, y, to.z) < 0) return 0;
  let a = 0;
  let b = 1;
  for (let i = 0; i < 24; i++) {
    const m = (a + b) / 2;
    if (world.solidAt(from.x + (to.x - from.x) * m, y, from.z + (to.z - from.z) * m) >= 0) b = m;
    else a = m;
  }
  return Math.hypot(to.x - from.x, to.z - from.z) * (1 - a);
}

/**
 * Its head, thorax and abdomen, and on its feet its legs, are never inside
 * anything: through a wall or a pane, or sunk into a slope too steep to
 * stand on. They are where the world feels them, level with its heading
 * (the drawn fly is tilted to what it stands on, so on a slope they lie
 * along it). On its feet it may stand at a slope it could walk up, and what
 * rises less than a step is what it steps up onto: only a wall, or a slope
 * too steep for it, past a step over its feet counts. In the air, anything
 * at all does.
 */
export function checkReach(body: FlyBody, world: World) {
  const p = body.position;
  if (!body.onFeet) {
    body.point(0, BODY_MIDDLE, 0, middle);
    for (let k = 0; k < BODY_REACH.length; k += 2) {
      body.point(BODY_REACH[k], BODY_MIDDLE, BODY_REACH[k + 1], point);
      const depth = depthInside(world, middle, point, point.y);
      if (depth > REACH_SLOP) assert.fail(`body ${k / 2} inside ${world.solids[world.solidAt(point.x, point.y, point.z)]?.name} by ${depth.toFixed(3)} mm`);
    }
    return;
  }
  offset.x = p.x;
  offset.y = p.y + STEP_UP + 1e-6;
  offset.z = p.z;
  let foot = "";
  sides.length = 0;
  for (let k = 0; k < BODY_REACH.length + FEET_REACH.length; k += 2) {
    const feet = k >= BODY_REACH.length;
    const reach = feet ? FEET_REACH : BODY_REACH;
    const j = feet ? k - BODY_REACH.length : k;
    body.point(reach[j], 0, reach[j + 1], point);
    const length = Math.hypot(point.x - p.x, point.z - p.z);
    // A little past it, for what it is up against.
    const ray = world.raycast(offset, { x: (point.x - p.x) / length, y: 0, z: (point.z - p.z) / length }, hit, length + 0.05);
    if (!ray || ray.normal.y >= MAX_SLOPE_COS) continue;
    const level = Math.hypot(ray.normal.x, ray.normal.z);
    sides.push(ray.normal.x / level, ray.normal.z / level);
    if (length - ray.t <= REACH_SLOP) continue;
    const what = `${feet ? "foot" : "body"} ${j / 2} into ${world.solids[ray.solid]?.name} by ${(length - ray.t).toFixed(3)} mm`;
    if (!feet) assert.fail(what);
    foot ||= what;
  }
  // Its legs only where it stands between things facing each other, against both, closer than its legs reach: it can't stand clear of them.
  if (!foot) return;
  for (let a = 0; a < sides.length; a += 2) for (let b = a + 2; b < sides.length; b += 2) if (sides[a] * sides[b] + sides[a + 1] * sides[b + 1] < -0.5) return;
  assert.fail(foot);
}
const sides: number[] = [];

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
      checkReach(body, world);
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
