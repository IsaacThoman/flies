import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { createPicnic } from "@fly/world";
import type { RayHit } from "@fly/world";
import { TV_FRAME, frameFor } from "../src/display.ts";
import { FLY_REACH, aimAt } from "../src/tools/aim.ts";
import { playRoom } from "../src/ui/layout.ts";

const world = createPicnic();
const hit = (): RayHit => ({ point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, solid: -1, t: 0 });

/** A camera low beside a fly, as Follow has it, and the ray through a point on its picture (-1 to 1, y up). */
function look(fly: { x: number; y: number; z: number }) {
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.5, 4000);
  camera.position.set(fly.x + 11, fly.y + 1.6, fly.z);
  camera.lookAt(fly.x, fly.y + 0.75, fly.z);
  camera.updateMatrixWorld();
  const ray = new THREE.Raycaster();
  return (x: number, y: number) => {
    ray.setFromCamera(new THREE.Vector2(x, y), camera);
    return { origin: ray.ray.origin, dir: ray.ray.direction, at: (p: THREE.Vector3Like) => new THREE.Vector3(p.x, p.y, p.z).project(camera) };
  };
}

test("a pointer on the fly points at the fly, not at the table the ray would reach behind it", () => {
  const fly = { x: -8, y: world.heightAt(-8, -8), z: -8 };
  const through = look(fly);
  const middle = through(0, 0).at({ x: fly.x, y: fly.y + 0.75, z: fly.z });
  const r = through(middle.x, middle.y);
  const plain = world.raycast(r.origin, r.dir, hit());
  assert.ok(plain && Math.hypot(plain.point.x - fly.x, plain.point.z - fly.z) > 3, "the bare ray lands well behind it");
  const aimed = aimAt(world, r.origin, r.dir, fly, hit())!;
  assert.ok(Math.hypot(aimed.point.x - fly.x, aimed.point.z - fly.z) < 1e-9, "on the fly");
  assert.equal(aimed.point.y, fly.y, "on what it stands on");
});

test("a pointer beside the fly, or anywhere else, is on whatever is there", () => {
  const fly = { x: -8, y: world.heightAt(-8, -8), z: -8 };
  const through = look(fly);
  const r = through(0.5, -0.6);
  const plain = world.raycast(r.origin, r.dir, hit())!;
  const aimed = aimAt(world, r.origin, r.dir, fly, hit())!;
  assert.deepEqual(aimed.point, plain.point);
  assert.ok(Math.hypot(aimed.point.x - fly.x, aimed.point.z - fly.z) > FLY_REACH);
  const sky = through(0, 0.95);
  assert.equal(aimAt(world, sky.origin, sky.dir, fly, hit()), null, "the air over the table's edge is nothing");
});

test("play framing follows the room left over the foot; on the TV, as ever", () => {
  assert.deepEqual(playRoom(TV_FRAME), { lower: 0, wider: 1 });
  // On its side, the foot takes more of a short screen: the fly rises and is drawn a little smaller, a finger's foot more so.
  const mouse = playRoom(frameFor(852, 393, { top: 0, right: 59, bottom: 21, left: 59 }, false));
  const finger = playRoom(frameFor(852, 393, { top: 0, right: 59, bottom: 21, left: 59 }, true));
  assert.ok(mouse.lower < -0.05 && mouse.wider > 1 && mouse.wider < 1.15, JSON.stringify(mouse));
  assert.ok(finger.lower < mouse.lower && finger.wider > mouse.wider && finger.wider < 1.2, JSON.stringify(finger));
  // Upright, the foot is a small share of the height: about as on the TV.
  const upright = playRoom(frameFor(393, 852, { top: 59, right: 0, bottom: 34, left: 0 }, true));
  assert.ok(Math.abs(upright.lower) < 0.1 && upright.wider < 1.1, JSON.stringify(upright));
});
