// The fly's skeleton: from a FlyPose and the time step, the frame of every
// rigid piece of exoskeleton, written straight into the arrays the vertex
// shaders read. There are no Object3Ds per joint and nothing is allocated
// here after construction: each frame is a few hundred multiplies and some
// trigonometry, which matters on a JavaScript engine with no JIT.
//
// What the rig adds that the pose does not ask for, the small movements of a
// live fly at rest (head and antennae turning, the abdomen breathing, a foot
// shifting now and then), is animation, not behaviour: it never moves the
// fly, and it stops whenever the pose asks for anything else.

import { copy, identity, multiply, rotateX, rotateY, rotateZ, scaleX, setFrame, transformPoint, translate } from "./affine.ts";
import {
  BODY_JOINTS, EYE, FOOT_CLEARANCE, HEAD, J, LEG_COUNT, LEG_SEGMENTS, LEGS, PIVOT, PROBOSCIS, THORAX,
  WING_COPIES, WING_JOINTS, legPair, legSide,
} from "./anatomy.ts";
import type { Vec3 } from "./anatomy.ts";
import type { FlyAnchor, FlyPose } from "@fly/contracts";
import { Gait } from "./gait.ts";
import { solveLeg } from "./leg.ts";
import type { LegInput } from "./leg.ts";

const TAU = Math.PI * 2;
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const finite = (x: number) => (Number.isFinite(x) ? x : 0);
/** The fraction of the way a first-order lag with time constant `tau` closes in `dt`. */
const lag = (dt: number, tau: number) => 1 - Math.exp(-dt / tau);
/** Moves `x` toward `target` by at most `rate` per second: limbs take a moment to get anywhere. */
const toward = (x: number, target: number, rate: number, dt: number) => (target > x ? Math.min(target, x + rate * dt) : Math.max(target, x - rate * dt));
/** Smoothstep on 0..1: eases a linear blend in and out. */
const ease = (x: number) => x * x * (3 - 2 * x);
const clamp01 = (x: number) => Math.min(1, Math.max(0, finite(x)));

/** Flight posture of the claws, tarsi and knees, thorax-relative, left side: front legs folded under the head, the others trailing. */
const TUCK: readonly { foot: Vec3; distal: Vec3; basal: Vec3; knee: Vec3 }[] = [
  { foot: [0.09, -0.3, 0.2], distal: [0.05, -0.35, -0.93], basal: [0.1, -0.9, -0.4], knee: [0.4, 0.3, 1] },
  { foot: [0.13, -0.27, -0.1], distal: [0.12, -0.45, -0.88], basal: [0.3, -0.8, -0.5], knee: [0.8, 0.5, 0] },
  { foot: [0.1, -0.22, -0.46], distal: [0.05, -0.3, -0.95], basal: [0.2, -0.6, -0.77], knee: [0.7, 0.6, -0.2] },
];

const ANCHOR_JOINT: Record<FlyAnchor, number> = { mouth: J.labellum, head: J.head, leftEye: J.head, rightEye: J.head, back: J.thorax };

export class FlyRig {
  /** Body joint frames, 12 floats each: the body mesh's uniform. */
  readonly joints = new Float32Array(BODY_JOINTS * 12);
  /** One frame per wing copy (left copies, then right), and each copy's opacity. */
  readonly wings = new Float32Array(WING_JOINTS * 12);
  readonly wingAlpha = new Float32Array(WING_JOINTS);
  /** Opacity of the blur between the copies. */
  wingHaze = 0;
  readonly gait: Gait;
  /** Each leg's rest foot position this frame, on the ground. */
  readonly home = new Float64Array(LEG_COUNT * 3);
  /** How far each claw is from where the rig wanted it, after solving. */
  readonly footError = new Float64Array(LEG_COUNT);
  time = 0;

  private crouch = 0;
  private feed = 0;
  private groom = 0;
  private beat = 0;
  private open = 0;
  private flight = 0;
  private tuck = 0;
  private groomBlend = 0;
  private airTime = 0;
  private airborne = false;
  private pitch = 0;
  private roll = 0;
  private dip = 0;
  private dipVelocity = 0;
  private speed = 0;
  private turn = 0;

