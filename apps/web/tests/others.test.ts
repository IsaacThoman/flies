import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import type { BrainDriver } from "@fly/contracts";
import { Pantry, createPicnic } from "@fly/world";
import { Company } from "../src/company.ts";
import { EYE_LAYER } from "../src/eyes/eyes.ts";
import { Life } from "../src/life.ts";
import { FLY_LENGTH } from "@fly/body";
import { MAX_FLIES, createFlyState } from "@fly/net";
import { EYES_MOST, FAR_PIXELS, MODELS_MOST, OtherFlies } from "../src/online/others.ts";
import { blankCanvas } from "./canvas.ts";

function withDocument(t: { after(f: () => void): void }) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { createElement: () => ({ width: 0, height: 0, getContext: () => blankCanvas() }) },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else Reflect.deleteProperty(globalThis, "document");
  });
}

test("stand-ins hide only the refreshing fly and restore the previous fly, including the followed one", (t) => {
  withDocument(t);
  const world = createPicnic();
  const parent = new THREE.Group();
  const brain = () => ({ dispose() {} }) as BrainDriver;
  const own = new Life(world, brain());
  const company = new Company(world, brain);
  company.resize(2, new Pantry(world));
  const others = new OtherFlies(parent, world);
  t.after(() => { others.dispose(); company.dispose(); });
  others.company = company.list;
  others.update(0, 1 / 60, new THREE.Vector3(0, 1000, 0), 100, own.body);
  const eyes = parent.children.find((o) => o instanceof THREE.InstancedMesh && o.layers.isEnabled(EYE_LAYER)) as THREE.InstancedMesh;
  assert.ok(eyes);
  assert.equal(eyes.count, 3);
  const array = eyes.instanceMatrix.array;
  const before = Array.from(array.slice(0, 3 * 16));
  others.hideFromEyes(1);
  assert.deepEqual(Array.from(array.slice(0, 16)), Array(16).fill(0));
  assert.deepEqual(Array.from(array.slice(16, 48)), before.slice(16));
  others.hideFromEyes(2);
  assert.deepEqual(Array.from(array.slice(0, 16)), before.slice(0, 16), "previous companion restored");
  assert.deepEqual(Array.from(array.slice(16, 32)), Array(16).fill(0));
  others.hideFromEyes(0);
  assert.deepEqual(Array.from(array.slice(0, 48)), before, "companions restored");
  assert.equal(eyes.count, 2, "only the followed fly, at the end, is left out");
  others.hideFromEyes(-1);
  assert.equal(eyes.count, 3);
  assert.deepEqual(Array.from(array.slice(0, 48)), before);
  others.hideFromEyes(-1);
  assert.equal(eyes.count, 3, "restoring twice is harmless");
});

test("at a full table only the nearest flies are posed, from a pool of no more models than that, and the eyes see only the nearest", (t) => {
  withDocument(t);
  const world = createPicnic();
  const parent = new THREE.Group();
  const own = new Life(world, { dispose() {} } as BrainDriver);
  own.body.position.x = 0;
  own.body.position.z = 0;
  const others = new OtherFlies(parent, world);
  t.after(() => others.dispose());
  // Every other fly at a full table, in a line going away from the camera, the farthest first: each is FLY_LENGTH × 100 / its distance pixels long.
  const camera = new THREE.Vector3(0, 10, 0);
  const pixels = 100;
  const n = MAX_FLIES - 1;
  for (let i = 0; i < n; i++) {
    const id = i + 2;
    const s = createFlyState();
    s.id = id;
    s.x = 1 + (n - i) * 0.5;
    s.y = 10;
    others.join(id, "#ff3355", false).track.push(s, 0);
  }
  const models = () => parent.children.filter((o) => o instanceof THREE.Group).length;
  const mostNear = others.list.filter((o) => (FLY_LENGTH / Math.max(1, o.track.newest!.x)) * pixels >= FAR_PIXELS).length;
  assert.ok(mostNear > MODELS_MOST, `${mostNear} big enough to pose: more than may be`);
  others.update(0, 1 / 60, camera, pixels, own.body);
  const posed = others.list.filter((o) => o.near);
  assert.equal(posed.length, MODELS_MOST);
  assert.deepEqual(posed.map((o) => o.id).sort((a, b) => a - b), others.list.slice(-MODELS_MOST).map((o) => o.id).sort((a, b) => a - b), "the nearest");
  assert.ok(posed.every((o) => o.view?.root.visible));
  assert.ok(others.list.every((o) => o.near || !o.view));
  assert.equal(models(), MODELS_MOST);
  const eyes = parent.children.find((o) => o instanceof THREE.InstancedMesh && o.layers.isEnabled(EYE_LAYER)) as THREE.InstancedMesh;
  assert.equal(eyes.count, EYES_MOST + 1, "the nearest others, and the followed fly");
  // The followed fly is at the line's near end: the eyes see those nearest it, the line's last.
  const seen = Array.from({ length: EYES_MOST }, (_, i) => eyes.instanceMatrix.array[i * 16 + 12]).sort((a, b) => a - b);
  assert.deepEqual(seen, others.list.slice(-EYES_MOST).map((o) => o.track.newest!.x).sort((a, b) => a - b));
  // Turned round, the camera is nearest the farthest: their models pass to those, and none are made.
  camera.set(1 + n * 0.5 + 1, 10, 0);
  others.update(0, 1 / 60, camera, pixels, own.body);
  assert.deepEqual(others.list.filter((o) => o.near).map((o) => o.id), others.list.slice(0, MODELS_MOST).map((o) => o.id));
  assert.equal(models(), MODELS_MOST);
  for (const o of others.list.slice(0, MODELS_MOST)) others.leave(o.id);
  others.update(0, 1 / 60, camera, pixels, own.body);
  assert.equal(others.list.filter((o) => o.near).length, MODELS_MOST);
  assert.equal(models(), MODELS_MOST, "a fly leaving gives its model to the next nearest");
});
