// What the camera tests look at: a stand-in fly and where things land in the picture.

import * as THREE from "three";
import { FLY_LENGTH } from "@fly/body";
import type { FlyBody } from "@fly/body";
import type { World } from "@fly/world";
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

export function settle(director: CameraDirector, body: FlyBody, seconds: number, dt = 1 / 60) {
  for (let t = 0; t < seconds; t += dt) director.update(body, dt);
}
