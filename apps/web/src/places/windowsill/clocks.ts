// The kitchen's two clocks, both telling the real time: the wind-up alarm
// clock on the sill (packages/world/src/windowsill.ts, ALARM_CLOCK) and the
// clock on the kitchen's far wall. Their dials are drawn in the glaze's
// fragment shader (scene/clock.ts): the marks and the hands cost no geometry
// and no draw of their own, and turn by one uniform.

import { ALARM_CLOCK } from "@fly/world";
import { CLOCK_GLSL, onDial } from "../../scene/clock.ts";
import type { Dial } from "../../scene/clock.ts";
import { WALL_CLOCK } from "./room.ts";

/** The alarm clock's dial: a flat face just in front of the case, inside the bezel. */
export const ALARM_DIAL: Dial = { centre: { x: ALARM_CLOCK.x, y: ALARM_CLOCK.y, z: ALARM_CLOCK.z + ALARM_CLOCK.depth / 2 + 1.6 }, up: { x: 0, y: 1, z: 0 }, right: { x: 1, y: 0, z: 0 }, radius: ALARM_CLOCK.r - 8.3 };

/** The clock on the kitchen's far wall faces the window: its dial is the front of its case, inside the rim. */
const WALL_DIAL: Dial = { centre: WALL_CLOCK.face, up: { x: 0, y: 1, z: 0 }, right: { x: -1, y: 0, z: 0 }, radius: WALL_CLOCK.dial };

/** The hour the alarm is set for, on the alarm clock's brass hand. */
const ALARM_AT = 6.5;

/** For the glaze's fragment shader: what goes in its common chunk, and what draws the dials over the colour. */
export const CLOCK_FACES = {
  common: /* glsl */ `${CLOCK_GLSL}
const vec3 CLOCK_INK = vec3(0.05, 0.045, 0.04);
const vec3 CLOCK_RED = vec3(0.7, 0.07, 0.05);
const vec3 CLOCK_BRASS = vec3(0.78, 0.58, 0.24);
// The alarm clock's hour and minute hands: black spades.
float alarmHands(vec2 q, float px) {
  float h = uClockHands.x;
  float m = uClockHands.y;
  float hour = max(clockHand(q, h, 0.5, 0.13, 0.075, 0.03, px), clockSpot(q, clockAlong(h, 0.4), 0.08, px));
  float minute = max(clockHand(q, m, 0.84, 0.15, 0.055, 0.018, px), clockSpot(q, clockAlong(m, 0.66), 0.05, px));
  return max(hour, minute);
}
// The wall clock's: plain black batons.
float wallHands(vec2 q, float px) {
  return max(clockHand(q, uClockHands.x, 0.52, 0.12, 0.065, 0.045, px), clockHand(q, uClockHands.y, 0.8, 0.14, 0.045, 0.03, px));
}`,
  color: /* glsl */ `
{
  vec3 d = ${onDial(ALARM_DIAL)};
  if (abs(d.z) < 0.3 && length(d.xy) < 1.0) {
    vec2 q = d.xy;
    float px = length(fwidth(q));
    // A minute track, bold batons at the hours and two at twelve, a fine ring round the edge.
    float twelve = step(0.5, q.y) * (1.0 - step(0.2, abs(q.x)));
    float batons = clockTicks(q, 12.0, 0.7, 0.93, 0.06, px) * (1.0 - twelve);
    batons = max(batons, twelve * (1.0 - smoothstep(-px, px, max(abs(abs(q.x) - 0.045) - 0.022, abs(q.y - 0.815) - 0.115))));
    float marks = max(max(clockTicks(q, 60.0, 0.85, 0.93, 0.016, px), batons), clockRing(q, 0.955, 0.975, px));
    vec3 c = mix(diffuseColor.rgb, CLOCK_INK, marks);
    // The alarm, set: a thin brass hand with an arrow's head.
    float a = ${((ALARM_AT / 12) * Math.PI * 2).toFixed(4)};
    float alarm = max(clockHand(q, a, 0.6, 0.0, 0.022, 0.022, px), clockHand(q, a, 0.72, -0.56, 0.36, 0.0, px));
    float s = uClockHands.z;
    float second = max(clockHand(q, s, 0.88, 0.24, 0.016, 0.009, px), clockSpot(q, clockAlong(s, -0.17), 0.045, px));
    // The hands stand off the dial: their shadow falls a little down and to the side.
    vec2 off = vec2(-0.02, 0.03);
    float shade = max(max(alarmHands(q + off, px), clockHand(q + off, s, 0.88, 0.24, 0.016, 0.009, px)), clockHand(q + off * 0.6, a, 0.6, 0.0, 0.022, 0.022, px));
    c *= 1.0 - 0.28 * shade;
    c = mix(c, CLOCK_BRASS, alarm);
    c = mix(c, CLOCK_INK, alarmHands(q, px));
    c = mix(c, CLOCK_RED, second);
    c = mix(c, CLOCK_INK, clockSpot(q, vec2(0.0), 0.06, px));
    c = mix(c, CLOCK_BRASS, clockSpot(q, vec2(0.0), 0.024, px));
    diffuseColor.rgb = c;
  }
  d = ${onDial(WALL_DIAL)};
  if (abs(d.z) < 0.5 && length(d.xy) < 1.0) {
    vec2 q = d.xy;
    float px = length(fwidth(q));
    float marks = max(clockTicks(q, 60.0, 0.88, 0.95, 0.012, px), clockTicks(q, 12.0, 0.74, 0.95, 0.045, px));
    vec3 c = mix(diffuseColor.rgb, CLOCK_INK, marks);
    vec2 off = vec2(0.015, 0.025);
    float second = max(clockHand(q, uClockHands.z, 0.86, 0.2, 0.012, 0.008, px), clockSpot(q, vec2(0.0), 0.035, px));
    c *= 1.0 - 0.25 * max(wallHands(q + off, px), clockHand(q + off, uClockHands.z, 0.86, 0.2, 0.012, 0.008, px));
    c = mix(c, CLOCK_INK, max(wallHands(q, px), clockSpot(q, vec2(0.0), 0.05, px)));
    c = mix(c, CLOCK_RED, second);
    diffuseColor.rgb = c;
  }
}`,
};