  private groomPhase = 0;
  private boutPhase = 0;
  private readonly seed = new Uint32Array([0x2545f491]);
  private readonly idle = new Float64Array(8); // head yaw, pitch; antenna L yaw, pitch; R yaw, pitch; spare
  private readonly idleTarget = new Float64Array(8);
  private nextHead = 0.5;
  private nextAntenna = 0.3;
  private nextFidget = 3;
  private readonly fidget = new Float64Array(LEG_COUNT * 3);
  /** Each knee's bend direction from the last frame. */
  private readonly bends = new Float64Array(LEG_COUNT * 3);

  private readonly hipLocal = new Float64Array(LEG_COUNT * 3);
  private readonly coxaLocal = new Float64Array(LEG_COUNT * 3);
  private readonly restHome = new Float64Array(LEG_COUNT * 3);
  private readonly scratch = new Float64Array(24);
  private readonly frame = new Float64Array(24);
  private readonly leg: LegInput = {
    hip: new Float64Array(3), coxaRest: new Float64Array(3), foot: new Float64Array(3),
    distal: new Float64Array(3), basal: new Float64Array(3), pole: new Float64Array(3),
  };

  constructor() {
    for (let leg = 0; leg < LEG_COUNT; leg++) {
      const spec = LEGS[legPair(leg)], side = legSide(leg), i = leg * 3;
      this.hipLocal[i] = spec.hip[0] * side - PIVOT.thorax[0];
      this.hipLocal[i + 1] = spec.hip[1] - PIVOT.thorax[1];
      this.hipLocal[i + 2] = spec.hip[2] - PIVOT.thorax[2];
      const l = Math.hypot(...spec.coxaDir);
      this.coxaLocal[i] = (spec.coxaDir[0] * side) / l;
      this.coxaLocal[i + 1] = spec.coxaDir[1] / l;
      this.coxaLocal[i + 2] = spec.coxaDir[2] / l;
      this.restHome[i] = spec.foot[0] * side;
      this.restHome[i + 1] = 0;
      this.restHome[i + 2] = spec.foot[2];
    }
    this.home.set(this.restHome);
    this.gait = new Gait(this.home);
    this.update({ speed: 0, turn: 0, airborne: false, wings: 0, groom: 0, feed: 0, crouch: 0, pitch: 0, roll: 0 }, 0);
  }

