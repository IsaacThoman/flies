import assert from "node:assert/strict";
import { test } from "node:test";
import { queryObjects } from "node:v8";
import * as THREE from "three";
import { renewScene } from "../src/stage.ts";

// Exercise the actual cache that retained removed lights, not a stand-in with different ownership.
const statesModule = "three/src/renderers/webgl/WebGLRenderStates.js";
const colorModule = "three/src/math/Color.js";
const { WebGLRenderStates } = await import(statesModule) as {
  WebGLRenderStates: new (extensions: { has(): boolean }) => {
    get(scene: THREE.Scene): { init(camera: THREE.Camera): void; pushLight(light: THREE.Light): void; setupLights(): void };
  };
};
const { Color } = await import(colorModule) as { Color: typeof THREE.Color };

test("renewing the near scene carries the actors and environment without cloning GPU resources", () => {
  const scene = new THREE.Scene();
  const actor = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial());
  const light = new THREE.HemisphereLight();
  scene.add(actor, light);
  const environment = new THREE.Texture();
  scene.environment = environment;
  const next = renewScene(scene);
  assert.notEqual(next, scene);
  assert.deepEqual(scene.children, []);
  assert.deepEqual(next.children, [actor, light]);
  assert.equal(actor.parent, next);
  assert.equal(next.environment, environment, "a render-target texture must not be cloned");
});

test("a thousand replacement lights leave only the current scene's uniform colors", () => {
  const baseline = queryObjects(Color, { format: "count" });
  const states = new WebGLRenderStates({ has: () => false });
  const camera = new THREE.PerspectiveCamera();
  let scene = new THREE.Scene();
  const draw = () => {
    const state = states.get(scene);
    state.init(camera);
    state.pushLight(scene.children[0] as THREE.Light);
    state.setupLights();
  };
  for (let i = 0; i < 1000; i++) {
    scene.clear();
    scene = renewScene(scene);
    scene.add(new THREE.PointLight());
    draw();
  }
  // queryObjects collects garbage before counting: no dependence on when a WeakRef happens to clear.
  assert.ok(queryObjects(Color, { format: "count" }) - baseline <= 2, "old per-scene uniform caches were collected");
  assert.equal(states.get(scene), states.get(scene), "keep the renderer cache alive during the count");
});

test("renewing the rendered container preserves a parent's identity for actors joining later", () => {
  const parent = new THREE.Scene();
  const first = new THREE.Group();
  parent.add(first);
  const scene = new THREE.Scene().add(parent);
  const next = renewScene(scene);
  const later = new THREE.Group();
  parent.add(later);
  assert.equal(next.children[0], parent);
  assert.deepEqual(parent.children, [first, later]);
  assert.equal(later.parent?.parent, next);
});
