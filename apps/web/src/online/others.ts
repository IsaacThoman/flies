// Every fly but the one the player follows: the other players' at a table,
// bodies posed from what their devices send, drawn a little in the past
// between states that have arrived (packages/net, FlyTrack), each with its
// dab of paint; and this device's own other flies (company.ts), posed from
// what they do as they live. Every fly this device lives sees them all (a
// low-detail stand-in, as the eyes see everything else), the followed one
// among them, and its body meets them (Life.crowd). Nothing else of them
// reaches it.
//
// A full table has to fit the frame on the slowest device, where the cost
// follows draw calls and JavaScript, not triangles. So only the flies nearest
// the camera are the real model, posed (two draws each), no more of them than
// a table of eight had (MODELS_MOST); any other, or one too far to show more
// than a few pixels, is a stand-in, all of them in one instanced draw and not
// posed at all. Their shadows are one instanced draw, and what the eyes see
// of them another, a coarser stand-in of only the nearest (EYES_MOST). The
// models are a pool as big as the most posed at once, handed to whichever
// flies are nearest. Nothing here is made per frame.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { FLY_LENGTH } from "@fly/body";
import { MAX_NEIGHBOURS } from "@fly/body";
import type { Crowd, FlyBody } from "@fly/body";
import { AIRBORNE, AWAY, FlyTrack, MAX_FLIES, createFlyState } from "@fly/net";
import type { FlyState } from "@fly/net";
import type { Vec3, World } from "@fly/world";
import type { Companion } from "../company.ts";
import { EYE_LAYER } from "../eyes/eyes.ts";
import { FlyView, flyShadow, flyShadowMaterial } from "../fly-view.ts";

/** A fly not heard from for this long (ms) is shown at rest: its device has stopped, whatever it last said. */
export const SILENT_AFTER = 1500;
/** A fly shorter than this on screen (pixels of the picture the game draws) is a stand-in. */
export const FAR_PIXELS = 9;
/**
 * At most this many flies besides the followed one are posed models at
 * once: this device's others first, then the other players' nearest the
 * camera. A table of eight, measured on an Apple TV (docs/apple-tv.md), had
 * at most this many.
 */
export const MODELS_MOST = 7;
/**
 * The eyes see at most this many of the other players' flies, those nearest
 * the followed fly (as many as a body meets: MAX_NEIGHBOURS). Each is drawn
 * in every face of the eyes, and a fly a few body lengths off is under a
 * facet or two; a full table of them would be most of a frame's triangles.
 */
export const EYES_MOST = MAX_NEIGHBOURS;
/** How far a resting fly is dimmed. */
const RESTING_DIM = 0.45;

export type Other = {
  id: number;
  colour: string;
  /** Whose it is: the id of its device's first fly (its player's), whose state carries their hand. */
  of: number;
  readonly track: FlyTrack;
  /** Its model while it is posed: from a pool, given back when it is a stand-in again or leaves. */
  view: FlyView | null;
  /** Where it is drawn now. */
  readonly state: FlyState;
  readonly position: Vec3;
  readonly up: Vec3;
  /** Heard of, so somewhere on the table. */
  present: boolean;
  /** The room says its device has stopped. */
  away: boolean;
  /** Shown at rest: away, or not heard from for a while. */
  resting: boolean;
  /** How long it is on screen, pixels of the picture the game draws. */
  size: number;
  /** Posed as the real model: big enough on screen, and among the nearest. */
  near: boolean;
};

/**
 * What the eyes see of another fly, and what a distant one is drawn as: its
 * head, thorax, abdomen and folded wings, in its colours, each part a sphere
 * of `around` × `down` segments.
 */
function standInGeometry(around: number, down: number) {
  const part = (centre: [number, number, number], radii: [number, number, number], colour: string) => {
    const g = new THREE.SphereGeometry(1, around, down);
    g.scale(...radii).translate(...centre);
    const c = new THREE.Color(colour);
    const n = g.attributes.position.count;
    const colours = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.toArray(colours, i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(colours, 3));
    return g.toNonIndexed();
  };
  // As packages/fly/src/anatomy.ts has them.
  return mergeGeometries([
    part([0, 0.335, 0.392], [0.155, 0.13, 0.095], "#8a2a1c"),
    part([0, 0.335, 0.135], [0.15, 0.155, 0.2], "#a98352"),
    part([0, 0.295, -0.25], [0.128, 0.11, 0.25], "#6b4a30"),
    part([0, 0.43, -0.18], [0.16, 0.02, 0.3], "#b8b8b0"),
  ])!;
}

