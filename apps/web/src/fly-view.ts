// The fly as it is drawn: the model (packages/fly, through the FlyModel
// contract) placed where the body is, turned the way it faces and tilted to
// the surface under it, posed from what it is doing, with a soft shadow.

import * as THREE from "three";
import { createFly } from "@fly/fly";
import type { FlyModel, FlyPose } from "@fly/contracts";
import { RESTING_POSE } from "@fly/contracts";
import { FLY_LENGTH } from "@fly/body";
import type { FlyBody, Intent } from "@fly/body";
import type { World } from "@fly/world";
import { canvas2d, canvasTexture } from "./scene/build.ts";

function shadowTexture() {
  const { canvas, g } = canvas2d(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(20, 40, 70, 0.55)");
  grad.addColorStop(0.5, "rgba(20, 40, 70, 0.3)");
  grad.addColorStop(1, "rgba(20, 40, 70, 0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return canvasTexture(canvas);
}

export class FlyView {
  readonly model: FlyModel;
  readonly root = new THREE.Group();
  readonly pose: FlyPose = { ...RESTING_POSE };
  readonly shadow: THREE.Mesh;
  #up = new THREE.Vector3(0, 1, 0);
  #q = new THREE.Quaternion();
  #yaw = new THREE.Quaternion();
  #tilt = new THREE.Quaternion();
  #pitchRoll = new THREE.Quaternion();
  #euler = new THREE.Euler();
  #world: World;
  #shadowNormal = new THREE.Vector3();

  constructor(parent: THREE.Object3D, world: World) {
    this.#world = world;
    this.model = createFly();
    this.model.object.scale.setScalar(FLY_LENGTH);
    this.root.add(this.model.object);
    parent.add(this.root);
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    );
    this.shadow.renderOrder = 1;
    parent.add(this.shadow);
  }

  /** Places and poses the model for this frame. */
  update(body: FlyBody, intent: Intent, eating: boolean, dt: number) {
    const pose = this.pose;
    const airborne = body.mode === "airborne";
    pose.speed = body.groundSpeed / FLY_LENGTH;
    pose.turn = body.turnRate;
    pose.airborne = airborne;
    pose.wings = airborne ? Math.max(intent.wingPose, Math.min(1, intent.wings * 1.2)) : intent.wingPose;
    pose.groom = !airborne && !intent.walking && !intent.backing ? intent.groom : 0;
    pose.feed = !airborne && intent.feeding ? Math.min(1, intent.feed * (eating ? 2 : 1.5)) : 0;
    pose.crouch = !airborne ? Math.min(1, intent.escape * 0.9) : 0;
    const v = body.velocity;
    const horizontal = Math.hypot(v.x, v.z);
    pose.pitch = airborne ? Math.max(-0.6, Math.min(0.8, Math.atan2(v.y, Math.max(60, horizontal)) * 0.6)) : 0;
    pose.roll = airborne ? Math.max(-0.6, Math.min(0.6, -body.turnRate * 0.12)) : 0;
    this.model.update(pose, dt);

    const p = body.position;
    this.root.position.set(p.x, p.y, p.z);
    this.#up.set(body.up.x, body.up.y, body.up.z);
    this.#yaw.setFromAxisAngle(AXIS_Y, body.yaw);
    this.#tilt.setFromUnitVectors(AXIS_Y, this.#up);
    this.#q.copy(this.#tilt).multiply(this.#yaw);
    if (airborne) {
      this.#euler.set(-pose.pitch, 0, pose.roll, "YXZ");
      this.#pitchRoll.setFromEuler(this.#euler);
      this.#q.multiply(this.#pitchRoll);
    }
    this.root.quaternion.copy(this.#q);

    // The shadow lies on whatever is under the fly, softer and wider the higher it is.
    const surface = this.#world.surface(p.x, p.z, scratchSurface);
    const height = Math.max(0, p.y - surface.y);
    const size = FLY_LENGTH * (1.1 + height * 0.02);
    const fade = Math.max(0, 1 - height / 120);
    this.shadow.visible = surface.onTable && fade > 0.02;
    this.shadow.position.set(p.x, surface.y + 0.02, p.z);
    this.#shadowNormal.set(surface.normal.x, surface.normal.y, surface.normal.z);
    this.shadow.quaternion.setFromUnitVectors(AXIS_Y, this.#shadowNormal).multiply(this.#yaw);
    this.shadow.scale.set(size * 0.6, 1, size);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = fade;
  }
}

const AXIS_Y = new THREE.Vector3(0, 1, 0);
const scratchSurface = { y: 0, normal: { x: 0, y: 1, z: 0 }, solid: -1, onTable: true };
