import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { buildSet } from "../src/places/kitchen/set.ts";
import { disposeAll } from "../src/scene/build.ts";

test("kitchen set merges mixed glass geometry and keeps its meshes finite and frozen", () => {
  const set = buildSet();
  assert.equal(set.group.children.length, 2);
  for (const object of set.group.children) {
    assert.ok(object instanceof THREE.Mesh);
    assert.equal(object.matrixAutoUpdate, false);
    const positions = object.geometry.getAttribute("position");
    assert.ok(positions.count > 0);
    for (const n of positions.array) assert.ok(Number.isFinite(n));
  }
  assert.ok(set.seen.length > 0);
  disposeAll(set.group);
  for (const object of set.seen) disposeAll(object);
});
