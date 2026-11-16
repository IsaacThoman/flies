// The street's moving light in the room: passing cars' headlamps sweeping the
// ceiling and the walls, the lamp outside, the neon across the road. The
// cars are a fixed timetable (a function of the time alone), so the car
// whose lamps sweep the room is the one the backdrop draws going by
// (street.ts reads the same `TRAFFIC`).
//
// How the room takes it: a material puts STREET_LIGHT_GLSL in its fragment
// shader after three.js's common chunk, merges `streetLightUniforms` into
// its uniforms as it compiles (Object.assign(shader.uniforms,
// streetLightUniforms): every material shares the one object), and adds
//
//   reflectedLight.directDiffuse += streetLight(vWorld, vWorldNormal) * diffuseColor.rgb;
//
// after the lights are summed (#include <lights_fragment_end>), with vWorld
// and vWorldNormal the fragment's world position (mm) and normal. The set's
// update calls updateStreetLight(time, light, weather) each frame. What
// comes back is already the light falling on the point (cosine and 1/π in
// it), shaped by the shop front: it comes only through the glass, and the
// mullions, the transom, the ledge, the door's posts and rails and the wall
// round them cast their shadows, sharp near the glass and soft far off.
// Nothing in the room shadows it (a table under the window is lit through
// another table): with a few lights that move it is hardly seen, and it
// would cost every pixel of every material.

import * as THREE from "three";
import { DINING_ROOM, SHOPFRONT } from "@fly/world";
import type { Daylight } from "../../scene/light.ts";
import type { Weather } from "../../scene/weather.ts";
import { CORNER_BAR, DOOR_RAIL, HEADLAMPS, NEAR_LAMP, STREET } from "./street/layout.ts";

/** Each lane of the road: where it runs, which way, and how often a car may come along it (s): one at a time, so the room has at most one car's light per lane. */
const LANES = [
  { z: STREET.lanes[0], heading: 1, period: 29, salt: 11 },
  { z: STREET.lanes[1], heading: -1, period: 37, salt: 23 },
];
/** Of the times a car may come, how many it does. */
const BUSY = 0.62;

/** A car on the road now. */
export type Car = {
  /** Its middle along the street, and across it (mm). */
  x: number;
  z: number;
  /** Which way it goes along x: +1 or -1. */
  heading: number;
  /** 1 while it is on the street, easing to 0 at either end; 0 for none. */
  on: number;
  /** Which car it is (its colour and shape): the same all the way along. */
  look: number;
  length: number;
};

/** What the street is doing now, filled by `traffic`: the cars, and how bright the lamps, headlamps and neon are. */
export const TRAFFIC = {
  time: Number.NaN,
  cars: LANES.map((): Car => ({ x: 0, z: 0, heading: 1, on: 0, look: 0, length: 4400 })),
  /** 0 by day to 1 at night: the street lamps are lit by it, and the lit windows. */
  dark: 0,
  /** The street lamps, 0 off to 1. */
  lamps: 0,
  /** Headlamps: on after dark, and by day in rain and mist. */
  headlamps: 0,
  /** The corner bar's neon, flickering now and then. */
  neon: 0,
};

