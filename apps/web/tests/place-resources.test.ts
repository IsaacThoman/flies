import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { Goings } from "../src/places/picnic/life.ts";
import { disposeAll } from "../src/scene/build.ts";
import { SHADE } from "../src/scene/shade.ts";

// Painting is immaterial to ownership; three's real textures/materials still dispatch disposal.
const gradient = { addColorStop() {} };
const context = new Proxy({}, { get: () => () => gradient });
(globalThis as { document?: unknown }).document = { createElement: () => ({ getContext: () => context }) };
(globalThis as { Path2D?: unknown }).Path2D = class { addPath() {} moveTo() {} bezierCurveTo() {} quadraticCurveTo() {} closePath() {} };

test("the picnic reuses its injected shadow map across place rebuilds", () => {
  const first = new Goings(() => {});
  const texture = SHADE.uShadeMap.value!;
  disposeAll(first.group);
  const second = new Goings(() => {});
  assert.equal(SHADE.uShadeMap.value, texture);
  disposeAll(second.group);
});

test("disposing a material extended as it compiles frees the textures in its own uniforms", () => {
  const material = new THREE.MeshPhysicalMaterial();
  material.userData.uniforms = { uContact: { value: new THREE.DataTexture(new Uint8Array(4), 1, 1) } };
  let disposed = 0;
  material.userData.uniforms.uContact.value.addEventListener("dispose", () => disposed++);
  disposeAll(new THREE.Group().add(new THREE.Mesh(new THREE.PlaneGeometry(), material)));
  assert.equal(disposed, 1);
});
