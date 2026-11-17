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

test("the coarse eyes see the jar body, glass underside and raised caddy lid", () => {
  const set = buildSet();
  const ray = new THREE.Raycaster(
    new THREE.Vector3(354, 40, 200),
    new THREE.Vector3(0, 0, -1),
  );
  const jar = ray.intersectObjects(set.seen, false)[0];
  assert.ok(
    jar && Math.abs(jar.distance - 52) < 0.1,
    "the jar's lower body blocks the eye before the wall",
  );
  ray.set(new THREE.Vector3(196, 80, -65), new THREE.Vector3(0, 1, 0));
  const cup = ray.intersectObjects(set.seen, false)[0];
  assert.ok(
    cup && Math.abs(cup.distance - 20) < 0.1,
    "the cup's underside is visible from beneath it",
  );
  ray.set(new THREE.Vector3(-369, 250, -170), new THREE.Vector3(0, -1, 0));
  const lid = ray.intersectObjects(set.seen, false)[0];
  assert.ok(
    lid && lid.point.y > 180 && lid.point.y < 190,
    "the raised lid hides the compost from above",
  );
  ray.set(new THREE.Vector3(0, 30, 250), new THREE.Vector3(0, -1, 0));
  assert.equal(ray.intersectObjects(set.seen, false)[0]?.point.y, 0, "the counter is visible under the fly");
  ray.set(new THREE.Vector3(-240, 400, -250), new THREE.Vector3(0, 0, -1));
  assert.equal(ray.intersectObjects(set.seen, false).length, 0, "the glazed opening shows the sky to the eyes");
  ray.set(new THREE.Vector3(-80, 400, -250), new THREE.Vector3(0, 0, -1));
  assert.ok(ray.intersectObjects(set.seen, false).length > 0, "the window mullion remains visible");
  disposeAll(set.group);
  for (const object of set.seen) disposeAll(object);
});