function instanced(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D) {
  // Every fly at a full table, or every fly a device lives alone.
  const mesh = new THREE.InstancedMesh(geometry, material, MAX_FLIES);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // They are all over the table: bounds that hold them all would be the table's.
  mesh.frustumCulled = false;
  mesh.count = 0;
  parent.add(mesh);
  return mesh;
}

/** Another device at the table as the screens show it: its player's id, and its flies' colours. */
export type Device = { readonly id: number; colours: string[] };

/**
 * The other devices at the table, from their flies heard of. Each is the
 * same object for as long as the first of its flies heard of is the same
 * one (`known` keeps them), so the screens can tell it from a device that
 * later sits in its seats: that one's flies are heard of anew.
 */
export function devicesOf(list: readonly Other[], known: WeakMap<Other, Device>): Device[] {
  const devices: Device[] = [];
  for (const o of list) {
    const of = devices.find((d) => d.id === o.of);
    if (of) {
      of.colours.push(o.colour);
      continue;
    }
    let device = known.get(o);
    if (!device) known.set(o, (device = { id: o.of, colours: [] }));
    device.colours = [o.colour];
    devices.push(device);
  }
  return devices;
}

export class OtherFlies {
  /** The other players' flies at the table. */
  readonly list: Other[] = [];
  /** This device's own other flies, set by the game: drawn here, each with a model of its own. */
  company: readonly Companion[] = [];
  readonly #parent: THREE.Object3D;
  readonly #world: World;
  readonly #pool: FlyView[] = [];
  /** The models of this device's other flies, by their place in its company. */
  readonly #companyViews: FlyView[] = [];
  /** The colour each of those is marked with, so it is marked again only when that changes. */
  readonly #companyMarks: string[] = [];
  /** What the eyes see of every fly (this device's others, then the other players', then the followed one), and the distant ones as they are drawn. */
  readonly #eyes: THREE.InstancedMesh<THREE.BufferGeometry, THREE.Material>;
  readonly #far: THREE.InstancedMesh<THREE.BufferGeometry, THREE.Material>;
  readonly #shadows: THREE.InstancedMesh<THREE.BufferGeometry, THREE.Material>;
  /** One fly's stand-in, kept while its own eyes look round without it. */
  readonly #hidden = new Float32Array(16);
  /** How far each of the other players' flies is from the followed one, squared, for choosing those the eyes see. */
  readonly #distances = new Float64Array(MAX_FLIES);
  #hiddenAt = -1;
  readonly #m = new THREE.Matrix4();
  readonly #q = new THREE.Quaternion();
  readonly #yaw = new THREE.Quaternion();
  readonly #up = new THREE.Vector3();
  readonly #s = new THREE.Vector3();
  readonly #p = new THREE.Vector3();
  readonly #shadow = new THREE.Object3D();
  #eyeCount = 0;
  #farCount = 0;
  #shadowCount = 0;

  constructor(parent: THREE.Object3D, world: World) {
    this.#parent = parent;
    this.#world = world;
    const material = new THREE.MeshLambertMaterial({ vertexColors: true });
    // The eyes draw every fly in each of their faces, at a few degrees a facet: a full table's worth of 480-triangle stand-ins
    // there would be most of a frame's triangles, and 144 look the same to them.
    this.#eyes = instanced(standInGeometry(6, 4), material, parent);
    this.#eyes.layers.set(EYE_LAYER);
    // 320 triangles: what a distant fly, or a near one beyond the posed few, is drawn as on screen. A full table's of them keep the
    // frame within its triangles (apps/web/e2e/tables.e2e.ts).
    this.#far = instanced(standInGeometry(8, 6), material, parent);
    this.#shadows = instanced(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), flyShadowMaterial(), parent);
    this.#shadows.renderOrder = 1;
  }