  update(pose: FlyPose, dt: number): void {
    dt = Math.min(0.1, Math.max(0, finite(dt)));
    this.time += dt;
    const t = this.time;

    const speed = Math.max(-20, Math.min(20, finite(pose.speed)));
    const turn = Math.max(-30, Math.min(30, finite(pose.turn)));
    this.speed += (speed - this.speed) * lag(dt, 0.08);
    this.turn += (turn - this.turn) * lag(dt, 0.08);
    this.crouch += (clamp01(pose.crouch) - this.crouch) * lag(dt, 0.07);
    this.feed += (clamp01(pose.feed) - this.feed) * lag(dt, 0.16);
    this.groom += (clamp01(pose.groom) - this.groom) * lag(dt, 0.12);
    this.beat += (clamp01(pose.wings) - this.beat) * lag(dt, 0.05);
    const airborne = pose.airborne === true;
    const wantOpen = airborne || pose.wings > 0 ? 1 : 0;
    this.open += (wantOpen - this.open) * lag(dt, wantOpen > this.open ? 0.045 : 0.12);
    this.flight += ((airborne ? 1 : 0) - this.flight) * lag(dt, airborne ? 0.06 : 0.12);
    this.pitch += (Math.max(-1.6, Math.min(1.6, finite(pose.pitch))) - this.pitch) * lag(dt, 0.06);
    this.roll += (Math.max(-1.6, Math.min(1.6, finite(pose.roll))) - this.roll) * lag(dt, 0.06);

    // Take-off: the legs stay extended against the ground for a moment as the
    // body leaves it, then fold. Landing: they reach back out to their homes.
    if (airborne && !this.airborne) this.airTime = 0;
    if (!airborne && this.airborne) this.dipVelocity -= 0.6 * this.tuck;
    this.airborne = airborne;
    if (airborne) this.airTime += dt;
    const tuckTarget = airborne ? smooth(0.05, 0.22, this.airTime) : 0;
    // Legs fold up fast after take-off and reach out again a little more slowly to land.
    this.tuck = toward(this.tuck, tuckTarget, airborne ? 7 : 5, dt);
    const push = airborne ? 1 - smooth(0.0, 0.12, this.airTime) : 0;
    // A damped spring for the dip as the legs take the weight on landing.
    this.dipVelocity += (-180 * this.dip - 20 * this.dipVelocity) * dt;
    this.dip += this.dipVelocity * dt;
    this.dip = Math.max(-0.05, Math.min(0.02, this.dip));

    const ground = 1 - ease(this.tuck);
    const walking = Math.min(1, Math.sqrt(this.speed * this.speed + 0.12 * this.turn * this.turn) * 2);
    const busy = Math.max(walking, this.groom, this.feed, this.crouch, this.flight, this.open);
    this.updateIdle(dt, busy);

    // Grooming rhythm: sweeps over the eyes alternate with bouts of rubbing the legs together.
    const vigour = this.groom;
    this.groomPhase += dt * (2.2 + 2.6 * vigour);
    this.boutPhase += dt * 0.32;
    // A feeding fly keeps its front legs down: the head is bowed to the food
    // and the proboscis is out, so grooming waits until it has finished.
    this.groomBlend = toward(this.groomBlend, smooth(0.02, 0.3, this.groom) * (1 - smooth(0.1, 0.6, this.feed)), 5, dt);
    const groomOn = ease(this.groomBlend) * ground;
    const rub = smooth(0.25, 0.75, 0.5 - 0.5 * Math.cos(TAU * this.boutPhase));
    const sweep = 1 - rub;
    const sweepS = this.groomPhase - Math.floor(this.groomPhase);
    const stroke = sweepS < 0.62 ? smooth(0, 0.62, sweepS) : 1 - smooth(0.62, 1, sweepS);

    // Thorax.
    const gaitPhase = this.gait.phase;
    const bob = walking * 0.004 * Math.cos(TAU * 2 * gaitPhase);
    const sway = walking * 0.025 * Math.sin(TAU * gaitPhase);
    const breathe = Math.sin(TAU * 0.45 * t);
    const height = PIVOT.thorax[1] - 0.075 * this.crouch - 0.032 * this.feed - 0.012 * groomOn + bob + this.dip + 0.002 * breathe * (1 - walking);
    const noseDown = 0.07 * this.feed - 0.045 * groomOn + 0.03 * this.crouch;
    const jt = this.joints;
    identity(jt, 0);
    translate(jt, 0, PIVOT.thorax[0], height, PIVOT.thorax[2]);
    rotateY(jt, 0, sway * 0.4 + 0.02 * this.turn * walking);
    rotateX(jt, 0, noseDown - this.pitch * this.flight);
    rotateZ(jt, 0, this.roll * this.flight + sway * ground);

    // Head: idle glances, leading the turn, bowing to feed and into the grooming sweeps.
    const head = J.head * 12;
    const groomPitch = groomOn * sweep * (0.08 + 0.22 * stroke) * (0.6 + 0.4 * vigour);
    const groomRoll = groomOn * sweep * 0.14 * Math.sin(TAU * 2 * this.boutPhase);
    this.child(head, 0, PIVOT.neck, PIVOT.thorax, 1);
    rotateY(jt, head, this.idle[0] + 0.06 * this.turn * walking);
    rotateX(jt, head, this.idle[1] + 0.26 * this.feed + groomPitch - 0.1 * this.flight + 0.06 * this.crouch);
    rotateZ(jt, head, groomRoll);

    for (let side = 0; side < 2; side++) {
      const o = (J.antenna + side) * 12, sign = side === 0 ? 1 : -1;
      this.child(o, head, PIVOT.antenna, PIVOT.neck, sign);
      rotateY(jt, o, sign * this.idle[2 + side * 2]);
      rotateX(jt, o, this.idle[3 + side * 2] - 0.25 * this.flight + 0.15 * groomOn * rub);
    }

    this.proboscis(t);

    // Abdomen: breathing, held up in flight, bowed a little when feeding.
    const abd = J.abdomen * 12, tip = J.abdomenTip * 12;
    this.child(abd, 0, PIVOT.abdomen, PIVOT.thorax, 1);
    rotateX(jt, abd, 0.012 * breathe - 0.08 * this.flight + 0.03 * this.feed + 0.04 * this.crouch);
    rotateY(jt, abd, -sway * 0.5);
    this.child(tip, abd, PIVOT.abdomenTip, PIVOT.abdomen, 1);
    rotateX(jt, tip, 0.008 * breathe - 0.05 * this.flight + 0.02 * this.crouch);

    // Halteres beat in antiphase with the wings, far too fast to see: jitter them across their arc.
    const flutter = Math.max(this.beat, this.flight) * this.open;
    for (let side = 0; side < 2; side++) {
      const o = (J.haltere + side) * 12, sign = side === 0 ? 1 : -1;
      this.child(o, 0, PIVOT.haltere, PIVOT.thorax, sign);
      rotateX(jt, o, flutter * 0.7 * (this.random() * 2 - 1) + 0.04 * breathe);
    }

    this.legs(t, dt, push, groomOn, sweep, rub, sweepS, vigour);
    this.wingFrames();
  }

