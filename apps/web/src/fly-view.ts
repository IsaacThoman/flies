// The fly as it is drawn: the model (packages/fly, through the FlyModel
// contract) placed where the body is, turned the way it faces and tilted to
// the surface under it, posed from what it is doing, with a soft shadow. It
// takes the shadow of anything passing over the place (scene/shade.ts).

import * as THREE from "three";
import { createFly } from "@fly/fly";
import type { FlyModelWithRig } from "@fly/fly";
import type { FlyPose } from "@fly/contracts";
import { RESTING_POSE } from "@fly/contracts";
import { FLY_LENGTH } from "@fly/body";
import type { FlyBody, Intent } from "@fly/body";
import { createSurface } from "@fly/world";
import type { Vec3, World } from "@fly/world";
import { canvas2d, canvasTexture } from "./scene/build.ts";
import { shaded } from "./scene/shade.ts";

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
  readonly model: FlyModelWithRig;
  readonly root = new THREE.Group();
  readonly pose: FlyPose = { ...RESTING_POSE };
  /** Its own shadow; none for another player's fly, whose shadows are drawn together (online/others.ts). */
  readonly shadow: THREE.Mesh | null;
  #up = new THREE.Vector3(0, 1, 0);
  #q = new THREE.Quaternion();
  #yaw = new THREE.Quaternion();
  #tilt = new THREE.Quaternion();
  #world: World;

  constructor(parent: THREE.Object3D, world: World, shadow = true) {
    this.#world = world;
    this.model = createFly();
    this.model.object.scale.setScalar(FLY_LENGTH);
    const materials = new Set<THREE.MeshStandardMaterial>();
    this.model.object.traverse((o) => {
      const material = (o as THREE.Mesh).material;
      if (material instanceof THREE.MeshStandardMaterial) materials.add(material);
    });
    // The X-ray's glass body takes the passing shadow as the body does.
    for (const material of this.model.nerves.materials) if (material instanceof THREE.MeshStandardMaterial) materials.add(material);
    for (const material of materials) shaded(material);
    this.root.add(this.model.object);
    parent.add(this.root);
    this.shadow = shadow ? new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), flyShadowMaterial()) : null;
    if (this.shadow) {
      this.shadow.renderOrder = 1;
      parent.add(this.shadow);
    }
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
    this.place(body.position, body.yaw, body.up);
  }

  /** Puts the model where a fly is, facing `yaw` and tilted to `up`, with its shadow: pose it first (another player's fly is posed from what its device sent). */
  place(p: Vec3, yaw: number, up: Vec3) {
    this.root.position.set(p.x, p.y, p.z);
    this.#up.set(up.x, up.y, up.z);
    this.#yaw.setFromAxisAngle(AXIS_Y, yaw);
    this.#tilt.setFromUnitVectors(AXIS_Y, this.#up);
    // In the air the model pitches and rolls itself from the pose (the FlyModel contract); here only its heading and the ground's tilt.
    this.#q.copy(this.#tilt).multiply(this.#yaw);
    this.root.quaternion.copy(this.#q);

    const shadow = this.shadow;
    if (!shadow) return;
    const fade = flyShadow(this.#world, p, this.#yaw, shadow);
    shadow.visible = fade > 0.02;
    (shadow.material as THREE.MeshBasicMaterial).opacity = fade;
  }
}

/** The soft shadow under a fly, as a material: one for every fly's shadow. */
export function flyShadowMaterial() {
  return new THREE.MeshBasicMaterial({ map: (shadowMap ??= shadowTexture()), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
}

let shadowMap: THREE.Texture | null = null;

/**
 * Sets an object to be a fly's shadow on whatever is under it (not on what
 * is over it), softer and wider the higher it is, turned with its heading
 * (`yaw`). Returns how strong it is (0 to 1; 0 where there is nothing under
 * it).
 */
export function flyShadow(world: World, p: Vec3, yaw: THREE.Quaternion, shadow: THREE.Object3D): number {
  const surface = world.surface(p.x, p.z, scratchSurface, p.y);
  const height = Math.max(0, p.y - surface.y);
  const size = FLY_LENGTH * (1.1 + height * 0.02);
  shadow.position.set(p.x, surface.y + 0.02, p.z);
  scratchNormal.set(surface.normal.x, surface.normal.y, surface.normal.z);
  shadow.quaternion.setFromUnitVectors(AXIS_Y, scratchNormal).multiply(yaw);
  shadow.scale.set(size * 0.6, 1, size);
  return surface.onTable ? Math.max(0, 1 - height / 120) : 0;
}

const AXIS_Y = new THREE.Vector3(0, 1, 0);
const scratchSurface = createSurface();
const scratchNormal = new THREE.Vector3();