  get(id: number): Other | null {
    for (let i = 0; i < this.list.length; i++) if (this.list[i].id === id) return this.list[i];
    return null;
  }

  /** Another player's fly is at the table (`of`: whose, by their first fly's id). */
  join(id: number, colour: string, away: boolean, of = id): Other {
    const known = this.get(id);
    if (known) {
      known.away = away;
      return known;
    }
    const other: Other = { id, colour, of, track: new FlyTrack(), view: null, state: createFlyState(), position: { x: 0, y: -1e4, z: 0 }, up: { x: 0, y: 1, z: 0 }, present: false, away, resting: away, size: 0, near: false };
    this.list.push(other);
    return other;
  }

  leave(id: number) {
    const i = this.list.findIndex((o) => o.id === id);
    if (i < 0) return;
    this.#release(this.list[i]);
    this.list.splice(i, 1);
  }

  /** Every other player's fly leaves: this player left the table. */
  clear() {
    while (this.list.length) this.leave(this.list[0].id);
  }

  /** What was heard of them is from somewhere else now (the table moved, the line was opened again). */
  forget() {
    for (const o of this.list) {
      o.track.clear();
      o.present = false;
    }
  }

  /** A state heard, at room time `now`. */
  heard(state: FlyState, now: number) {
    this.get(state.id)?.track.push(state, now);
  }