  /** Where an anchor is in the model's space. */
  anchorLocal(name: FlyAnchor, out: Float64Array): void {
    const s = this.scratch;
    let x = 0, y = 0, z = 0;
    switch (name) {
      case "mouth": x = PROBOSCIS.labellum * 0.75; break;
      case "head": x = HEAD.centre[0]; y = HEAD.centre[1] - PIVOT.neck[1]; z = HEAD.centre[2] - PIVOT.neck[2]; break;
      case "leftEye":
      case "rightEye": {
        const sign = name === "leftEye" ? 1 : -1;
        x = sign * (EYE.centre[0] + EYE.radii[0] * Math.cos(EYE.yaw));
        y = EYE.centre[1] - PIVOT.neck[1];
        z = EYE.centre[2] + EYE.radii[0] * Math.sin(EYE.yaw) - PIVOT.neck[2];
        break;
      }
      case "back": y = THORAX.centre[1] + THORAX.radii[1] + 0.02 - PIVOT.thorax[1]; break;
    }
    transformPoint(this.joints, ANCHOR_JOINT[name] * 12, x, y, z, s, 0);
    out[0] = s[0]; out[1] = s[1]; out[2] = s[2];
  }

  /** Joint `o` = parent `p` · T(pivot − parentPivot), with the pivot mirrored to the right side when `side` is -1. */
  private child(o: number, p: number, pivot: Vec3, parentPivot: Vec3, side: number): void {
    copy(this.joints, o, this.joints, p);
    translate(this.joints, o, pivot[0] * side - parentPivot[0], pivot[1] - parentPivot[1], pivot[2] - parentPivot[2]);
  }

  /** xorshift32, kept in a typed array so that storing it never boxes a number. */
  private random(): number {
    let x = this.seed[0];
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.seed[0] = x;
    return this.seed[0] / 4294967296;
  }

