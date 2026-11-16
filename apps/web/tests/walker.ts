// A fly model walking over a world as the game moves it: the root carried by
// exactly the pose's speed and turn, so the gait's planted feet stay put. For
// the footprints' tests and their allocation probe.

import * as THREE from "three";
import { FLY_LENGTH } from "@fly/body";
import { RESTING_POSE } from "@fly/contracts";
import type { FlyPose } from "@fly/contracts";
import { createFly } from "@fly/fly";
import type { World } from "@fly/world";

const UP = new THREE.Vector3(0, 1, 0);

export function walker(world: World, x: number, z: number, yaw: number) {
  const model = createFly();
  model.object.scale.setScalar(FLY_LENGTH);
  const root = new THREE.Group();
  root.add(model.object);
  const pose: FlyPose = { ...RESTING_POSE };
  const at = { x, z, yaw };
  const step = (dt: number) => {
    model.update(pose, dt);
    at.yaw += pose.turn * dt;
    at.x += Math.sin(at.yaw) * pose.speed * FLY_LENGTH * dt;
    at.z += Math.cos(at.yaw) * pose.speed * FLY_LENGTH * dt;
    root.position.set(at.x, world.heightAt(at.x, at.z), at.z);
    root.quaternion.setFromAxisAngle(UP, at.yaw);
  };
  step(0);
  return { model, pose, at, step };
}