  /**
   * Draws each where it is: another player's where it was a moment ago at
   * room time `now`, this device's others where they are. `pixels` is the
   * picture's focal length in pixels (how many pixels something as long as
   * it is far away covers), for telling near from far; `followed` is the
   * fly the camera follows, whose stand-in only the others' eyes see. Call
   * before the flies live their frame.
   */
  update(now: number, dt: number, camera: THREE.Vector3, pixels: number, followed: FlyBody) {
    this.#hiddenAt = -1;
    this.#eyeCount = this.#farCount = this.#shadowCount = 0;
    const company = this.company;
    const views = this.#companyViews;
    while (views.length < company.length) {
      views.push(new FlyView(this.#parent, this.#world, false));
      this.#companyMarks.push("");
    }
    for (let i = 0; i < views.length; i++) {
      const view = views[i];
      const c = company[i];
      if (!c) {
        view.root.visible = false;
        continue;
      }
      const body = c.life.body;
      const near = this.#near(body.position, camera, pixels);
      view.root.visible = near;
      if (near) {
        if (this.#companyMarks[i] !== c.colour) view.model.mark((this.#companyMarks[i] = c.colour));
        view.model.update(c.pose, dt);
        view.place(body.position, body.yaw, body.up);
      }
      this.#standIn(body.position, body.yaw, body.up, true, !near, true);
    }
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      const s = o.state;
      o.near = false;
      o.present = o.track.sample(now - o.track.delay, s) !== "empty";
      if (!o.present) continue;
      o.position.x = s.x;
      o.position.y = s.y;
      o.position.z = s.z;
      o.size = this.#size(o.position, camera, pixels);
    }
    // The eyes see the nearest to the followed fly: those no further than the EYES_MOST-th nearest.
    const at = followed.position;
    let present = 0;
    for (let i = 0; i < list.length; i++) if (list[i].present) this.#distances[present++] = distance2(at, list[i].position);
    const seen = present > EYES_MOST ? kth(this.#distances, present, EYES_MOST - 1) : Infinity;
    let eyed = 0;
    // The nearest are posed, as many as the models left over from this device's own.
    for (let posed = company.length; posed < MODELS_MOST; posed++) {
      let nearest: Other | null = null;
      for (let i = 0; i < list.length; i++) {
        const o = list[i];
        if (o.present && !o.near && o.size >= FAR_PIXELS && (!nearest || o.size > nearest.size)) nearest = o;
      }
      if (!nearest) break;
      nearest.near = true;
    }
    // Models given back before any is handed out, so the pool never holds more than are posed at once.
    for (let i = 0; i < list.length; i++) if (!list[i].near) this.#release(list[i]);
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (!o.present) continue;
      const s = o.state;
      o.resting = o.away || !!(s.flags & AWAY) || now - o.track.heardAt > SILENT_AFTER;
      o.up.x = s.upX;
      o.up.z = s.upZ;
      o.up.y = Math.sqrt(Math.max(0, 1 - s.upX * s.upX - s.upZ * s.upZ));
      const airborne = !!(s.flags & AIRBORNE) && !o.resting;
      if (o.near) {
        const view = this.#viewFor(o);
        const pose = view.pose;
        const p = s.pose;
        // A fly whose device has stopped stands still where it was last seen, wings folded.
        const k = o.resting ? 0 : 1;
        pose.speed = p.speed * k;
        pose.turn = p.turn * k;
        pose.airborne = airborne;
        pose.wings = p.wings * k;
        pose.groom = p.groom * k;
        pose.feed = p.feed * k;
        pose.crouch = p.crouch * k;
        pose.pitch = p.pitch * k;
        pose.roll = p.roll * k;
        view.model.update(pose, dt);
        view.model.dim(o.resting ? RESTING_DIM : 0);
        view.place(o.position, s.yaw, o.up);
      }
      const eyes = eyed < EYES_MOST && distance2(at, o.position) <= seen;
      if (eyes) eyed++;
      this.#standIn(o.position, s.yaw, o.up, eyes, !o.near, true);
    }
    // Last, so that while its own eyes look round it is simply left off the end: alone, they draw no flies at all.
    this.#standIn(followed.position, followed.yaw, followed.up, true, false, false);
    commit(this.#eyes, this.#eyeCount);
    commit(this.#far, this.#farCount);
    commit(this.#shadows, this.#shadowCount);
  }

  #near(p: Vec3, camera: THREE.Vector3, pixels: number) {
    return this.#size(p, camera, pixels) >= FAR_PIXELS;
  }

  #size(p: Vec3, camera: THREE.Vector3, pixels: number) {
    return (FLY_LENGTH / Math.max(1, camera.distanceTo(this.#p.set(p.x, p.y, p.z)))) * pixels;
  }

  /** Another player's fly's model, from the pool if it has none, marked in its colour. */
  #viewFor(o: Other): FlyView {
    if (o.view) return o.view;
    const view = (o.view = this.#pool.pop() ?? new FlyView(this.#parent, this.#world, false));
    view.model.mark(o.colour);
    view.root.visible = true;
    return view;
  }

  /** Gives another player's fly's model back to the pool: it is a stand-in now, or gone. */
  #release(o: Other) {
    const view = o.view;
    if (!view) return;
    view.root.visible = false;
    this.#pool.push(view);
    o.view = null;
  }

  /** A fly as the eyes see it (`eyes`), as a distant one is drawn (`far`), and its shadow (`shadow`: the followed fly has its own). */
  #standIn(p: Vec3, yaw: number, up: Vec3, eyes: boolean, far: boolean, shadow: boolean) {
    if (this.#eyeCount >= MAX_FLIES || this.#farCount >= MAX_FLIES) return;
    this.#yaw.setFromAxisAngle(UP, yaw);
    this.#up.set(up.x, up.y, up.z);
    this.#q.setFromUnitVectors(UP, this.#up).multiply(this.#yaw);
    this.#m.compose(this.#p.set(p.x, p.y, p.z), this.#q, this.#s.setScalar(FLY_LENGTH));
    if (eyes) this.#eyes.setMatrixAt(this.#eyeCount++, this.#m);
    if (far) this.#far.setMatrixAt(this.#farCount++, this.#m);
    if (!shadow) return;
    const fade = flyShadow(this.#world, p, this.#yaw, this.#shadow);
    if (fade > 0.02) {
      // One draw for all of them, so a fading shadow shrinks rather than paling.
      this.#shadow.scale.multiplyScalar(fade);
      this.#shadow.updateMatrix();
      this.#shadows.setMatrixAt(this.#shadowCount++, this.#shadow.matrix);
    }
  }

  /**
   * Takes one fly's stand-in out of what the eyes see while its own eyes
   * look round (`index`: 0 the followed fly, then this device's others in
   * order), and puts back any taken out before; -1 only puts it back.
   */
  hideFromEyes(index: number) {
    if (index === this.#hiddenAt) return;
    const eyes = this.#eyes;
    const array = eyes.instanceMatrix.array as Float32Array;
    if (this.#hiddenAt === 0) commit(eyes, this.#eyeCount);
    else if (this.#hiddenAt > 0) {
      array.set(this.#hidden, (this.#hiddenAt - 1) * 16);
      eyes.instanceMatrix.needsUpdate = true;
    }
    this.#hiddenAt = index;
    if (index === 0) {
      // The followed fly's is the last.
      eyes.count = Math.max(0, this.#eyeCount - 1);
      eyes.visible = eyes.count > 0;
    } else if (index > 0 && index <= this.company.length && index < this.#eyeCount) {
      const at = (index - 1) * 16;
      this.#hidden.set(array.subarray(at, at + 16));
      array.fill(0, at, at + 16);
      eyes.instanceMatrix.needsUpdate = true;
    } else this.#hiddenAt = -1;
  }

  /**
   * Puts every fly but `self` in its way (`crowd`): the followed fly, this
   * device's others, and the other players' where they are drawn.
   */
  crowd(crowd: Crowd, self: FlyBody, followed: FlyBody) {
    meet(crowd, self, followed, this.company, this.list);
  }

  /** Takes them all out of the world. */
  dispose() {
    this.clear();
    for (const view of [...this.#pool, ...this.#companyViews]) {
      view.model.dispose();
      view.root.removeFromParent();
    }
    this.#pool.length = 0;
    this.#companyViews.length = 0;
    const meshes = [this.#eyes, this.#far, this.#shadows];
    for (const mesh of meshes) {
      mesh.dispose();
      mesh.removeFromParent();
    }
    for (const geometry of new Set(meshes.map((m) => m.geometry))) geometry.dispose();
    // The soft shadow's texture is shared with the followed fly.
    for (const material of new Set(meshes.map((m) => m.material))) material.dispose();
  }
}

/** Puts every fly but `self` in its way: the followed one, a device's others (`company`), and other players' that are there (`others`). */
export function meet(crowd: Crowd, self: FlyBody, followed: FlyBody, company: readonly Companion[], others: readonly Other[]) {
  crowd.clear();
  const at = self.position;
  if (self !== followed) addBody(crowd, at, followed.position, followed.yaw, followed.velocity);
  for (let i = 0; i < company.length; i++) {
    const body = company[i].life.body;
    if (body !== self) addBody(crowd, at, body.position, body.yaw, body.velocity);
  }
  for (let i = 0; i < others.length; i++) {
    const o = others[i];
    if (!o.present) continue;
    const s = o.state;
    // A crowd holds only so many: the nearest.
    const n = crowd.add(distance2(at, s));
    if (!n) continue;
    n.x = s.x;
    n.y = s.y;
    n.z = s.z;
    n.yaw = s.yaw;
    n.vx = s.vx;
    n.vy = s.vy;
    n.vz = s.vz;
  }
}

function addBody(crowd: Crowd, at: Vec3, p: Vec3, yaw: number, v: Vec3) {
  const n = crowd.add(distance2(at, p));
  if (!n) return;
  n.x = p.x;
  n.y = p.y;
  n.z = p.z;
  n.yaw = yaw;
  n.vx = v.x;
  n.vy = v.y;
  n.vz = v.z;
}

/** The `k`th smallest (from 0) of the first `n` of `a`, which it reorders: a quickselect, no sorting. */
function kth(a: Float64Array, n: number, k: number) {
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const pivot = a[(lo + hi) >> 1];
    let i = lo;
    let j = hi;
    while (i <= j) {
      while (a[i] < pivot) i++;
      while (a[j] > pivot) j--;
      if (i <= j) {
        const t = a[i];
        a[i++] = a[j];
        a[j--] = t;
      }
    }
    if (k <= j) hi = j;
    else if (k >= i) lo = i;
    else return a[k];
  }
  return a[k];
}

function distance2(a: Vec3, b: Vec3) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

function commit(mesh: THREE.InstancedMesh, count: number) {
  mesh.count = count;
  mesh.visible = count > 0;
  if (count > 0) mesh.instanceMatrix.needsUpdate = true;
}

const UP = new THREE.Vector3(0, 1, 0);
