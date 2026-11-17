// Inside the car, in its own frame (x left, y up, z ahead, metres from the
// middle of the car at road level): the bonnet, the dashboard and pillars,
// the wheel and the speedometer, the centre screen showing what the fly's
// eyes take in, a lamp that is green while the fly drives, and the fly on
// its ball on top of the dashboard. On a layer of its own, so the fly's eyes
// see the road and not the car.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createFly } from "@fly/fly";
import type { FlyModelWithRig } from "@fly/fly";
import type { FlyPose } from "@fly/contracts";
import { RESTING_POSE } from "@fly/contracts";
import { FLY_LENGTH } from "@fly/body";
import type { Intent } from "@fly/body";
import { mat4, paint } from "../scene/build.ts";
import { CAR } from "./car.ts";
import type { Car } from "./car.ts";

/** Where the driver's eyes are. */
export const DRIVER = new THREE.Vector3(0.37, 1.24, -0.3);
/** The fly on the dashboard: how long it is drawn, where its ball sits and how big the ball is. */
const FLY_SIZE = 0.13;
const BALL = { x: 0.13, y: 1.03, z: 0.6, r: 0.045 };
/** The top of the dashboard, and how far it reaches toward the driver. */
const DASH = { top: 0.95, near: 0.32 };
const WHEEL = { x: DRIVER.x, y: 0.93, z: 0.12, tilt: 0.42 };
/** The speedometer, standing on the dashboard over the wheel, and the screen beside it. */
const GAUGE = { x: DRIVER.x, y: 1.07, z: 0.48 };
const SCREEN = { x: -0.2, y: 1.04, z: 0.46, width: 0.34, height: 0.17 };
/** Turns of the steering wheel for the road wheels' angle: a car's steering ratio. */
const STEERING_RATIO = 7;
/** The speedometer's sweep (rad) and the speed (m/s) at its end. */
const DIAL = { sweep: Math.PI * 1.5, top: 50 };
/** The dial faces the driver, leaning back a little. Seen from the driver, turning about its +z is anticlockwise. */
const DIAL_FACING = new THREE.Euler(0.35, Math.PI, 0, "YXZ");
const LAMP = { off: new THREE.Color("#3a4652"), on: new THREE.Color("#5dff7a"), waiting: new THREE.Color("#ffb347"), failed: new THREE.Color("#ff4d4d") };

export type BrainLamp = "off" | "on" | "waiting" | "failed";

export class Cockpit {
  readonly root = new THREE.Group();
  readonly fly: FlyModelWithRig;
  readonly #wheel = new THREE.Group();
  readonly #needle = new THREE.Group();
  readonly #ball: THREE.Mesh;
  readonly #lamp: THREE.MeshBasicMaterial;
  readonly #screen: THREE.MeshBasicMaterial;
  readonly #pose: FlyPose = { ...RESTING_POSE };
  #blink = 0;

