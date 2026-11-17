import assert from "node:assert/strict";
import { test } from "node:test";
import type { BrainCommand } from "@fly/brain";
import { ESCAPE_ON, ESCAPE_REFRACTORY, FLY_LENGTH, WALK_FASTEST, WALK_SPEED } from "@fly/body";
import { CAR, Car, Roads, steerLimit } from "../src/car/car.ts";
import type { Controls } from "../src/car/car.ts";
import { Pilot, steering } from "../src/car/pilot.ts";
import { ROAD, Track, roadPoint, wrapAngle } from "../src/car/track.ts";

const DT = 1 / 60;
const command = (c: Partial<BrainCommand> = {}): BrainCommand => ({ walk: 0, turn: 0, back: 0, escape: 0, wings: 0, groom: 0, feed: 0, sing: 0, ...c });

function drive(car: Car, controls: Controls, seconds: number, roads: Roads | null = null, each?: () => void) {
  for (let t = 0; t < seconds; t += DT) {
    roads?.step(car, DT);
    car.step(controls, roads?.cars ?? [], DT);
    each?.();
  }
}

test("the road is a closed loop: a point set down on it is found again, left of the centre line positive", () => {
  const track = new Track();
  assert.ok(track.length > 900 && track.length < 1500, `${track.length} m`);
  const p = roadPoint();
  const q = roadPoint();
  for (const along of [0, 100, 555.5, track.length - 1]) {
    for (const lateral of [-5, 0, 3]) {
      track.at(along, lateral, p);
      track.nearest(p.x, p.z, q, false);
      assert.ok(Math.abs(q.lateral - lateral) < 0.05, `${along} ${lateral}: ${q.lateral}`);
      assert.ok(Math.abs(wrapAngle(((q.s - along) / track.length) * Math.PI * 2)) < 0.01, `${along}: ${q.s}`);
    }
  }
});

test("the car speeds up on the throttle, turns the way it is steered, and counts its way round", () => {
  const track = new Track();
  const car = new Car(track);
  drive(car, { steer: 0, throttle: 1, brake: 0 }, 2);
  assert.ok(car.speed > 9 && car.speed < 12, `${car.speed} m/s`);
  assert.ok(car.progress > 8, `${car.progress} m`);
  const yaw = car.yaw;
  drive(car, { steer: 1, throttle: 0, brake: 0 }, 0.3);
  assert.ok(wrapAngle(car.yaw - yaw) < -0.05, "steering right turns it right (yaw falls)");
  drive(car, { steer: 0, throttle: 0, brake: 1 }, 2);
  assert.equal(car.speed, 0);
  drive(car, { steer: 0, throttle: -1, brake: 0 }, 1);
  assert.ok(car.speed < -1, "the throttle backwards backs it up");
});

test("at speed the steering only turns it as sharply as the tyres grip", () => {
  for (const speed of [10, 20, 35]) {
    const yawRate = (speed / CAR.wheelbase) * Math.tan(steerLimit(speed));
    assert.ok(yawRate * speed <= CAR.grip + 1e-9, `${speed} m/s: ${(yawRate * speed).toFixed(1)} m/s²`);
  }
  assert.equal(steerLimit(1), CAR.lock);
});

test("the rails keep it on the road: a hit is felt at that front corner, and it scrapes on along the rail", () => {
  const car = new Car(new Track());
  let left = false;
  let right = false;
  let impact = 0;
  let widest = 0;
  drive(car, { steer: -1, throttle: 1, brake: 0 }, 8, null, () => {
    left ||= car.contact.frontLeft;
    right ||= car.contact.frontRight;
    impact = Math.max(impact, car.contact.impact);
    widest = Math.max(widest, Math.abs(car.road.lateral));
  });
  assert.ok(left && !right, "into the left rail, felt on the left");
  assert.ok(impact > 0, "it hit");
  assert.ok(widest <= ROAD.half - CAR.width / 2 + 1e-6, `${widest} m from the middle`);
  // Held to the rail with the wheel straight, it goes on along it rather than stopping dead.
  drive(car, { steer: 0, throttle: 1, brake: 0 }, 3);
  assert.ok(car.speed > 8, `${car.speed} m/s`);
  assert.ok(Math.abs(wrapAngle(car.yaw - car.road.yaw)) < 0.2, "lined up with the road");
});

