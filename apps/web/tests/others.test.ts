import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import type { BrainDriver } from "@fly/contracts";
import { Pantry, createPicnic } from "@fly/world";
import { Company } from "../src/company.ts";
import { EYE_LAYER } from "../src/eyes/eyes.ts";
import { Life } from "../src/life.ts";
import { OtherFlies } from "../src/online/others.ts";
import { blankCanvas } from "./canvas.ts";

test("stand-ins hide only the refreshing fly and restore the previous fly, including the followed one", (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { createElement: () => ({ width: 0, height: 0, getContext: () => blankCanvas() }) },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else Reflect.deleteProperty(globalThis, "document");
  });
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
