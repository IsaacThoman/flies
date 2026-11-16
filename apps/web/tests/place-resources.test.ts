import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { Goings } from "../src/places/picnic/life.ts";
import { solidMaterial } from "../src/places/bar/materials.ts";
import { disposeAll } from "../src/scene/build.ts";
import { SHADE } from "../src/scene/shade.ts";

// Painting is immaterial to ownership; three's real textures/materials still dispatch disposal.
const gradient = { addColorStop() {} };
const context = new Proxy({}, { get: () => () => gradient });
(globalThis as { document?: unknown }).document = { createElement: () => ({ getContext: () => context }) };
(globalThis as { Path2D?: unknown }).Path2D = class { addPath() {} };

test("the picnic reuses its injected shadow map across place rebuilds", () => {
  const first = new Goings(() => {});
  const texture = SHADE.uShadeMap.value!;
  disposeAll(first.group);
  const second = new Goings(() => {});
  assert.equal(SHADE.uShadeMap.value, texture);
  disposeAll(second.group);
});

test("disposing the bar's solid material frees its injected contact map", () => {
  const shared = { time: { value: 0 }, sunSoft: { value: 0 }, lamps: { value: 0 }, candle: { value: 0 } } as unknown as Parameters<typeof solidMaterial>[3];
  const solid = solidMaterial([], [], { shelves: [], shelfX: [0, 0], shelfZ: 0, sconces: [] }, shared, new THREE.Vector3(), { x: 0, z: 0, rx: 1, angle: 0, base: 0, height: 1 }, []);
  let disposed = 0;
  solid.uniforms.uContact.value.addEventListener("dispose", () => disposed++);
  disposeAll(new THREE.Group().add(new THREE.Mesh(new THREE.PlaneGeometry(), solid.material)));
  assert.equal(disposed, 1);
});
