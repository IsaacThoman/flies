// The car: a kinematic bicycle on a flat road between rails, and the other
// cars on it. What the controls are (the player's or the fly's) is not its
// business. What it hits is reported by where on the car it was, so the fly
// at the wheel can feel it (pilot.ts).

import { ROAD, Track, roadPoint, wrapAngle } from "./track.ts";
import type { RoadPoint } from "./track.ts";

export const CAR = {
  length: 4.4,
  width: 1.8,
  wheelbase: 2.7,
  /** Full lock (rad), at walking pace; less at speed (`steerLimit`). */
  lock: 0.55,
  /** Sideways grip, m/s²: how sharply it can turn at speed without sliding. */
  grip: 7,
  /** How fast the wheels follow the asked-for angle, rad/s. */
  steerRate: 2.2,
  accel: 5.5,
  reverseAccel: 3,
  brake: 11,
  /** Rolling resistance (1/s) and air drag (1/m): together they hold it under about 50 m/s with the pedal down. */
  rolling: 0.04,
  drag: 0.0018,
  reverseTop: 7,
};

/**
 * What the car is asked to do: `steer` from −1 (full left) to 1 (full right),
 * `throttle` from −1 (reverse) to 1, `brake` 0 to 1.
 */
export type Controls = { steer: number; throttle: number; brake: number };

/** What the car ran into this step: a front corner against something, and how hard (0 to 1) anything hit it. */
export type Contact = { frontLeft: boolean; frontRight: boolean; impact: number };

/** The most the wheels turn at this speed: full lock, or as far as the tyres grip (yaw rate × speed = grip). */
export const steerLimit = (speed: number) => Math.min(CAR.lock, Math.atan((CAR.grip * CAR.wheelbase) / Math.max(1e-6, speed * speed)));

/** Another car on the road: going round at its own pace in its lane, the way the loop runs (1) or against it (−1). */
export type Traffic = { s: number; lane: number; way: 1 | -1; cruise: number; speed: number; x: number; z: number; yaw: number };

const COLLIDE = 0.95;
/** Each car is two circles, front and back, this far from its middle: a long box, near enough. */
const AXLE = 1.15;
const AXLES = [AXLE, -AXLE] as const;
/** How fast a rail turns a car pushed against it to run along it, rad/s, and how hard scraping along it slows it, m/s². */
const RAIL_SWING = 2.5;
const SCRAPE = 3;

export class Car {
  x = 0;
  z = 0;
  /** Forward is (sin yaw, cos yaw); positive yaw is turning left. */
  yaw = 0;
  /** Along its heading, m/s: negative backing up. */
  speed = 0;
  /** The wheels' angle now, rad, positive right. */
  wheel = 0;
  /** Its yaw rate in the last step, rad/s, positive left. */
  turnRate = 0;
  /** Where it is on the road. */
  readonly road: RoadPoint = roadPoint();
  readonly contact: Contact = { frontLeft: false, frontRight: false, impact: 0 };
  /** Metres driven round the loop, forwards counted up and backwards down. */
  progress = 0;
  readonly #track: Track;
  #dt = 0;
  /** Against a rail since the last step: the hit is over and it scrapes along. */
  #scraping = false;

  constructor(track: Track) {
    this.#track = track;
    this.reset(0);
  }

  /** On the road `along` metres round, in the right-hand lane, stopped. */
  reset(along: number) {
    const p = this.#track.at(along, -ROAD.lane, this.road);
    this.x = p.x;
    this.z = p.z;
    this.yaw = p.yaw;
    this.speed = 0;
    this.wheel = 0;
    this.turnRate = 0;
    this.#track.nearest(this.x, this.z, this.road, false);
  }

