// Every fly but the one the player follows: the other players' at a table,
// bodies posed from what their devices send, drawn a little in the past
// between states that have arrived (packages/net, FlyTrack), each with its
// dab of paint; and this device's own other flies (company.ts), posed from
// what they do as they live. Every fly this device lives sees them all (a
// low-detail stand-in, as the eyes see everything else), the followed one
// among them, and its body meets them (Life.crowd). Nothing else of them
// reaches it.
//
// Eight flies have to fit the frame on the slowest device, where the cost
// follows draw calls and JavaScript, not triangles. So only a fly near the
// camera is the real model, posed (two draws); one too far to show more than
// a few pixels is a stand-in, all of them in one instanced draw and not posed
// at all. Their shadows are one instanced draw, and what the eyes see of them
// another. Nothing here is made per frame.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { FLY_LENGTH } from "@fly/body";
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
/** How far a resting fly is dimmed. */
const RESTING_DIM = 0.45;

export type Other = {
  id: number;
  colour: string;
  /** Whose it is: the id of its device's first fly (its player's), whose state carries their hand. */
  of: number;
  readonly track: FlyTrack;
  /** Its model while it is near the camera: from a pool, kept for whoever comes next when it leaves. */
  view: FlyView;
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
  near: boolean;
};

/** What the eyes see of another fly, and what a distant one is drawn as: its head, thorax, abdomen and folded wings, a few hundred triangles in all, in its colours. */
function standInGeometry() {
  const part = (centre: [number, number, number], radii: [number, number, number], colour: string) => {
    const g = new THREE.SphereGeometry(1, 10, 7);
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
    const geometry = standInGeometry();
    const material = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.#eyes = instanced(geometry, material, parent);
    this.#eyes.layers.set(EYE_LAYER);
    this.#far = instanced(geometry, material, parent);
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
    const view = this.#pool.pop() ?? new FlyView(this.#parent, this.#world, false);
    view.model.mark(colour);
    view.root.visible = false;
    const other: Other = { id, colour, of, track: new FlyTrack(), view, state: createFlyState(), position: { x: 0, y: -1e4, z: 0 }, up: { x: 0, y: 1, z: 0 }, present: false, away, resting: away, near: false };
    this.list.push(other);
    return other;
  }

  leave(id: number) {
    const i = this.list.findIndex((o) => o.id === id);
    if (i < 0) return;
    const view = this.list[i].view;
    view.root.visible = false;
    this.#pool.push(view);
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
      this.#standIn(body.position, body.yaw, body.up, !near, true);
    }
    for (let i = 0; i < this.list.length; i++) {
      const o = this.list[i];
      const s = o.state;
      const view = o.view;
      o.present = o.track.sample(now - o.track.delay, s) !== "empty";
      if (!o.present) {
        view.root.visible = false;
        continue;
      }
      o.resting = o.away || !!(s.flags & AWAY) || now - o.track.heardAt > SILENT_AFTER;
      o.position.x = s.x;
      o.position.y = s.y;
      o.position.z = s.z;
      o.up.x = s.upX;
      o.up.z = s.upZ;
      o.up.y = Math.sqrt(Math.max(0, 1 - s.upX * s.upX - s.upZ * s.upZ));
      const airborne = !!(s.flags & AIRBORNE) && !o.resting;
      o.near = this.#near(o.position, camera, pixels);
      view.root.visible = o.near;
      if (o.near) {
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
      this.#standIn(o.position, s.yaw, o.up, !o.near, true);
    }
    // Last, so that while its own eyes look round it is simply left off the end: alone, they draw no flies at all.
    this.#standIn(followed.position, followed.yaw, followed.up, false, false);
    commit(this.#eyes, this.#eyeCount);
    commit(this.#far, this.#farCount);
    commit(this.#shadows, this.#shadowCount);
  }

  #near(p: Vec3, camera: THREE.Vector3, pixels: number) {
    const distance = Math.max(1, camera.distanceTo(this.#p.set(p.x, p.y, p.z)));
    return (FLY_LENGTH / distance) * pixels >= FAR_PIXELS;
  }

  /** A fly as the eyes see it, as a distant one is drawn (`far`), and its shadow (`shadow`: the followed fly has its own). */
  #standIn(p: Vec3, yaw: number, up: Vec3, far: boolean, shadow: boolean) {
    if (this.#eyeCount >= MAX_FLIES) return;
    this.#yaw.setFromAxisAngle(UP, yaw);
    this.#up.set(up.x, up.y, up.z);
    this.#q.setFromUnitVectors(UP, this.#up).multiply(this.#yaw);
    this.#m.compose(this.#p.set(p.x, p.y, p.z), this.#q, this.#s.setScalar(FLY_LENGTH));
    this.#eyes.setMatrixAt(this.#eyeCount++, this.#m);
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
  if (self !== followed) addBody(crowd, followed.position, followed.yaw, followed.velocity);
  for (const c of company) if (c.life.body !== self) addBody(crowd, c.life.body.position, c.life.body.yaw, c.life.body.velocity);
  for (const o of others) {
    if (!o.present) continue;
    const s = o.state;
    const n = crowd.add();
    if (!n) return;
    n.x = s.x;
    n.y = s.y;
    n.z = s.z;
    n.yaw = s.yaw;
    n.vx = s.vx;
    n.vy = s.vy;
    n.vz = s.vz;
  }
}

function addBody(crowd: Crowd, p: Vec3, yaw: number, v: Vec3) {
  const n = crowd.add();
  if (!n) return;
  n.x = p.x;
  n.y = p.y;
  n.z = p.z;
  n.yaw = yaw;
  n.vx = v.x;
  n.vy = v.y;
  n.vz = v.z;
}

function commit(mesh: THREE.InstancedMesh, count: number) {
  mesh.count = count;
  mesh.visible = count > 0;
  if (count > 0) mesh.instanceMatrix.needsUpdate = true;
}

const UP = new THREE.Vector3(0, 1, 0);
