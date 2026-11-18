// The last few seconds of the followed fly's nervous system, kept so that
// "Why?" (the View tool) can play them back: each region's firing rate as the
// nervous-system display gets it, the rate of each group of neurons a command
// is read from, the commands, every sense as the body sent it, and what the
// body did with the commands. Nothing here is inferred: it is a copy of what
// went into and came out of the brain, at a steady 30 samples a second.
//
// One ring of floats, allocated once; a sample is a copy of under a hundred
// numbers, and a frame between samples only keeps each value's peak, so that a
// burst shorter than a sample (the giant fiber's) is not missed.

import { REGIONS } from "@fly/brain";
import type { BrainSenses, BrainState } from "@fly/brain";
import type { Intent } from "@fly/body";
import { AIR_TURN_RATE, STANDING_TURN, TURN_RATE } from "@fly/body";
import { SOMA_GROUPS } from "@fly/fly";
import { COMMAND_ORDER } from "@fly/contracts";
import { SENSES, meanLight } from "../stats/panel.ts";

/** Samples a second of fly time, and how many seconds are kept. */
export const SAMPLE_HZ = 30;
export const KEPT_SECONDS = 6;
export const CAPACITY = SAMPLE_HZ * KEPT_SECONDS;

/**
 * What the body did with the commands, most striking first: a take-off (the
 * giant fiber passed ESCAPE_ON), feeding, backing up, grooming, singing, a
 * turn either way, walking. Each is the body's own state (Behavior's intent),
 * so it starts exactly when the body acted on the command.
 */
export const ACTIONS = ["takeoff", "feed", "back", "groom", "sing", "turnLeft", "turnRight", "walk"] as const;
export type Action = (typeof ACTIONS)[number];

/** Smoothed steering past this share of full is a turn, as walking starts past WALK_ON. */
export const TURN_ON = 0.3;
/** Grooming shows in the pose above this (life.ts calls it grooming from here). */
export const GROOM_ON = 0.05;

/** Where each kind of number is in a sample. */
export const AT = {
  regions: 0,
  rates: REGIONS.length,
  commands: REGIONS.length + SOMA_GROUPS.length,
  senses: REGIONS.length + SOMA_GROUPS.length + COMMAND_ORDER.length,
  actions: REGIONS.length + SOMA_GROUPS.length + COMMAND_ORDER.length + SENSES.length,
} as const;
export const STRIDE = AT.actions + 1;

/** What the recorder reads from the followed fly once a frame. */
export type Recorded = {
  /** Each region's smoothed rate, in REGIONS order (BrainDriver.regionRates). */
  regionRates: Float32Array;
  state: BrainState | null;
  sensed: BrainSenses;
  intent: Intent;
  onFeet: boolean;
  /** It took off this frame (FlyBody.events.jumped). */
  jumped: boolean;
};

/** The actions the body is doing now, one bit each in ACTIONS order. */
export function actionsOf(intent: Intent, onFeet: boolean, jumped: boolean): number {
  let bits = 0;
  if (jumped) bits |= 1 << 0;
  if (intent.feeding) bits |= 1 << 1;
  if (intent.backing) bits |= 1 << 2;
  if (intent.groom > GROOM_ON) bits |= 1 << 3;
  if (intent.singing) bits |= 1 << 4;
  // The body's smoothed steering, back from the yaw rate it asked for: positive turns it toward its left.
  const steer = onFeet ? intent.yawRate / (TURN_RATE * (intent.walking || intent.backing ? 1 : STANDING_TURN)) : intent.airYawRate / AIR_TURN_RATE;
  if (steer >= TURN_ON) bits |= 1 << 5;
  if (steer <= -TURN_ON) bits |= 1 << 6;
  if (intent.walking) bits |= 1 << 7;
  return bits;
}

const LIGHT = SENSES.findIndex(([key]) => key === "light");
const TURN = AT.commands + COMMAND_ORDER.indexOf("turn");
const RATE_NAMES = SOMA_GROUPS.map((g) => g.rate);

/** The senses and commands in the order readNow reads them, which must be SENSES' and COMMAND_ORDER's (a test holds it). */
export const READ_SENSES = ["loomLeft", "loomRight", "touch", "bumpLeft", "bumpRight", "wind", "sweet", "bitter", "water", "grounded", "maleTaste", "wingbeat", "legs", "light", "hunger", "thirst"] as const;
export const READ_COMMANDS = ["walk", "turn", "back", "escape", "wings", "groom", "feed", "sing", "lean"] as const;

/**
 * This frame's rates, commands and senses into `out` at their places in a
 * sample (light left at 0: it is read only when a sample is written). The
 * commands and senses are read by name: in V8 a read of a fraction by a
 * computed name boxes it, a small allocation every frame. The rates, whose
 * names have spaces, are a dictionary, whose numbers are boxed already.
 */