  private updateIdle(dt: number, busy: number): void {
    const calm = 1 - Math.min(1, busy * 1.5);
    this.nextHead -= dt;
    if (this.nextHead <= 0) {
      this.nextHead = 0.7 + this.random() * 2.6;
      this.idleTarget[0] = (this.random() - 0.5) * 0.3 * calm;
      this.idleTarget[1] = (this.random() - 0.5) * 0.14 * calm;
    }
    this.nextAntenna -= dt;
    if (this.nextAntenna <= 0) {
      this.nextAntenna = 0.25 + this.random() * 1.8;
      const both = this.random() < 0.6;
      const yaw = (this.random() - 0.3) * 0.25, pitch = (this.random() - 0.5) * 0.25;
      for (let side = 0; side < 2; side++) {
        if (!both && side === 1) break;
        this.idleTarget[2 + side * 2] = yaw;
        this.idleTarget[3 + side * 2] = pitch;
      }
    }
    // Head turns are quick glances, antennae quicker twitches.
    const kh = 1 - Math.exp(-dt / 0.07), ka = 1 - Math.exp(-dt / 0.04);
    for (let i = 0; i < 2; i++) this.idle[i] += (this.idleTarget[i] * calm - this.idle[i]) * kh;
    for (let i = 2; i < 6; i++) this.idle[i] += (this.idleTarget[i] - this.idle[i]) * ka;

    // Now and then a resting fly shifts a foot.
    this.nextFidget -= dt;
    if (this.nextFidget <= 0) {
      this.nextFidget = 2.5 + this.random() * 6;
      if (calm > 0.9) {
        const leg = Math.floor(this.random() * LEG_COUNT), i = leg * 3;
        this.fidget[i] = (this.random() - 0.5) * 0.06;
        this.fidget[i + 2] = (this.random() - 0.5) * 0.06;
      }
    }
    if (calm < 0.5) this.fidget.fill(0);
  }

  private proboscis(t: number): void {
    const jt = this.joints, s = this.scratch, head = J.head * 12;
    const e = smooth(0.05, 0.8, this.feed);
    const pump = e * 0.5 * (1 + Math.sin(TAU * 1.7 * t));

    // The rostrum hinges down and forward out of the head.
    transformPoint(jt, head, 0, PIVOT.proboscis[1] - PIVOT.neck[1], PIVOT.proboscis[2] - PIVOT.neck[2], s, 0);
    this.sagittal(head, -1.25 + 1.75 * e, s, 9);
    this.alongLateral(J.rostrum * 12, head, s[0], s[1], s[2], s[9], s[10], s[11]);
    transformPoint(jt, J.rostrum * 12, PROBOSCIS.rostrum, 0, 0, s, 3);

    // The haustellum folds forward at rest; feeding, it reaches for the surface
    // just ahead of the mouth, telescoping as far as it needs to.
    const lift = PROBOSCIS.labellum * 0.55;
    const dy = lift - s[4], dz = 0.035, reach = Math.sqrt(dy * dy + dz * dz);
    this.sagittal(head, 1.4, s, 12);
    let ax = s[12] * (1 - e), ay = s[13] + (dy / reach - s[13]) * e, az = s[14] + (dz / reach - s[14]) * e;
    const al = Math.sqrt(ax * ax + ay * ay + az * az);
    ax /= al; ay /= al; az /= al;
    const length = PROBOSCIS.haustellum;
    const wanted = Math.min(length * 1.5, Math.max(length * 0.6, reach));
    this.alongLateral(J.haustellum * 12, head, s[3], s[4], s[5], ax, ay, az);
    scaleX(jt, J.haustellum * 12, (1 + (wanted / length - 1) * e) * (1 - 0.06 * pump));
    transformPoint(jt, J.haustellum * 12, length, 0, 0, s, 6);

    // The labellum: folded up against the face at rest, its pad pressed flat to the surface when feeding.
    this.sagittal(head, 2.4, s, 15);
    let lx = s[15] * (1 - e), ly = s[16] + (-1 - s[16]) * e, lz = s[17] + (0.08 - s[17]) * e;
    const ll = Math.sqrt(lx * lx + ly * ly + lz * lz);
    lx /= ll; ly /= ll; lz /= ll;
    const lab = J.labellum * 12;
    this.alongLateral(lab, head, s[6], s[7], s[8], lx, ly, lz);
    // Its two lobes spread open on the food and work in quick pulses.
    const spread = 1 + e * (0.3 + 0.12 * Math.sin(TAU * 5.3 * t));
    jt[lab + 2] *= spread; jt[lab + 6] *= spread; jt[lab + 10] *= spread;
  }

  /** Writes the model-space direction at `angle` in the head's sagittal plane (0 straight down, π/2 forward). */
  private sagittal(head: number, angle: number, out: Float64Array, o: number): void {
    const jt = this.joints, dy = -Math.cos(angle), dz = Math.sin(angle);
    out[o] = jt[head + 1] * dy + jt[head + 2] * dz;
    out[o + 1] = jt[head + 5] * dy + jt[head + 6] * dz;
    out[o + 2] = jt[head + 9] * dy + jt[head + 10] * dz;
  }

