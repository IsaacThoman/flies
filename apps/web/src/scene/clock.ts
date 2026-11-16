// The clocks in the places tell the real time. Their hands are drawn in the
// dial's own material, in its fragment shader, turned by three angles that
// follow the clock outside the game: nothing is rebuilt and nothing is
// allocated as they turn, they cost no draw of their own, and they stay crisp
// however close the camera comes.
//
// They tell the real time whatever light the player has chosen. A clock that
// showed some other time would be a broken clock, and a twelve-hour dial
// can't tell morning from evening, so three o'clock under the night's light
// reads as three in the morning rather than as wrong.

import * as THREE from "three";

/** Where a clock's hands point: radians clockwise from twelve. */
export type HandAngles = { hour: number; minute: number; second: number };

const TAU = Math.PI * 2;
const HALF_DAY = 12 * 3600;

/**
 * Where the hands point at a moment (ms since 1970), in a time zone this many
 * minutes behind UTC (as `Date.getTimezoneOffset` gives it). The hour and
 * minute hands move on continuously, and the second hand sweeps.
 */
export function handAngles(ms: number, offsetMinutes: number, out: HandAngles = { hour: 0, minute: 0, second: 0 }): HandAngles {
  const local = ms / 1000 - offsetMinutes * 60;
  const t = ((local % HALF_DAY) + HALF_DAY) % HALF_DAY;
  out.hour = (t / HALF_DAY) * TAU;
  out.minute = ((t % 3600) / 3600) * TAU;
  out.second = ((t % 60) / 60) * TAU;
  return out;
}

/** The hands as a uniform for a dial's material (`uClockHands`: x the hour hand, y the minute, z the second), kept to the time. */
export class WallClock {
  readonly hands = { value: new THREE.Vector3() };
  #angles: HandAngles = { hour: 0, minute: 0, second: 0 };
  #date = new Date();
  #offset = 0;
  #checked = -Infinity;

  /** Sets the hands to the time now. Call it from the place's `update`. */
  update(ms = Date.now()) {
    // The zone's offset changes when the clocks go forward or back: looked at again once a minute.
    if (Math.abs(ms - this.#checked) > 60_000) {
      this.#date.setTime(ms);
      this.#offset = this.#date.getTimezoneOffset();
      this.#checked = ms;
    }
    const a = handAngles(ms, this.#offset, this.#angles);
    this.hands.value.set(a.hour, a.minute, a.second);
  }
}

/** Where a dial is in the world (mm): its middle, the way twelve o'clock is and the way three o'clock is (unit vectors in its face; it faces their cross product, three × twelve), and its radius. */
export type Dial = { centre: THREE.Vector3Like; up: THREE.Vector3Like; right: THREE.Vector3Like; radius: number };

const glslVec = (v: THREE.Vector3Like) => `vec3(${v.x.toFixed(4)}, ${v.y.toFixed(4)}, ${v.z.toFixed(4)})`;

/**
 * A dial's own coordinates of a world point, as a GLSL expression: `xy` in
 * the dial's radii (x toward three, y toward twelve), `z` how far in front of
 * its face (mm). A fragment is on the dial when `|z|` is under a fraction of a
 * millimetre and `length(xy)` under 1.
 */
export const onDial = (dial: Dial, world = "vWorld") => {
  const n = new THREE.Vector3().crossVectors(new THREE.Vector3().copy(dial.right), new THREE.Vector3().copy(dial.up));
  return `clockDial(${world} - ${glslVec(dial.centre)}, ${glslVec(dial.right)}, ${glslVec(dial.up)}, ${glslVec(n)}, ${dial.radius.toFixed(4)})`;
};

/**
 * The shader's side: the hands' uniform, and shapes to draw a dial with, all
 * in the dial's radii, their edges smoothed over `px`, the size of a pixel on
 * the dial (`length(fwidth(q))`). Put it in the fragment shader's `common`.
 */
export const CLOCK_GLSL = /* glsl */ `
uniform vec3 uClockHands;
vec3 clockDial(vec3 d, vec3 right, vec3 up, vec3 normal, float radius) { return vec3(dot(d, right) / radius, dot(d, up) / radius, dot(d, normal)); }
// How much of a hand covers q: from tail behind the middle to len out along angle (clockwise from twelve), w0 wide at the middle narrowing (or widening) to w1 at its tip.
float clockHand(vec2 q, float angle, float len, float tail, float w0, float w1, float px) {
  vec2 along = vec2(sin(angle), cos(angle));
  float a = dot(q, along);
  float c = abs(q.x * along.y - q.y * along.x);
  float w = mix(w0, w1, clamp(a / len, 0.0, 1.0)) * 0.5;
  float d = max(c - w, max(-a - tail, a - len));
  return 1.0 - smoothstep(-px, px, d);
}
// A round spot of radius r at p: a hand's boss, a counterweight.
float clockSpot(vec2 q, vec2 p, float r, float px) {
  return 1.0 - smoothstep(-px, px, length(q - p) - r);
}
// The point len out along a hand at angle.
vec2 clockAlong(float angle, float len) { return vec2(sin(angle), cos(angle)) * len; }
// n marks round the dial, from radius r0 out to r1, each w wide.
float clockTicks(vec2 q, float n, float r0, float r1, float w, float px) {
  float r = length(q);
  float sector = 6.2831853 / n;
  float a = atan(q.x, q.y + 1e-6);
  float m = (mod(a + sector * 0.5, sector) - sector * 0.5) * r;
  float d = max(abs(m) - w * 0.5, max(r0 - r, r - r1));
  return 1.0 - smoothstep(-px, px, d);
}
// A ring between radii r0 and r1.
float clockRing(vec2 q, float r0, float r1, float px) {
  float r = length(q);
  return (1.0 - smoothstep(-px, px, r - r1)) * smoothstep(-px, px, r - r0);
}
`;
