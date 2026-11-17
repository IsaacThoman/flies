import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { World, WORLDS } from "@fly/world";
import { HandsView } from "../src/tools/view.ts";
import { FlyBody } from "@fly/body";
import { createFlyState } from "@fly/net";
import type { FlyView } from "../src/fly-view.ts";
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
  const world = new World(WORLDS.picnic);
  const others = new OtherFlies(scene, world);
  const followed = new FlyBody(world, { x: 0, z: 0, yaw: 0 });
  const camera = new THREE.Vector3(0, 20, 0);
  let model: FlyView | null = null;
  // Each comes close enough to be posed, then leaves: one model, handed from each to the next.
  for (let i = 1; i <= 200; i++) {
    const s = createFlyState();
    s.id = i;
    s.y = 10;
    others.join(i, "#ff3355", false).track.push(s, 0);
    others.update(0, 1 / 60, camera, 1000, followed);
    model = others.get(i)!.view;
    others.leave(i);
  }
  assert.ok(model);
  const resources = owned(scene);
  for (const material of model.model.nerves.materials) resources.add(material);
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

test("online clears wait for the room: rejected falling food still lands; accepted falling food never returns", async () => {
  const { Online } = await import("../src/online/online.ts");
  const { Hands } = await import("../src/tools/hands.ts");
  const { Life } = await import("../src/life.ts");
  const { Company } = await import("../src/company.ts");
  const { Table } = await import("../../server/src/table.ts");
  const world = new World(WORLDS.picnic);
  const brain = (): import("@fly/contracts").BrainDriver => ({ status: "running", error: null, neurons: 0, connections: 0, eyes: null, regionRates: new Float32Array(), state: null, stateAt: 0, tick() {}, dispose() {} });
  const life = new Life(world, brain());
  const company = new Company(world, brain);
  const body = life.body;
  const hands = new Hands(world);
  const clock = { now: 1000 };
  const table = new Table("23456789ab", { place: "picnic", light: "noon", weather: "clear", zone: "", offset: 0 }, "player-key", 7, { now: () => clock.now, wall: () => clock.now });
  const inbox: string[] = [];
  let seat: import("../../server/src/table.ts").Seat;
  const socket: import("@fly/contracts").TableSocket = {
    status: "open", closeCode: 0, closeReason: "",
    send(data) {
      if (typeof data === "string" && JSON.parse(data).type === "hello") {
        seat = table.hello({ send: (m) => { if (typeof m === "string") inbox.push(m); }, close() {} }, "player-key", JSON.parse(data)) as typeof seat;
      } else table.receive(seat, data);
    },
    drain(text) { for (const m of inbox.splice(0)) text(m); },
    close() {},
  };
  const scene = new THREE.Scene();
  const host = {
    scene, life, company, others: new OtherFlies(scene, world), hands, felt: { air: { x: 0, y: 0, z: 0 }, touch: 0, looming: [] },
    stage: { weather: { rain: 0 }, set: {} }, fly: { model: { mark() {} } }, eyes: { see() {} }, bubbles: {},
    flies: () => 1, seat() {}, share: (p: import("@fly/world").Pantry) => life.share(p),
    here: () => "picnic", moving: () => false, onWorld() {}, moveTo() {},
  } as unknown as import("../src/online/online.ts").TableHost;
  const online = new Online(host, () => socket, "ws://test", "23456789ab", "player-key", null);
  const camera = new THREE.PerspectiveCamera();
  const update = () => online.update(0, camera, 0, () => 0);
  update();
  update();
  assert.ok(online.joined);
  const use = (kind: number) => {
    hands.variants[0] = kind;
    hands.update(0, { use: true, holding: true, eye: camera.position }, body, online.pantry);
    update();
    hands.clearEvents();
  };
  for (let i = 0; i < 6; i++) use(0);
  assert.equal(hands.falling.length, 6);
  use(4);
  assert.equal(hands.falling.length, 6, "rate-limited clear preserves the pending offerings");
  hands.update(0.3, { use: false, holding: false, eye: camera.position }, body, online.pantry);
  assert.equal(online.pantry.foods.filter((f) => f.kind === "sugar").length, 6, "rejected clear still lands locally");
  clock.now += 4000;
  use(4);
  table.tick();
  update();
  assert.ok(!online.pantry.foods.some((f) => f.kind === "sugar"), "accepted removal arrives through food.gone");
  clock.now += 4000;
  use(0);
  assert.equal(hands.falling.length, 1);
  use(4);
  table.tick();
  update();
  assert.equal(hands.falling.length, 0, "accepted clear cancels the exact pending fall");
  hands.update(1, { use: false, holding: false, eye: camera.position }, body, online.pantry);
  assert.ok(!online.pantry.foods.some((f) => f.kind === "sugar"));
  assert.ok(online.pantry.foods.some((f) => f.kind === "patch"));
  online.dispose();
});