  /** A frame at (x, y, z) with x along (ax, ay, az) and z toward the head's left. */
  private alongLateral(o: number, head: number, x: number, y: number, z: number, ax: number, ay: number, az: number): void {
    const jt = this.joints;
    const nx = jt[head], ny = jt[head + 4], nz = jt[head + 8];
    let yx = ny * az - nz * ay, yy = nz * ax - nx * az, yz = nx * ay - ny * ax;
    const yl = Math.sqrt(yx * yx + yy * yy + yz * yz) || 1;
    yx /= yl; yy /= yl; yz /= yl;
    setFrame(jt, o, ax, ay, az, yx, yy, yz, ay * yz - az * yy, az * yx - ax * yz, ax * yy - ay * yx, x, y, z);
  }

  private legs(t: number, dt: number, push: number, groomOn: number, sweep: number, rub: number, sweepS: number, vigour: number): void {
    const jt = this.joints, s = this.scratch, L = this.leg;
    const ground = 1 - ease(this.tuck);

    // Homes: crouching draws the middle legs in under the body, grooming brings them forward.
    for (let leg = 0; leg < LEG_COUNT; leg++) {
      const i = leg * 3, pair = legPair(leg);
      const inward = pair === 1 ? 1 - 0.2 * this.crouch : 1 - 0.06 * this.crouch;
      this.home[i] = this.restHome[i] * inward + this.fidget[i];
      this.home[i + 2] = this.restHome[i + 2] + this.fidget[i + 2] + (pair === 1 ? 0.05 * groomOn : 0) + (pair === 2 ? 0.03 * groomOn : 0);
    }
    if (this.flight > 0.5 || this.tuck > 0.5) this.gait.reset(this.home);
    else this.gait.update(this.speed * ground, this.turn * ground, dt, this.home);

    const thorax = 0;
    for (let leg = 0; leg < LEG_COUNT; leg++) {
      const i = leg * 3, pair = legPair(leg), side = legSide(leg), spec = LEGS[pair];
      transformPoint(jt, thorax, this.hipLocal[i], this.hipLocal[i + 1], this.hipLocal[i + 2], L.hip, 0);
      rotateVector(jt, thorax, this.coxaLocal[i], this.coxaLocal[i + 1], this.coxaLocal[i + 2], L.coxaRest);

      // On the ground: the gait's foot, the tarsus lying along the ground pointing away from the hip.
      const feet = this.gait.feet, lifted = this.gait.lifted[leg];
      let fx = feet[i], fy = feet[i + 1] + FOOT_CLEARANCE - 0.1 * push, fz = feet[i + 2];
      let hx = fx - L.hip[0], hz = fz - L.hip[2];
      const hl = Math.sqrt(hx * hx + hz * hz) || 1;
      hx /= hl; hz /= hl;
      const g = 0.14 + 0.9 * lifted + 0.4 * push, b = 0.62 + 0.45 * lifted + 0.3 * push;
      let dx = hx * Math.cos(g), dy = -Math.sin(g), dz = hz * Math.cos(g);
      let bx = hx * Math.cos(b), by = -Math.sin(b), bz = hz * Math.cos(b);
      let px = side * spec.knee[0], py = spec.knee[1], pz = spec.knee[2];

      // Grooming: the front legs leave the ground for the head.
      const w = pair === 0 ? groomOn : 0;
      if (w > 0) {
        this.groomTarget(side, sweep, rub, sweepS, vigour, s);
        const head = J.head * 12;
        transformPoint(jt, head, s[0], s[1], s[2], s, 9);
        rotateVector(jt, head, s[3], s[4], s[5], s, 12);
        rotateVector(jt, head, s[6], s[7], s[8], s, 15);
        fx += (s[9] - fx) * w; fy += (s[10] - fy) * w; fz += (s[11] - fz) * w;
        dx += (s[12] - dx) * w; dy += (s[13] - dy) * w; dz += (s[14] - dz) * w;
        bx += (s[15] - bx) * w; by += (s[16] - by) * w; bz += (s[17] - bz) * w;
        px += (side * 0.7 - px) * w; py += (0.1 - py) * w; pz += (0.7 - pz) * w;
      }

      // In the air: folded and trailing, with a little swing from the airflow.
      const a = ease(this.tuck);
      if (a > 0) {
        const tk = TUCK[pair], wob = 0.012 * Math.sin(TAU * (3.1 + leg * 0.37) * t + leg);
        transformPoint(jt, thorax, side * tk.foot[0], tk.foot[1] + wob, tk.foot[2], s, 9);
        rotateVector(jt, thorax, side * tk.distal[0], tk.distal[1], tk.distal[2], s, 12);
        rotateVector(jt, thorax, side * tk.basal[0], tk.basal[1], tk.basal[2], s, 15);
        rotateVector(jt, thorax, side * tk.knee[0], tk.knee[1], tk.knee[2], s, 18);
        fx += (s[9] - fx) * a; fy += (s[10] - fy) * a; fz += (s[11] - fz) * a;
        dx += (s[12] - dx) * a; dy += (s[13] - dy) * a; dz += (s[14] - dz) * a;
        bx += (s[15] - bx) * a; by += (s[16] - by) * a; bz += (s[17] - bz) * a;
        px += (s[18] - px) * a; py += (s[19] - py) * a; pz += (s[20] - pz) * a;
      }

      const dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1, bl = Math.sqrt(bx * bx + by * by + bz * bz) || 1;
      L.foot[0] = fx; L.foot[1] = fy; L.foot[2] = fz;
      L.distal[0] = dx / dl; L.distal[1] = dy / dl; L.distal[2] = dz / dl;
      L.basal[0] = bx / bl; L.basal[1] = by / bl; L.basal[2] = bz / bl;
      L.pole[0] = px; L.pole[1] = py; L.pole[2] = pz;
      this.footError[leg] = solveLeg(spec, L, jt, (J.leg + leg * LEG_SEGMENTS) * 12, this.bends, i);
    }
  }

