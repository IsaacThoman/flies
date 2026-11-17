import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { World, WORLDS } from "@fly/world";
import { HandsView } from "../src/tools/view.ts";
import { OtherFlies } from "../src/online/others.ts";

const gradient = { addColorStop() {} };
const context = new Proxy({}, { get: () => () => gradient });
(globalThis as { document?: unknown }).document = { createElement: () => ({ getContext: () => context }) };
(globalThis as { Path2D?: unknown }).Path2D = class { addPath() {} moveTo() {} bezierCurveTo() {} quadraticCurveTo() {} closePath() {} };

function owned(root: THREE.Object3D) {
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) resources.add(mesh.geometry);
    for (const m of Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []) resources.add(m);
    if (mesh.customDepthMaterial) resources.add(mesh.customDepthMaterial);
    if (mesh.customDistanceMaterial) resources.add(mesh.customDistanceMaterial);
  });
  return resources;
}

function disposals(resources: Iterable<THREE.BufferGeometry | THREE.Material | THREE.Texture | THREE.InstancedMesh>) {
  const counts = new Map<object, number>();
  for (const r of resources) { counts.set(r, 0); (r as { addEventListener(type: "dispose", listener: () => void): void }).addEventListener("dispose", () => { counts.set(r, counts.get(r)! + 1); }); }
  return counts;
}

test("a remote hand frees its geometry, materials and instance buffers while shared textures stay live", () => {
  const scene = new THREE.Scene();
  const local = new HandsView(scene);
  const remote = new HandsView(scene);
  const resources = owned(remote.group);
  const textures = new Set<THREE.Texture>();
  const instances: THREE.InstancedMesh[] = [];
  remote.group.traverse((o) => {
    if ((o as THREE.InstancedMesh).isInstancedMesh) instances.push(o as THREE.InstancedMesh);
    const material = (o as THREE.Mesh).material;
    for (const m of Array.isArray(material) ? material : material ? [material] : []) for (const v of Object.values(m)) if (v instanceof THREE.Texture) textures.add(v);
  });
  const ended = disposals([...resources, ...instances]);
  const shared = disposals(textures);
  remote.dispose();
  assert.ok(ended.size > 15);
  assert.ok([...ended.values()].every((n) => n === 1));
  assert.ok(shared.size > 3);
  assert.ok([...shared.values()].every((n) => n === 0));
  assert.deepEqual(scene.children, [local.group]);
  local.dispose();
});

test("leaving a table frees pooled fly models and the instanced stand-ins without disposing the shared shadow", () => {
  const scene = new THREE.Scene();
  const others = new OtherFlies(scene, new World(WORLDS.picnic));
  let first: ReturnType<OtherFlies["join"]> | undefined;
  for (let i = 0; i < 200; i++) { first = others.join(i, "#ff3355", false); others.leave(i); }
  const resources = owned(scene);
  for (const material of first!.view.model.nerves.materials) resources.add(material);
  const ended = disposals(resources);
  const shared = new Set<THREE.Texture>();
  const instances: THREE.InstancedMesh[] = [];
  scene.traverse((o) => {
    if ((o as THREE.InstancedMesh).isInstancedMesh) {
      instances.push(o as THREE.InstancedMesh);
      const material = (o as THREE.Mesh).material;
      for (const m of Array.isArray(material) ? material : [material]) for (const v of Object.values(m)) if (v instanceof THREE.Texture) shared.add(v);
    }
  });
  const buffers = disposals(instances), shadow = disposals(shared);
  others.dispose();
  assert.ok(ended.size > 10);
  assert.ok([...ended.values()].every((n) => n === 1));
  assert.ok([...buffers.values()].every((n) => n === 1));
  assert.equal(shadow.size, 1);
  assert.equal([...shadow.values()][0], 0);
  assert.deepEqual(scene.children, []);
});

test("a room removal cancels a remote offering still falling so it cannot reappear", async () => {
  const { OtherHand } = await import("../src/online/other-hands.ts");
  const { TablePantry } = await import("../src/online/table-pantry.ts");
  const world = new World(WORLDS.picnic);
  const pantry = new TablePantry(world);
  const scene = new THREE.Scene();
  const hand = new OtherHand(scene, world, 2, "#ff3355", pantry);
  hand.drop(2_000_001, "honey", 0, 0, 0, 0);
  hand.drop(2_000_002, "water", 10, 0, 0, 0);
  hand.forgetFood(2_000_001);
  assert.equal(hand.hands.falling.length, 1);
  const camera = new THREE.PerspectiveCamera();
  const fly = { position: { x: 100, y: 0, z: 0 }, yaw: 0, onFeet: true };
  hand.update(1, 1000, fly, camera, 1, () => 0);
  assert.ok(!pantry.foods.some((f) => f.id === 2_000_001));
  assert.ok(pantry.foods.some((f) => f.id === 2_000_002), "an offering not removed lands normally");
  hand.dispose();
});
