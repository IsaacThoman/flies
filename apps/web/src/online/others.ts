// The other players' flies at the table: bodies posed from what their
// devices send, drawn a little in the past between states that have arrived
// (packages/net, FlyTrack), each with its player's dab of paint. This fly's
// eyes see them (a low-detail stand-in, as the eyes see everything else) and
// its body meets them (Life.crowd). Nothing else of them reaches it.
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
import type { Crowd } from "@fly/body";
import { AIRBORNE, AWAY, FlyTrack, MAX_PLAYERS, createFlyState } from "@fly/net";
import type { FlyState } from "@fly/net";
import type { Vec3, World } from "@fly/world";
import { EYE_LAYER } from "../eyes/eyes.ts";
import { FlyView, flyShadow, flyShadowMaterial } from "../fly-view.ts";

/** A fly not heard from for this long (ms) is shown at rest: its device has stopped, whatever it last said. */
export const SILENT_AFTER = 1500;
/** A fly shorter than this on screen (pixels of the picture the game draws) is a stand-in. */
export const FAR_PIXELS = 9;
/** How far a resting fly is dimmed. */
const RESTING_DIM = 0.45;
const OTHERS = MAX_PLAYERS - 1;

export type Other = {
  id: number;
  colour: string;
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
  const mesh = new THREE.InstancedMesh(geometry, material, OTHERS);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // They are all over the table: bounds that hold them all would be the table's.
  mesh.frustumCulled = false;
  mesh.count = 0;
  parent.add(mesh);
  return mesh;
}

export class OtherFlies {
  readonly list: Other[] = [];
  readonly #parent: THREE.Object3D;
  readonly #world: World;
  readonly #pool: FlyView[] = [];
  /** What the eyes see of every other fly, and the distant ones as they are drawn. */
  readonly #eyes: THREE.InstancedMesh;
  readonly #far: THREE.InstancedMesh;
  readonly #shadows: THREE.InstancedMesh;
  readonly #m = new THREE.Matrix4();
  readonly #q = new THREE.Quaternion();
  readonly #yaw = new THREE.Quaternion();
  readonly #up = new THREE.Vector3();
  readonly #s = new THREE.Vector3();
  readonly #p = new THREE.Vector3();
  readonly #shadow = new THREE.Object3D();

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

  /** A player is at the table. */
  join(id: number, colour: string, away: boolean): Other {
    const known = this.get(id);
    if (known) {
      known.away = away;
      return known;
    }
    const view = this.#pool.pop() ?? new FlyView(this.#parent, this.#world, false);
    view.model.mark(colour);
    view.root.visible = false;
    const other: Other = { id, colour, track: new FlyTrack(), view, state: createFlyState(), position: { x: 0, y: -1e4, z: 0 }, up: { x: 0, y: 1, z: 0 }, present: false, away, resting: away, near: false };
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

  /** Everyone leaves: this player left the table. */
  clear() {
    while (this.list.length) this.leave(this.list[0].id);
    this.#eyes.count = this.#far.count = this.#shadows.count = 0;
  }

  /** Takes them all out of the world: this player left the table. */
  dispose() {
    this.clear();
    for (const view of this.#pool) view.root.removeFromParent();
    this.#eyes.removeFromParent();
    this.#far.removeFromParent();
    this.#shadows.removeFromParent();
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
   * Draws each where it was a moment ago at room time `now`, and puts them
   * in this fly's way (`crowd`). `pixels` is the picture's focal length in
   * pixels (how many pixels something as long as it is far away covers), for
   * telling near from far. Call before this fly lives its frame.
   */
  update(now: number, dt: number, crowd: Crowd, camera: THREE.Vector3, pixels: number) {
    crowd.clear();
    let eyes = 0;
    let far = 0;
    let shadows = 0;
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

      const distance = Math.max(1, camera.distanceTo(this.#p.set(s.x, s.y, s.z)));
      o.near = (FLY_LENGTH / distance) * pixels >= FAR_PIXELS;
      view.root.visible = o.near;
      this.#yaw.setFromAxisAngle(UP, s.yaw);
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
      this.#up.set(o.up.x, o.up.y, o.up.z);
      this.#q.setFromUnitVectors(UP, this.#up).multiply(this.#yaw);
      this.#m.compose(this.#p.set(s.x, s.y, s.z), this.#q, this.#s.setScalar(FLY_LENGTH));
      this.#eyes.setMatrixAt(eyes++, this.#m);
      if (!o.near) this.#far.setMatrixAt(far++, this.#m);
      const fade = flyShadow(this.#world, o.position, this.#yaw, this.#shadow);
      if (fade > 0.02) {
        // One draw for all of them, so a fading shadow shrinks rather than paling.
        this.#shadow.scale.multiplyScalar(fade);
        this.#shadow.updateMatrix();
        this.#shadows.setMatrixAt(shadows++, this.#shadow.matrix);
      }

      const n = crowd.add();
      if (n) {
        n.x = s.x;
        n.y = s.y;
        n.z = s.z;
        n.yaw = s.yaw;
        n.vx = s.vx;
        n.vy = s.vy;
        n.vz = s.vz;
      }
    }
    commit(this.#eyes, eyes);
    commit(this.#far, far);
    commit(this.#shadows, shadows);
  }
}

function commit(mesh: THREE.InstancedMesh, count: number) {
  mesh.count = count;
  mesh.visible = count > 0;
  if (count > 0) mesh.instanceMatrix.needsUpdate = true;
}

const UP = new THREE.Vector3(0, 1, 0);