  /**
   * A front leg's claw target and tarsus directions while grooming, in the
   * head's frame (relative to the neck), written to s[0..8]: sweeping over
   * the eye from the back of the head to the face, or rubbing against the
   * other front leg below the face.
   */
  private groomTarget(side: number, sweep: number, rub: number, sweepS: number, vigour: number, s: Float64Array): void {
    const ex = EYE.centre[0], ey = EYE.centre[1] - PIVOT.neck[1], ez = EYE.centre[2] - PIVOT.neck[2];
    const ax = EYE.radii[0], ay = EYE.radii[1], az = EYE.radii[2];
    const lag = side > 0 ? 0 : 0.06;
    let u = sweepS - lag;
    u -= Math.floor(u);
    const forward = u < 0.62;
    const p = forward ? smooth(0, 0.62, u) : 1 - smooth(0.62, 1, u);
    const reach = 0.55 + 0.45 * vigour;
    const psi = -0.5 + 2.7 * p * reach;
    const off = forward ? 0.012 : 0.05 * Math.sin(Math.PI * (u - 0.62) / 0.38);
    const sx = ex + ax * 0.75 + 0.02 + off, sy = ey + ay * 0.95 * Math.cos(psi), sz = ez + az * 0.95 * Math.sin(psi);
    // The tarsus lies back along the eye, the leg coming up from below.
    let tx = -0.35, ty = ay * Math.sin(psi), tz = -az * Math.cos(psi);
    const tl = Math.sqrt(tx * tx + ty * ty + tz * tz);
    tx /= tl; ty /= tl; tz /= tl;
    const bx0 = 0.5 * tx + 0.2, by0 = 0.5 * ty + 0.85, bz0 = 0.5 * tz + 0.1;

    // Rubbing: the tarsi cross under the face and slide against each other.
    const rubPhase = TAU * (2 * this.groomPhase) + (side > 0 ? 0 : Math.PI);
    const amp = 0.02 + 0.02 * vigour;
    const rx = -0.018, ry = -0.12 + 0.012 * Math.cos(rubPhase), rz = 0.18 + amp * Math.sin(rubPhase);
    const rdx = -0.85, rdy = 0.15, rdz = 0.5;
    const rbx = -0.35, rby = 0.55, rbz = 0.75;

    const w = sweep, v = rub;
    s[0] = side * (sx * w + rx * v); s[1] = sy * w + ry * v; s[2] = sz * w + rz * v;
    s[3] = side * (tx * w + rdx * v); s[4] = ty * w + rdy * v; s[5] = tz * w + rdz * v;
    s[6] = side * (bx0 * w + rbx * v); s[7] = by0 * w + rby * v; s[8] = bz0 * w + rbz * v;
  }

