// What the camera tests look at: a stand-in fly, where things land in the
// picture, and whether the picture's near edge cuts into anything.

import * as THREE from "three";
import { FLY_LENGTH } from "@fly/body";
import type { FlyBody } from "@fly/body";
import { solidBottom, topPeak } from "@fly/world";
import type { Solid, World } from "@fly/world";
import type { CameraDirector } from "../src/camera.ts";

/** A stand-in body the test moves by hand: only what the camera reads. */
export function fakeBody(world: World, x: number, z: number, yaw: number, y?: number) {
  return { position: { x, y: world.heightAt(x, z, y), z }, velocity: { x: 0, y: 0, z: 0 }, yaw, mode: "standing" } as unknown as FlyBody & { mode: string };
}

/** The fly's middle, which the camera circles. */
export const middleOf = (body: FlyBody) => ({ x: body.position.x, y: body.position.y + 0.3 * FLY_LENGTH, z: body.position.z });

const ndc = new THREE.Vector3();
/** Where a point lands in the picture, -1 to 1 each way. */
export const project = (camera: THREE.PerspectiveCamera, p: THREE.Vector3Like) => ndc.set(p.x, p.y, p.z).project(camera).clone();

/** The fly's length on screen in pixels (of 640 × 480), measured along its body. */
export function lengthOnScreen(camera: THREE.PerspectiveCamera, body: FlyBody) {
  const h = FLY_LENGTH / 2;
  const fx = Math.sin(body.yaw);
  const fz = Math.cos(body.yaw);
  const y = body.position.y + 0.75;
  const a = project(camera, { x: body.position.x + fx * h, y, z: body.position.z + fz * h });
  const b = project(camera, { x: body.position.x - fx * h, y, z: body.position.z - fz * h });
  return Math.hypot(((a.x - b.x) * 640) / 2, ((a.y - b.y) * 480) / 2);
}

/** A fly's length laid across the picture at its middle, in pixels (of 640 × 480): its size, whichever way it faces. */
export function sizeOnScreen(camera: THREE.PerspectiveCamera, body: FlyBody) {
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(FLY_LENGTH / 2);
  const m = middleOf(body);
  const a = project(camera, { x: m.x + right.x, y: m.y + right.y, z: m.z + right.z });
  const b = project(camera, { x: m.x - right.x, y: m.y - right.y, z: m.z - right.z });
  return Math.hypot(((a.x - b.x) * 640) / 2, ((a.y - b.y) * 480) / 2);
}

/** The fly's length on screen as a share of the screen's height, at whatever shape. */
export function shareOfHeight(camera: THREE.PerspectiveCamera, body: FlyBody) {
  return sizeOnScreen(camera, body) / 480;
}

const corner = new THREE.Vector3();
const toCorner = { x: 0, y: 0, z: 0 };
const cornerHit = { point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 0 }, solid: -1, t: 0 };
/** What the picture's near plane cuts into, if anything: what a corner of it or its middle is in or under, or what stands between the eye and one. */
export function nearPlaneCuts(world: World, camera: THREE.PerspectiveCamera): string | null {
  const eye = camera.position;
  for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) {
    corner.set(x, y, -1).unproject(camera);
    const inside = world.solidAt(corner.x, corner.y, corner.z);
    if (inside >= 0) return world.solids[inside].name;
    if (corner.y < world.heightAt(corner.x, corner.z, corner.y)) return "the surface under it";
    const length = corner.distanceTo(eye);
    toCorner.x = (corner.x - eye.x) / length;
    toCorner.y = (corner.y - eye.y) / length;
    toCorner.z = (corner.z - eye.z) / length;
    if (world.raycast(eye, toCorner, cornerHit, length)) return world.solids[cornerHit.solid]?.name ?? "the floor";
  }
  return null;
}

/** The eye is in nothing, half a millimetre or more over what is under it, and the picture's near edge cuts into nothing; or what is wrong. */
export function badEye(world: World, camera: THREE.PerspectiveCamera): string | null {
  const eye = camera.position;
  const inside = world.solidAt(eye.x, eye.y, eye.z);
  if (inside >= 0) return `inside ${world.solids[inside].name}`;
  if (eye.y < world.heightAt(eye.x, eye.z, eye.y) + 0.5) return "on the surface under it";
  const cut = nearPlaneCuts(world, camera);
  return cut && `the near edge of the picture cuts into ${cut}`;
}

export function settle(director: CameraDirector, body: FlyBody, seconds: number, dt = 1 / 60) {
  for (let t = 0; t < seconds; t += dt) director.update(body, dt);
}

/** A few places for the fly beside what stands near where it starts, on what it starts on: a few mm off the nearest few things taller than it. */
export function besideThings(world: World, start: { x: number; z: number; y?: number }, count: number) {
  const floor = world.heightAt(start.x, start.z, start.y);
  const centre = (s: Solid) => s.footprint;
  const size = (s: Solid) => (s.footprint.kind === "circle" ? s.footprint.r : s.footprint.kind === "ellipse" ? Math.max(s.footprint.rx, s.footprint.rz) : Math.hypot(s.footprint.hx, s.footprint.hz));
  const things = world.solids
    .filter((s) => solidBottom(s) <= floor + 1 && topPeak(s.top) > floor + 2 && size(s) < 200 && Math.hypot(centre(s).x - start.x, centre(s).z - start.z) < 400)
    .sort((a, b) => Math.hypot(centre(a).x - start.x, centre(a).z - start.z) - Math.hypot(centre(b).x - start.x, centre(b).z - start.z));
  const spots: { name: string; x: number; y: number; z: number }[] = [];
  for (const thing of things) {
    for (let k = 0; k < 8 && spots.length < count; k++) {
      const a = (k * Math.PI) / 4;
      const x = centre(thing).x + Math.sin(a) * (size(thing) + 5);
      const z = centre(thing).z + Math.cos(a) * (size(thing) + 5);
      const y = world.heightAt(x, z, floor + 1);
      if (!world.onTable(x, z) || Math.abs(y - floor) > 1 || world.solidAt(x, y + 1, z) >= 0) continue;
      spots.push({ name: thing.name, x, y, z });
      break;
    }
  }
  return spots;
}