  step(controls: Controls, traffic: readonly Traffic[], dt: number) {
    if (!(dt > 0)) return;
    this.#dt = dt;
    const contact = this.contact;
    contact.frontLeft = false;
    contact.frontRight = false;
    contact.impact = 0;

    const limit = steerLimit(Math.abs(this.speed));
    const want = clamp(controls.steer, -1, 1) * limit;
    this.wheel += clamp(want - this.wheel, -CAR.steerRate * dt, CAR.steerRate * dt);
    this.wheel = clamp(this.wheel, -limit, limit);

    const throttle = clamp(controls.throttle, -1, 1);
    let v = this.speed;
    if (throttle > 0) v += throttle * CAR.accel * dt;
    else if (throttle < 0) v += throttle * CAR.reverseAccel * dt;
    const brake = clamp(controls.brake, 0, 1) * CAR.brake * dt;
    v = Math.abs(v) <= brake ? 0 : v - Math.sign(v) * brake;
    v -= v * (CAR.rolling + CAR.drag * Math.abs(v)) * dt;
    if (v < -CAR.reverseTop) v = -CAR.reverseTop;
    this.speed = v;

    this.turnRate = -(v / CAR.wheelbase) * Math.tan(this.wheel);
    this.yaw = wrapAngle(this.yaw + this.turnRate * dt);
    const before = this.road.s;
    this.x += Math.sin(this.yaw) * v * dt;
    this.z += Math.cos(this.yaw) * v * dt;

    this.#rails();
    for (const other of traffic) this.#bump(other);
    const road = this.#track.nearest(this.x, this.z, this.road);
    this.progress += wrapGap(road.s - before, this.#track.length);
  }

  /** Keeps it between the rails: hitting one loses the speed it had into it, and against it the car scrapes along it. */
  #rails() {
    const road = this.#track.nearest(this.x, this.z, this.road);
    const room = ROAD.half - CAR.width / 2;
    // The rail is nearest the car's front corner on a slant: allow for it.
    const slant = Math.abs(Math.sin(wrapAngle(this.yaw - road.yaw))) * (CAR.length / 2);
    const over = Math.abs(road.lateral) + slant - room;
    if (over <= 0) {
      this.#scraping = false;
      return;
    }
    const side = Math.sign(road.lateral);
    // Outward from the road toward that rail: its left, scaled by the side.
    const nx = Math.cos(road.yaw) * side;
    const nz = -Math.sin(road.yaw) * side;
    this.x -= nx * over;
    this.z -= nz * over;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const into = (fx * nx + fz * nz) * this.speed;
    if (into > 0) {
      // Along the rail, the way the car was more nearly going.
      const along = Math.abs(wrapAngle(road.yaw - this.yaw)) <= Math.PI / 2 ? road.yaw : road.yaw + Math.PI;
      const swing = wrapAngle(along - this.yaw);
      if (!this.#scraping) {
        this.contact.impact = Math.max(this.contact.impact, Math.min(1, into / 8));
        this.speed *= Math.cos(swing);
      }
      const dt = this.#dt;
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), SCRAPE * dt);
      this.yaw = wrapAngle(this.yaw + Math.sign(swing) * Math.min(Math.abs(swing), RAIL_SWING * dt));
    }
    this.#scraping = true;
    this.#felt(nx, nz, this.speed >= 0);
  }

  /** Another car's circles against this one's: pushed apart, the speed into it lost. */
  #bump(other: Traffic) {
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const ox = Math.sin(other.yaw);
    const oz = Math.cos(other.yaw);
    for (const a of AXLES) {
      for (const b of AXLES) {
        const dx = other.x + ox * b - (this.x + fx * a);
        const dz = other.z + oz * b - (this.z + fz * a);
        const d = Math.hypot(dx, dz);
        if (d >= COLLIDE * 2 || d < 1e-6) continue;
        const nx = dx / d;
        const nz = dz / d;
        const push = COLLIDE * 2 - d;
        this.x -= nx * push;
        this.z -= nz * push;
        const closing = (fx * nx + fz * nz) * this.speed - (ox * nx + oz * nz) * other.speed * other.way;
        if (closing > 0) {
          this.contact.impact = Math.max(this.contact.impact, Math.min(1, closing / 8));
          this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), closing);
        }
        this.#felt(nx, nz, a > 0);
      }
    }
  }

  /** Something toward (nx, nz) touches it; at the front it is felt on that side. */
  #felt(nx: number, nz: number, front: boolean) {
    if (!front) return;
    // Its left is (cos yaw, −sin yaw).
    const left = nx * Math.cos(this.yaw) - nz * Math.sin(this.yaw);
    if (left >= 0) this.contact.frontLeft = true;
    if (left <= 0) this.contact.frontRight = true;
  }
}

/**
 * The other cars: some going the loop's way in the right-hand lane, some
 * coming the other way in the other. They keep their pace but slow behind
 * the player's car rather than run into it.
 */
export class Roads {
  readonly cars: Traffic[] = [];
  readonly #track: Track;
  readonly #p = roadPoint();

  constructor(track: Track, ahead = 4, oncoming = 3) {
    this.#track = track;
    for (let i = 0; i < ahead; i++) {
      const cruise = 11 + ((i * 7) % 5);
      this.cars.push({ s: track.length * ((i + 0.5) / ahead), lane: -ROAD.lane, way: 1, cruise, speed: cruise, x: 0, z: 0, yaw: 0 });
    }
    for (let i = 0; i < oncoming; i++) {
      const cruise = 13 + ((i * 5) % 4);
      this.cars.push({ s: track.length * ((i + 0.2) / oncoming), lane: ROAD.lane, way: -1, cruise, speed: cruise, x: 0, z: 0, yaw: 0 });
    }
    this.step(null, 0);
  }

  step(player: Car | null, dt: number) {
    const L = this.#track.length;
    for (const car of this.cars) {
      let want = car.cruise;
      if (player) {
        // How far ahead of it the player's car is, along its way, and whether in its lane.
        const gap = wrapGap((player.road.s - car.s) * car.way, L);
        const inLane = Math.abs(player.road.lateral - car.lane) < 2.4;
        if (inLane && gap > 0 && gap < 30) want = Math.min(want, Math.max(0, (gap - 7) * 0.6 + Math.max(0, player.speed * car.way * Math.cos(wrapAngle(player.yaw - player.road.yaw)))));
      }
      car.speed += clamp(want - car.speed, -8 * dt, 3 * dt);
      car.s = (((car.s + car.speed * car.way * dt) % L) + L) % L;
      const p = this.#track.at(car.s, car.lane, this.#p);
      car.x = p.x;
      car.z = p.z;
      car.yaw = car.way > 0 ? p.yaw : wrapAngle(p.yaw + Math.PI);
    }
  }
}

const wrapGap = (d: number, L: number) => ((((d + L / 2) % L) + L) % L) - L / 2;
const clamp = (v: number, lo: number, hi: number) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : 0);