/** A number from 0 to 1 for an integer and a salt, the same every time. */
function hash(n: number, salt: number) {
  let h = Math.imul((n | 0) ^ Math.imul(salt, 0x9e3779b1), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Where car slot k of a lane is at a time, into `car` (on 0 if it isn't there). */
function place(lane: (typeof LANES)[number], k: number, time: number, car: Car) {
  const span = STREET.reach * 2;
  const speed = 8500 + 5500 * hash(k, lane.salt + 1);
  const takes = span / (speed / 1000) / 1000;
  const start = k * lane.period + (lane.period - takes) * hash(k, lane.salt + 2);
  const along = (time - start) * speed;
  car.on = 0;
  if (hash(k, lane.salt) > BUSY || along < 0 || along > span) return;
  car.x = -lane.heading * STREET.reach + lane.heading * along;
  car.z = lane.z;
  car.heading = lane.heading;
  // Fades in and out at the ends of the street, too far off to be seen coming or going.
  car.on = smooth(0, 15_000, along) * smooth(0, 15_000, span - along);
  car.look = Math.floor(hash(k, lane.salt + 3) * 64);
  car.length = 3900 + 1000 * hash(k, lane.salt + 4);
}

/**
 * The neon's tube is failing: now and then, for a second or so, it
 * stutters, and otherwise it hums.
 */
function flicker(time: number) {
  const spell = Math.floor(time / 41);
  const at = spell * 41 + hash(spell, 5) * 36;
  if (hash(spell, 6) < 0.6 && time > at && time < at + 1.4) return hash(Math.floor(time * 15), 7) < 0.45 ? 0.1 : 0.9;
  return 1 - 0.05 * hash(Math.floor(time * 24), 8);
}

/** Moves the street on to a time and a light: the cars (placed once a frame, though both the room and the backdrop ask), the lamps, the neon. */
export function traffic(time: number, light: Daylight, weather: Weather) {
  if (time !== TRAFFIC.time) {
    TRAFFIC.time = time;
    for (let i = 0; i < LANES.length; i++) {
      const lane = LANES[i];
      place(lane, Math.floor(time / lane.period), time, TRAFFIC.cars[i]);
    }
  }
  const dark = smooth(0.08, 0.6, light.stars);
  TRAFFIC.dark = dark;
  // The lamps' cells switch them on at dusk, and on a dark wet day.
  TRAFFIC.lamps = Math.max(smooth(0.12, 0.35, light.stars), 0.7 * weather.rain * weather.cloud);
  TRAFFIC.headlamps = Math.max(dark, 0.8 * Math.max(weather.rain, weather.mist));
  TRAFFIC.neon = smooth(0.2, 0.55, light.stars) * flicker(time);
  return TRAFFIC;
}

const f = (n: number) => n.toFixed(1);
const GLASS = SHOPFRONT.glass;
const { door, mullion, transom, ledge } = SHOPFRONT;
/** The big panes' mullions are evenly spaced: the nearest one is found with a modulus. */
const BAY = SHOPFRONT.mullions[1] - SHOPFRONT.mullions[0];

/** The lamps' and the neon's light, as linear RGB at a metre. */
const LAMP_LIGHT = new THREE.Color(1.0, 0.72, 0.42).multiplyScalar(25);
const STREET_GLOW = new THREE.Color(0.55, 0.5, 0.48).multiplyScalar(25);
const NEON_LIGHT = new THREE.Color(1.0, 0.16, 0.42).multiplyScalar(45);
const HEADLAMP = 2500;

export const STREET_LIGHT_GLSL = /* glsl */ `
uniform vec3 uStreetLamp;
uniform vec3 uStreetFar;
uniform vec4 uStreetCar[2];
uniform float uStreetWet;
uniform float uStreetTime;
// Light from far along a way with these slopes (across and up, per mm toward the glass), crossing the shop front at q: how much comes through the glass, w the penumbra there (mm).
float streetOpening(vec2 q, vec2 slope, float w) {
  // A bar's shadow widens with its depth as the light slants.
  float post = ${f(mullion.half)} + slope.x * ${f(mullion.depth * 0.5)};
  float rail = ${f(transom.half + 10)} + slope.y * ${f(transom.depth * 0.5)};
  float open = smoothstep(${f(-DINING_ROOM.hx)} - w, ${f(-DINING_ROOM.hx)} + w, q.x) * (1.0 - smoothstep(${f(door.x1 - mullion.half)} - w, ${f(door.x1 - mullion.half)} + w, q.x));
  open *= 1.0 - smoothstep(${f(SHOPFRONT.head)} - w, ${f(SHOPFRONT.head)} + w, q.y);
  float sill = q.x < ${f(door.x0)} ? ${f(ledge.top)} : ${f(DOOR_RAIL)};
  open *= smoothstep(sill - w, sill + w, q.y);
  float m = q.x < ${f(door.x0 - 80)} ? abs(mod(q.x - ${f(SHOPFRONT.mullions[0] - BAY / 2)}, ${f(BAY)}) - ${f(BAY / 2)}) : min(abs(q.x - ${f(door.x0)}), abs(q.x - ${f(door.x1)}));
  open *= smoothstep(post - w, post + w, m);
  open *= smoothstep(rail - w, rail + w, abs(q.y - ${f((transom.y + door.head) / 2)}));
  return open;
}
// Water running down the outside of the glass: wavering rivulets, each a little lens, brightening a line of the light through it and darkening its edges.
float streetRunning(vec2 q, float w) {
  float x = q.x / 70.0 + 0.35 * sin(q.y * 0.006 + floor(q.x / 70.0) * 2.3);
  float col = floor(x);
  float h = fract(sin(col * 91.7) * 43758.5);
  float d = abs(fract(x) - 0.5) * 70.0;
  float flow = 0.6 + 0.4 * sin(q.y * 0.02 + uStreetTime * (2.0 + 3.0 * h));
  float lens = (1.0 - smoothstep(2.0, 6.0, d)) * 0.9 - (1.0 - smoothstep(6.0, 11.0, d)) * smoothstep(3.0, 6.0, d) * 0.5;
  return lens * step(0.45, h) * flow * (1.0 - smoothstep(4.0, 30.0, w));
}
// The light from a small lamp at h (size across, mm) reaching p, facing n, through the glass: its cosine over the distance squared (in metres), and the way to it in l.
float streetReach(vec3 p, vec3 n, vec3 h, float size, out vec3 l) {
  vec3 d = h - p;
  float len = length(d);
  l = d / len;
  float dz = max(d.z, 1.0);
  float t = (${f(GLASS)} - p.z) / dz;
  vec2 q = p.xy + d.xy * t;
  float w = 1.0 + size * t;
  float through = streetOpening(q, abs(d.xy) / dz, w) * (1.0 + uStreetWet * streetRunning(q, w));
  return through * step(p.z, ${f(GLASS)}) * max(dot(n, l), 0.0) * 1e6 / (len * len);
}
vec3 streetLight(vec3 p, vec3 n) {
  vec3 light = vec3(0.0);
  vec3 l;
  if (uStreetLamp.r + uStreetFar.r > 0.0) {
    // The lantern outside throws most of its light down and out, the street across (its lamps, its lit windows, the neon) a soft glow from low down.
    float lamp = streetReach(p, n, vec3(${f(NEAR_LAMP.x)}, ${f(NEAR_LAMP.y)}, ${f(NEAR_LAMP.z)}), 140.0, l);
    light += uStreetLamp * lamp * (0.3 + 0.7 * smoothstep(-0.1, 0.8, l.y));
    light += uStreetFar * streetReach(p, n, vec3(${f(CORNER_BAR.neon.x)}, ${f(CORNER_BAR.neon.y)}, ${f(CORNER_BAR.neon.z)}), 3000.0, l);
  }
  for (int i = 0; i < 2; i++) {
    vec4 car = uStreetCar[i];
    if (car.w <= 0.0) continue;
    float k = streetReach(p, n, vec3(car.x, ${f(STREET.road + HEADLAMPS)}, car.y), 220.0, l);
    // Along its heading, from the car to the point: the headlamps throw ahead in a cone, the tail lights a dim red behind.
    float ahead = -l.x * car.z;
    float beam = max(ahead, 0.0);
    beam *= beam;
    beam *= beam;
    beam *= beam;
    float behind = max(-ahead, 0.0);
    light += (vec3(1.0, 0.95, 0.86) * beam + vec3(0.04, 0.0, 0.0) * behind * behind) * (car.w * k);
  }
  return light * ${f(1 / Math.PI)};
}
`;

/** The uniforms STREET_LIGHT_GLSL reads: one object for every material in the room, filled by updateStreetLight. */
export const streetLightUniforms = {
  /** The lamp outside's light (0 by day). */
  uStreetLamp: { value: new THREE.Color(0, 0, 0) },
  /** The street across: its glow, and the neon. */
  uStreetFar: { value: new THREE.Color(0, 0, 0) },
  /** Each lane's car: where it is (x, z), its heading, and its headlamps' strength (0: none). */
  uStreetCar: { value: [new THREE.Vector4(), new THREE.Vector4()] },
  /** How much water runs on the glass. */
  uStreetWet: { value: 0 },
  uStreetTime: { value: 0 },
};

const neon = new THREE.Color();

/** Fills the street's light for this frame. By day it fades out: the room is lit by the day, and the lamps are off. */
export function updateStreetLight(time: number, light: Daylight, weather: Weather) {
  const t = traffic(time, light, weather);
  const u = streetLightUniforms;
  const dark = t.dark;
  u.uStreetLamp.value.copy(LAMP_LIGHT).multiplyScalar(t.lamps * dark);
  u.uStreetFar.value.copy(STREET_GLOW).multiplyScalar(t.lamps * dark).add(neon.copy(NEON_LIGHT).multiplyScalar(t.neon));
  for (let i = 0; i < t.cars.length; i++) {
    const car = t.cars[i];
    u.uStreetCar.value[i].set(car.x, car.z, car.heading, car.on * t.headlamps * dark * HEADLAMP);
  }
  u.uStreetWet.value = Math.max(weather.rain, weather.wet * 0.4);
  u.uStreetTime.value = time;
}