  constructor(picture: THREE.Texture, layer: number) {
    const root = this.root;
    root.name = "cockpit";
    const lambert = new THREE.MeshLambertMaterial({ vertexColors: true });
    const parts: THREE.BufferGeometry[] = [];
    const box = (w: number, h: number, d: number, color: string, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) =>
      parts.push(paint(new THREE.BoxGeometry(w, h, d), color).applyMatrix4(mat4({ x, y, z }, new THREE.Euler(rx, ry, rz))));
    // The bonnet, sloping down to the front.
    box(CAR.width * 0.94, 0.12, 1.5, "#d9372f", 0, 0.9, 1.7, 0.08);
    box(CAR.width * 0.96, 0.08, 0.3, "#b82d27", 0, 0.94, 1.0, 0.02);
    // The dashboard, the binnacle and screen standing on it, and the pillars and roof round the windscreen.
    box(CAR.width * 0.98, 0.35, 0.6, "#2d3640", 0, DASH.top - 0.175, DASH.near + 0.3);
    box(0.24, GAUGE.y - DASH.top + 0.06, 0.08, "#252d35", GAUGE.x, (GAUGE.y + DASH.top) / 2 - 0.01, GAUGE.z + 0.05, -0.35);
    box(SCREEN.width + 0.03, SCREEN.height + 0.03, 0.03, "#11171d", SCREEN.x, SCREEN.y, SCREEN.z + 0.02, -0.25);
    box(0.06, 0.1, 0.06, "#252d35", SCREEN.x, DASH.top + 0.03, SCREEN.z + 0.05);
    box(0.08, 0.85, 0.08, "#c63129", 0.86, 1.38, 0.55, -0.62, 0, 0.08);
    box(0.08, 0.85, 0.08, "#c63129", -0.86, 1.38, 0.55, -0.62, 0, -0.08);
    box(CAR.width, 0.08, 0.5, "#6b6660", 0, 1.74, 0.05);
    box(CAR.width * 0.98, 0.04, 0.04, "#c63129", 0, 1.72, 0.26);
    // The dial's face and ticks, behind the wheel.
    const dial = new THREE.CylinderGeometry(0.075, 0.075, 0.02, 24).rotateX(Math.PI / 2);
    parts.push(paint(dial, "#10161c").applyMatrix4(mat4(GAUGE, DIAL_FACING)));
    for (let i = 0; i <= 10; i++) {
      const a = -DIAL.sweep / 2 + (i / 10) * DIAL.sweep;
      const tick = new THREE.BoxGeometry(0.006, 0.018, 0.004).translate(0, 0.058, 0.012).rotateZ(-a);
      parts.push(paint(tick, i >= 8 ? "#ff6b5b" : "#e9f1f7").applyMatrix4(mat4(GAUGE, DIAL_FACING)));
    }
    // A stand for the fly's ball.
    parts.push(paint(new THREE.CylinderGeometry(0.04, 0.055, BALL.y - BALL.r * 0.6 - DASH.top, 12), "#9aa4ae").translate(BALL.x, (DASH.top + BALL.y - BALL.r * 0.6) / 2, BALL.z));
    const shell = new THREE.Mesh(mergeGeometries(parts), lambert);
    for (const g of parts) g.dispose();
    root.add(shell);

    // The speedometer's needle.
    const needle = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.06, 0.004).translate(0, 0.028, 0), new THREE.MeshBasicMaterial({ color: "#ff8a3d" }));
    needle.position.z = 0.014;
    this.#needle.add(needle);
    this.#needle.position.set(GAUGE.x, GAUGE.y, GAUGE.z);
    this.#needle.rotation.copy(DIAL_FACING);
    root.add(this.#needle);

    // The steering wheel, turned by the car's wheels.
    const rim = new THREE.TorusGeometry(0.18, 0.022, 8, 28);
    const hub = new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12).rotateX(Math.PI / 2);
    const spoke = new THREE.BoxGeometry(0.33, 0.03, 0.02);
    const down = new THREE.BoxGeometry(0.03, 0.17, 0.02).translate(0, -0.09, 0);
    const wheelGeometry = mergeGeometries([paint(rim, "#1c2127"), paint(hub, "#2f3a45"), paint(spoke, "#2b333c"), paint(down, "#2b333c")]);
    const wheel = new THREE.Mesh(wheelGeometry, lambert);
    this.#wheel.add(wheel);
    this.#wheel.position.set(WHEEL.x, WHEEL.y, WHEEL.z);
    this.#wheel.rotation.set(WHEEL.tilt, Math.PI, 0, "YXZ");
    root.add(this.#wheel);

    // The centre screen: what the fly's eyes take in.
    this.#screen = new THREE.MeshBasicMaterial({ map: picture, color: "#ffffff" });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.width, SCREEN.height), this.#screen);
    screen.position.set(SCREEN.x, SCREEN.y, SCREEN.z);
    screen.rotation.set(0.25, Math.PI, 0, "YXZ");
    root.add(screen);

    // The lamp: who drives.
    this.#lamp = new THREE.MeshBasicMaterial({ color: LAMP.off });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 6), this.#lamp);
    lamp.position.set(SCREEN.x, SCREEN.y + SCREEN.height / 2 + 0.035, SCREEN.z + 0.02);
    root.add(lamp);

    // The ball the fly walks on, striped so it is seen to turn, and the fly on top.
    const ball = new THREE.SphereGeometry(BALL.r, 16, 10);
    const stripes = new THREE.Color("#f4f1e8");
    const dark = new THREE.Color("#3a4a5a");
    this.#ball = new THREE.Mesh(paint(ball, (p) => (Math.floor((Math.atan2(p.y, p.z) / Math.PI) * 4 + 4) % 2 === 0 ? stripes : dark)), lambert);
    this.#ball.position.set(BALL.x, BALL.y, BALL.z);
    this.#ball.rotation.order = "YXZ";
    root.add(this.#ball);
    this.fly = createFly();
    this.fly.object.scale.setScalar(FLY_SIZE);
    this.fly.object.position.set(BALL.x, BALL.y + BALL.r, BALL.z);
    root.add(this.fly.object);

    root.traverse((o) => o.layers.set(layer));
  }

  /** Follows the car; the fly is posed from what its brain asks (`intent`), whoever drives. */
  update(car: Car, intent: Intent, lamp: BrainLamp, dt: number) {
    this.root.position.set(car.x, 0, car.z);
    this.root.rotation.y = car.yaw;
    this.#wheel.rotation.z = -car.wheel * STEERING_RATIO;
    // From bottom left at a standstill, clockwise.
    this.#needle.rotation.z = DIAL.sweep / 2 - (Math.min(Math.abs(car.speed), DIAL.top) / DIAL.top) * DIAL.sweep;

    const pose = this.#pose;
    // On the ball it walks in place: the ball turns under it instead of the fly going anywhere.
    pose.speed = intent.speed / FLY_LENGTH;
    pose.turn = intent.yawRate;
    pose.groom = !intent.walking && !intent.backing ? intent.groom : 0;
    pose.crouch = Math.min(1, intent.escape * 0.9);
    pose.wings = intent.wingPose;
    this.fly.update(pose, dt);
    const ball = this.#ball.rotation;
    ball.x -= (pose.speed * FLY_SIZE * dt) / BALL.r;
    ball.y -= intent.yawRate * dt;

    this.#blink += dt;
    const color = lamp === "waiting" ? (Math.floor(this.#blink * 2) % 2 === 0 ? LAMP.waiting : LAMP.off) : LAMP[lamp];
    this.#lamp.color.copy(color);
    this.#screen.color.setScalar(lamp === "on" ? 1 : 0.55);
  }
}
