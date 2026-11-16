// The other players' flies at a shared table: bodies posed from what their
// devices send, drawn a little in the past between states that have arrived
// (packages/net, FlyTrack), each with its player's dab of paint. This fly's
// eyes see them (a low-detail stand-in on the eyes' layer, as the eyes see
// everything else) and its body meets them (Life.crowd). Nothing else of
// them reaches it.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { FLY_LENGTH } from "@fly/body";
import type { Crowd } from "@fly/body";
import { AIRBORNE, AWAY, FlyTrack, createFlyState } from "@fly/net";
import type { FlyState } from "@fly/net";
import type { Vec3, World } from "@fly/world";
import { EYE_LAYER } from "../eyes/eyes.ts";
import type { Eyes } from "../eyes/eyes.ts";
import { FlyView } from "../fly-view.ts";

/** A fly not heard from for this long (ms) is shown at rest: its device has stopped (a tab in the background, a pause). */
export const ASLEEP_AFTER = 1500;

export type Other = {
  id: number;
  colour: string;
  readonly track: FlyTrack;
  readonly view: FlyView;
  readonly standIn: THREE.Mesh;
  /** Where it is drawn now. */
  readonly state: FlyState;
  readonly position: Vec3;
  readonly up: Vec3;
  /** It has been heard from, and is on the table. */
  present: boolean;
  asleep: boolean;
};

/** What the eyes see of another fly: its head, thorax, abdomen and folded wings, a few hundred triangles in all, in its colours. */
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

export class OtherFlies {
  readonly list: Other[] = [];
  /** Draw the full model for the eyes too, rather than the stand-in (for measuring what that costs). */
  readonly modelForEyes: boolean;
  readonly #parent: THREE.Object3D;
  readonly #world: World;
  readonly #eyes: Eyes;
  readonly #standInGeometry = standInGeometry();
  readonly #standInMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });

  constructor(parent: THREE.Object3D, world: World, eyes: Eyes, modelForEyes: boolean) {
    this.#parent = parent;
    this.#world = world;
    this.#eyes = eyes;
    this.modelForEyes = modelForEyes;
  }

  get(id: number): Other | null {
    for (let i = 0; i < this.list.length; i++) if (this.list[i].id === id) return this.list[i];
    return null;
  }

  join(id: number, colour: string): Other {
    const known = this.get(id);
    if (known) return known;
    const view = new FlyView(this.#parent, this.#world);
    view.model.mark(colour);
    view.root.visible = false;
    const standIn = new THREE.Mesh(this.#standInGeometry, this.#standInMaterial);
    standIn.scale.setScalar(FLY_LENGTH);
    standIn.visible = false;
    this.#parent.add(standIn);
    if (this.modelForEyes) this.#eyes.see(view.model.object);
    else standIn.layers.set(EYE_LAYER);
    const other: Other = { id, colour, track: new FlyTrack(), view, standIn, state: createFlyState(), position: { x: 0, y: -1e4, z: 0 }, up: { x: 0, y: 1, z: 0 }, present: false, asleep: false };
    this.list.push(other);
    return other;
  }

  leave(id: number) {
    const i = this.list.findIndex((o) => o.id === id);
    if (i < 0) return;
    const o = this.list[i];
    o.view.dispose();
    o.standIn.removeFromParent();
    this.list.splice(i, 1);
  }

  /** A state heard, at room time `now`. */
  heard(state: FlyState, now: number) {
    this.get(state.id)?.track.push(state, now);
  }

  /**
   * Draws each where it was a moment ago at room time `now`, and puts them
   * in this fly's way (`crowd`). Call before this fly lives its frame.
   */
  update(now: number, dt: number, crowd: Crowd) {
    crowd.clear();
    for (const o of this.list) {
      const s = o.state;
      const sampled = o.track.sample(now - o.track.delay, s);
      o.present = sampled !== "empty";
      o.view.root.visible = o.present;
      o.standIn.visible = o.present && !this.modelForEyes;
      if (!o.present) continue;
      o.asleep = !!(s.flags & AWAY) || now - o.track.heardAt > ASLEEP_AFTER;
      const pose = o.view.pose;
      const p = s.pose;
      // A fly whose device has stopped stands still where it was last seen.
      const k = o.asleep ? 0 : 1;
      pose.speed = p.speed * k;
      pose.turn = p.turn * k;
      pose.airborne = !!(s.flags & AIRBORNE) && !o.asleep;
      pose.wings = p.wings * k;
      pose.groom = p.groom * k;
      pose.feed = p.feed * k;
      pose.crouch = p.crouch * k;
      pose.pitch = p.pitch * k;
      pose.roll = p.roll * k;
      o.view.model.update(pose, dt);
      o.position.x = s.x;
      o.position.y = s.y;
      o.position.z = s.z;
      o.up.x = s.upX;
      o.up.z = s.upZ;
      o.up.y = Math.sqrt(Math.max(0, 1 - s.upX * s.upX - s.upZ * s.upZ));
      o.view.place(o.position, s.yaw, o.up);
      if (o.standIn.visible) {
        o.standIn.position.copy(o.view.root.position);
        o.standIn.quaternion.copy(o.view.root.quaternion);
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
  }
}