function readNow(state: BrainState, s: BrainSenses, out: Float32Array) {
  const rates = state.stats.rates;
  for (let g = 0; g < RATE_NAMES.length; g++) out[AT.rates + g] = rates[RATE_NAMES[g]] ?? 0;
  const c = state.command, k = AT.commands;
  out[k] = c.walk;
  out[k + 1] = c.turn;
  out[k + 2] = c.back;
  out[k + 3] = c.escape;
  out[k + 4] = c.wings;
  out[k + 5] = c.groom;
  out[k + 6] = c.feed;
  out[k + 7] = c.sing;
  const n = AT.senses;
  out[n] = s.loomLeft;
  out[n + 1] = s.loomRight;
  out[n + 2] = s.touch;
  out[n + 3] = s.bumpLeft;
  out[n + 4] = s.bumpRight;
  out[n + 5] = s.wind;
  out[n + 6] = s.sweet;
  out[n + 7] = s.bitter;
  out[n + 8] = s.water;
  out[n + 9] = s.grounded ? 1 : 0;
  out[n + 10] = s.maleTaste;
  out[n + 11] = s.wingbeat;
  out[n + 12] = Math.max(s.legsLeft ?? 0, s.legsRight ?? 0);
  out[n + 13] = 0;
  out[n + 14] = s.hunger ?? 1;
  out[n + 15] = s.thirst ?? 1;
}

/** Seconds kept in order, oldest first: what the recorder had when it was asked. */
export class Clip {
  readonly data = new Float32Array(CAPACITY * STRIDE);
  /** Samples in it. */
  length = 0;

  /** The `field`th number of sample `i`. */
  at(i: number, field: number): number {
    return this.data[i * STRIDE + field];
  }

  /** Whether the body was doing `action` at sample `i`. */
  doing(i: number, action: number): boolean {
    return ((this.data[i * STRIDE + AT.actions] >> action) & 1) === 1;
  }
}

export class Recorder {
  readonly #ring = new Float32Array(CAPACITY * STRIDE);
  /** The next sample to write, and how many are kept. */
  #head = 0;
  #count = 0;
  #since = 0;
  /** Each value's peak since the last sample (the steering's by size, keeping its sign), and the actions seen. */
  readonly #peak = new Float32Array(STRIDE);
  readonly #now = new Float32Array(STRIDE);
  #fresh = true;
  #actions = 0;

  get length() {
    return this.#count;
  }

  /** Once a frame, after the fly's life step: `dt` seconds of fly time. Allocates nothing. */
  record(dt: number, r: Recorded) {
    const state = r.state;
    // Before the brain's first answer there is nothing it did to look back on.
    if (!state || !(dt > 0)) return;
    const now = this.#now;
    readNow(state, r.sensed, now);
    const peak = this.#peak;
    const fresh = this.#fresh;
    for (let i = AT.rates; i < AT.actions; i++) {
      const v = now[i];
      if (fresh || (i === TURN ? Math.abs(v) > Math.abs(peak[i]) : v > peak[i])) peak[i] = v;
    }
    const doing = actionsOf(r.intent, r.onFeet, false);
    this.#actions |= doing | (r.jumped ? 1 : 0);
    this.#fresh = false;
    this.#since += dt;
    const step = 1 / SAMPLE_HZ;
    // A long frame (a hitch) holds its values over the samples it spans; a take-off is in the first of them only.
    while (this.#since >= step) {
      this.#since -= step;
      this.#write(r, this.#actions);
      this.#actions = doing;
    }
    if (this.#fresh) this.#actions = 0;
  }

  #write(r: Recorded, actions: number) {
    const ring = this.#ring, peak = this.#peak;
    const o = this.#head * STRIDE;
    const regions = r.regionRates;
    for (let i = 0; i < REGIONS.length; i++) ring[o + AT.regions + i] = regions[i] ?? 0;
    for (let i = AT.rates; i < AT.actions; i++) ring[o + i] = peak[i];
    ring[o + AT.senses + LIGHT] = meanLight(r.sensed.light);
    ring[o + AT.actions] = actions;
    this.#head = (this.#head + 1) % CAPACITY;
    if (this.#count < CAPACITY) this.#count++;
    this.#fresh = true;
  }

  /** Copies what is kept into `clip`, oldest first. */
  copyTo(clip: Clip) {
    const n = this.#count;
    const first = (this.#head - n + CAPACITY) % CAPACITY;
    const tail = Math.min(n, CAPACITY - first);
    clip.data.set(this.#ring.subarray(first * STRIDE, (first + tail) * STRIDE), 0);
    if (tail < n) clip.data.set(this.#ring.subarray(0, (n - tail) * STRIDE), tail * STRIDE);
    clip.length = n;
  }
}