test("the other cars go round in their lanes and wait behind the player's car rather than run into it", () => {
  const track = new Track();
  const car = new Car(track);
  const roads = new Roads(track);
  const p = roadPoint();
  for (const other of roads.cars) {
    track.nearest(other.x, other.z, p, false);
    assert.ok(Math.abs(p.lateral - other.lane) < 0.1);
  }
  // Stopped in the right-hand lane: whoever comes up behind it stops short.
  let nearest = Infinity;
  drive(car, { steer: 0, throttle: 0, brake: 1 }, 120, roads, () => {
    for (const other of roads.cars) if (other.way > 0) nearest = Math.min(nearest, Math.hypot(other.x - car.x, other.z - car.z));
  });
  assert.ok(nearest > CAR.length, `${nearest} m`);
  assert.ok(Math.abs(car.progress) < 0.5, "nobody pushed it");
});

test("the fly at the wheel: its walking sets the speed in car lengths for its body lengths, and its turning the steering", () => {
  const pilot = new Pilot();
  let intent = pilot.update(command({ walk: 1 }), 0, 0, DT);
  for (let i = 0; i < 60; i++) intent = pilot.update(command({ walk: 1 }), 0, 0, DT);
  assert.ok(intent.walking);
  const fly = WALK_SPEED * WALK_FASTEST;
  assert.ok(Math.abs(pilot.wanted - (fly / FLY_LENGTH) * CAR.length) < 0.5, `${pilot.wanted} m/s`);
  assert.equal(pilot.controls.throttle, 1);
  for (let i = 0; i < 60; i++) pilot.update(command({ walk: 1, turn: 0.5 }), 0, 10, DT);
  assert.ok(pilot.controls.steer > 0, "turning right steers right");
  for (let i = 0; i < 60; i++) pilot.update(command({ walk: 1, turn: -0.5 }), 0, 10, DT);
  assert.ok(pilot.controls.steer < 0, "and left, left");
});

test("the steering asked for turns the car at the fly's own yaw rate, where the lock allows", () => {
  for (const [yawRate, speed] of [[0.2, 10], [-0.4, 6], [0.1, 25]]) {
    const wheel = steering(yawRate, speed) * steerLimit(speed);
    assert.ok(Math.abs(-(speed / CAR.wheelbase) * Math.tan(wheel) - yawRate) < 1e-9, `${yawRate} rad/s at ${speed} m/s`);
  }
  assert.equal(steering(3, 25), -1, "past the grip it is full lock");
});

test("with no command, or when its giant fiber fires, the car brakes; standing still it rolls to a stop", () => {
  const pilot = new Pilot();
  pilot.update(null, 0, 10, DT);
  assert.equal(pilot.controls.brake, 1);
  assert.equal(pilot.controls.throttle, 0);
  for (let i = 0; i < 30; i++) pilot.update(command(), 0, 10, DT);
  assert.ok(pilot.controls.brake > 0 && pilot.controls.brake < 0.5, "a still fly lets the car coast down");
  for (let i = 0; i < 30; i++) pilot.update(command({ walk: 1 }), 0, 10, DT);
  pilot.update(command({ walk: 1, escape: ESCAPE_ON + 0.1 }), 0, 10, DT);
  assert.equal(pilot.escapes, 1);
  let braked = 0;
  for (let t = 0; t < ESCAPE_REFRACTORY + 0.5; t += DT) {
    pilot.update(command({ walk: 1 }), 0, 10, DT);
    if (pilot.controls.brake === 1) braked += DT;
  }
  assert.ok(Math.abs(braked - ESCAPE_REFRACTORY) < 0.05, `braked ${braked} s`);
  assert.equal(pilot.controls.throttle, 1, "then it drives on");
});

test("what the car's front touches is the fly's antennae and touch; its eyes' picture goes with them", () => {
  const pilot = new Pilot();
  const light = { left: new Float32Array(3), right: new Float32Array(3) };
  let senses = pilot.sense({ frontLeft: true, frontRight: false, impact: 0.6 }, light, DT);
  assert.deepEqual([senses.bumpLeft, senses.bumpRight, senses.touch], [1, 0, 0.6]);
  assert.equal(senses.light, light);
  senses = pilot.sense({ frontLeft: false, frontRight: false, impact: 0 }, null, 0.5);
  assert.equal(senses.bumpLeft, 0);
  assert.ok(senses.touch > 0 && senses.touch < 0.6, "a knock fades");
  assert.equal("light" in senses, false, "eyes shut");
});