  private wingFrames(): void {
    const wf = this.wings, f = this.frame, jt = this.joints;
    const open = this.open, fly = this.flight;
    const strength = Math.max(this.beat, fly);
    const blur = open * smooth(0, 0.08, strength);
    const amplitude = (0.35 + 1.4 * this.beat) * (1 - fly) + (2.45 + 0.3 * this.beat) * fly;
    const mean = 0.75 * (1 - fly) + 0.2 * fly;
    const lift = 0.16 * (1 - fly) + 0.04 * fly + 0.25 * this.crouch * (1 - open);
    const tilt = 0.3 * fly * open;
    const jitter = (this.random() * 0.5) / WING_COPIES;
    const bright = Math.floor(this.random() * WING_COPIES);
    this.wingHaze = blur * 0.5;

    for (let c = 0; c < WING_COPIES; c++) {
      const phase = jitter + blur * (c / WING_COPIES) * 0.5;
      const sweepAngle = mean + 0.5 * amplitude * Math.cos(TAU * phase);
      const elevation = lift + 0.07 * Math.sin(2 * TAU * phase) * blur;
      const rotation = 0.7 * Math.sin(TAU * phase) * blur;
      const strokeAngle = (Math.PI / 2 + 0.13) * (1 - open) + sweepAngle * open;
      const elev = -0.07 * (1 - open) + elevation * open;
      const alpha = (c === 0 ? 1 : 0) * (1 - blur) + blur * (0.16 + (c === bright ? 0.2 : 0));

      // Left wing relative to the thorax: hinge, stroke plane, sweep, elevation, rotation.
      identity(f, 0);
      translate(f, 0, PIVOT.wing[0] - PIVOT.thorax[0], PIVOT.wing[1] - PIVOT.thorax[1], PIVOT.wing[2] - PIVOT.thorax[2]);
      rotateX(f, 0, tilt);
      rotateY(f, 0, strokeAngle);
      rotateZ(f, 0, elev);
      rotateX(f, 0, rotation * open + Math.PI / 2);
      multiply(wf, c * 12, jt, 0, f, 0);
      this.wingAlpha[c] = alpha;

      // The right wing is its mirror image (and lies just under the left where they overlap).
      mirrorFrame(f, 0);
      f[7] -= 0.004 * (1 - open);
      multiply(wf, (WING_COPIES + c) * 12, jt, 0, f, 0);
      this.wingAlpha[WING_COPIES + c] = alpha;
    }
  }
}

/** out[oi..] = rotation part of m · (x, y, z). */
function rotateVector(m: Float32Array, o: number, x: number, y: number, z: number, out: Float64Array, oi = 0): void {
  out[oi] = m[o] * x + m[o + 1] * y + m[o + 2] * z;
  out[oi + 1] = m[o + 4] * x + m[o + 5] * y + m[o + 6] * z;
  out[oi + 2] = m[o + 8] * x + m[o + 9] * y + m[o + 10] * z;
}

/** Reflects a frame through the x = 0 plane and keeps it right-handed by recomputing its z axis. */
function mirrorFrame(m: Float64Array, o: number): void {
  m[o] = -m[o]; m[o + 1] = -m[o + 1]; m[o + 3] = -m[o + 3];
  const xx = m[o], xy = m[o + 4], xz = m[o + 8], yx = m[o + 1], yy = m[o + 5], yz = m[o + 9];
  m[o + 2] = xy * yz - xz * yy;
  m[o + 6] = xz * yx - xx * yz;
  m[o + 10] = xx * yy - xy * yx;
}
