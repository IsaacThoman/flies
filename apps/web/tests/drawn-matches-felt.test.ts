import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { FLY_HEIGHT, MAX_SLOPE_COS } from "@fly/body";
import { World, createSurface, inside, sideNormal, topHeight, topPeak } from "@fly/world";
import type { Footprint, RayHit, Surface } from "@fly/world";
import { SCENES } from "../src/places/index.ts";
import { AREA_STRIDE } from "../src/places/restaurant/kinds.ts";
import { TOP } from "../src/places/restaurant/tabletop-glsl.ts";
import { Batch, disposeAll } from "../src/scene/build.ts";
import { NO_PRINTS } from "../src/scene/prints.ts";
import { blankCanvas } from "./canvas.ts";

// Textures cannot change the silhouette; no renderer or browser is needed.
(globalThis as { document?: unknown }).document = { createElement: () => ({ getContext: blankCanvas }) };
(globalThis as { Path2D?: unknown }).Path2D = class { addPath() {} moveTo() {} bezierCurveTo() {} quadraticCurveTo() {} closePath() {} };

const TOP_TOLERANCE = 0.1;
const SIDE_TOLERANCE = 0.15;

type Lod = "near" | "far";
type Leaf = { box: THREE.Box3; mesh: THREE.Mesh; lod?: Lod };
type Tree = { box: THREE.Box3; children?: Tree[]; leaf?: Leaf };

/** Index views into the finished meshes keep short rays local, even in the room-wide restaurant merge. */
function drawnSet(group: THREE.Group, restaurant: boolean) {
  const leaves: Leaf[] = [];
  const views: THREE.BufferGeometry[] = [];
  const owners = new WeakMap<THREE.Mesh, THREE.BufferGeometry>();
  const components = new WeakMap<THREE.BufferGeometry, { roots: Int32Array; boxes: Map<number, THREE.Box3> }>();
  // Welding final positions recovers connected decorations after merging without
  // relying on build order, source locations, or hooks in production builders.
  const componentBounds = (geometry: THREE.BufferGeometry) => {
    const cached = components.get(geometry);
    if (cached) return cached;
    const pos = geometry.attributes.position;
    const roots = Int32Array.from({ length: pos.count }, (_, i) => i);
    const root = (i: number): number => {
      while (roots[i] !== i) { roots[i] = roots[roots[i]]; i = roots[i]; }
      return i;
    };
    const join = (a: number, b: number) => { roots[root(a)] = root(b); };
    const welded = new Map<string, number>();
    for (let i = 0; i < pos.count; i++) {
      const key = `${Math.round(pos.getX(i) * 1e5)},${Math.round(pos.getY(i) * 1e5)},${Math.round(pos.getZ(i) * 1e5)}`;
      const before = welded.get(key);
      if (before === undefined) welded.set(key, i);
      else join(i, before);
    }
    const count = geometry.index?.count ?? pos.count;
    for (let i = 0; i < count; i += 3) {
      const a = geometry.index?.getX(i) ?? i;
      join(a, geometry.index?.getX(i + 1) ?? i + 1);
      join(a, geometry.index?.getX(i + 2) ?? i + 2);
    }
    const boxes = new Map<number, THREE.Box3>();
    const p = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      const r = roots[i] = root(i);
      let box = boxes.get(r);
      if (!box) boxes.set(r, (box = new THREE.Box3()));
      box.expandByPoint(p.fromBufferAttribute(pos, i));
    }
    const result = { roots, boxes };
    components.set(geometry, result);
    return result;
  };
  group.updateMatrixWorld(true);
  group.traverse((object) => {
    // The eye-only copy, hidden visitors, prints and weather aren't the static set.
    if (!(object instanceof THREE.Mesh) || !object.layers.isEnabled(0)) return;
    let detail = false;
    for (let p: THREE.Object3D | null = object; p; p = p.parent) {
      if (!p.visible) {
        if (restaurant && p instanceof THREE.Group && p.parent === group) detail = true;
        else return;
      }
    }
    const source: THREE.BufferGeometry = object.geometry;
    const pos = source.attributes.position;
    const index = source.index;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const ranges = Array.isArray(object.material) ? source.groups : [{ start: 0, count: index?.count ?? pos.count, materialIndex: 0 }];
    const matrices: THREE.Matrix4[] = [];
    if (object instanceof THREE.InstancedMesh) {
      for (let i = 0; i < object.count; i++) {
        const matrix = new THREE.Matrix4();
        object.getMatrixAt(i, matrix);
        matrices.push(matrix.premultiply(object.matrixWorld));
      }
    } else matrices.push(object.matrixWorld);
    for (const matrix of matrices) for (const range of ranges) {
      const material = materials[range.materialIndex ?? 0];
      // Shadow/glow/rain shaders blend light rather than depict physical glass.
      if (!material.visible || material.opacity === 0 || (material.transparent && (material.blending !== THREE.NormalBlending || material.polygonOffset))) continue;
      const buckets = new Map<Lod | undefined, number[]>();
      const begin = Math.max(range.start, source.drawRange.start);
      const end = Math.min(range.start + range.count, source.drawRange.start + source.drawRange.count);
      for (let i = begin; i < end; i += 3) {
        const a = index?.getX(i) ?? i;
        // The shader folds tagged stand-ins away in detail; shell vertices stay in both LODs.
        const lod = detail ? "near" : restaurant && (source.attributes.kind?.getX(a) ?? 0) >= AREA_STRIDE ? "far" : undefined;
        let list = buckets.get(lod);
        if (!list) buckets.set(lod, (list = []));
        list.push(a, index?.getX(i + 1) ?? i + 1, index?.getX(i + 2) ?? i + 2);
      }
      const p = new THREE.Vector3();
      const split = (indices: number[], lod?: Lod) => {
        const box = new THREE.Box3();
        for (const i of indices) box.expandByPoint(p.fromBufferAttribute(pos, i));
        if (indices.length <= 192) {
          const geometry = new THREE.BufferGeometry();
          // Share the real built attributes; only the acceleration index is test-owned.
          for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute);
          geometry.setIndex(indices);
          geometry.boundingBox = box.clone();
          geometry.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
          const mesh = new THREE.Mesh(geometry, material);
          mesh.matrixWorld.copy(matrix);
          owners.set(mesh, source);
          leaves.push({ box: box.applyMatrix4(matrix), mesh, lod });
          views.push(geometry);
          return;
        }
        const size = box.getSize(p);
        const axis = size.x >= size.y && size.x >= size.z ? 0 : size.y >= size.z ? 1 : 2;
        const triangles = Array.from({ length: indices.length / 3 }, (_, i) => i * 3);
        const centers = new Float64Array(triangles.length);
        for (const i of triangles) centers[i / 3] = pos.getComponent(indices[i], axis) + pos.getComponent(indices[i + 1], axis) + pos.getComponent(indices[i + 2], axis);
        triangles.sort((a, b) => centers[a / 3] - centers[b / 3]);
        const ordered = new Array<number>(indices.length);
        for (let i = 0; i < triangles.length; i++) for (let j = 0; j < 3; j++) ordered[i * 3 + j] = indices[triangles[i] + j];
        const mid = Math.floor(triangles.length / 2) * 3;
        split(ordered.slice(0, mid), lod);
        split(ordered.slice(mid), lod);
      };
      for (const [lod, indices] of buckets) if (indices.length) split(indices, lod);
    }
  });
  const tree = (list: Leaf[]): Tree => {
    const box = new THREE.Box3();
    for (const leaf of list) box.union(leaf.box);
    if (list.length === 1) return { box, leaf: list[0] };
    const size = box.getSize(new THREE.Vector3());
    const axis = size.x >= size.y && size.x >= size.z ? "x" : size.y >= size.z ? "y" : "z";
    list.sort((a, b) => a.box.min[axis] + a.box.max[axis] - b.box.min[axis] - b.box.max[axis]);
    const mid = Math.floor(list.length / 2);
    return { box, children: [tree(list.slice(0, mid)), tree(list.slice(mid))] };
  };
  assert.ok(leaves.length, "built set has physical meshes");
  const root = tree(leaves);
  const hits: THREE.Intersection[] = [];
  const segment = new THREE.Box3();
  const end = new THREE.Vector3();
  const decoration = (hit: THREE.Intersection, base: number) => {
    const mesh = hit.object as THREE.Mesh;
    if (hit.point.y >= base + 0.5) return false;
    const material = mesh.material as THREE.Material;
    const kind = mesh.geometry.attributes.kind?.getX(hit.face!.a);
    // Offset sheets and the tagged basket lining are thin paint/cloth, even
    // where the same sheet drapes down past the floor or the basket's rim.
    if (material.polygonOffset || (kind !== undefined && kind % AREA_STRIDE === TOP.napkin)) return true;
    const { roots, boxes } = componentBounds(owners.get(mesh)!);
    const box = boxes.get(roots[hit.face!.a])!.clone().applyMatrix4(mesh.matrixWorld);
    // A pressing or grommet may be let into its support; only its exposed
    // thickness matters, but a whole tall solid must never count as decoration.
    return box.max.y < base + 0.5 && box.min.y >= base - 1;
  };
  return {
    cast(ray: THREE.Raycaster, lod: Lod, side: boolean, base?: number, before = Infinity) {
      hits.length = 0;
      segment.makeEmpty().expandByPoint(ray.ray.origin).expandByPoint(end.copy(ray.ray.direction).multiplyScalar(ray.far).add(ray.ray.origin));
      const visit = (node: Tree) => {
        if (!segment.intersectsBox(node.box) || !ray.ray.intersectsBox(node.box)) return;
        if (node.children) { for (const child of node.children) visit(child); return; }
        const leaf = node.leaf!;
        if (leaf.lod && leaf.lod !== lod) return;
        // Clear tops/liquids deliberately differ from the smooth world; glass sides still matter.
        if (!side && (leaf.mesh.material as THREE.Material).transparent) return;
        leaf.mesh.raycast(ray, hits);
      };
      visit(root);
      hits.sort((a, b) => a.distance - b.distance);
      return hits.find((hit) => base === undefined || hit.distance >= before || !decoration(hit, base));
    },
    dispose() { for (const geometry of views) geometry.dispose(); },
  };
}

function radii(f: Footprint) { return f.kind === "circle" ? [f.r, f.r] : f.kind === "ellipse" ? [f.rx, f.rz] : [f.hx, f.hz]; }
function point(f: Footprint, u: number, v: number) {
  const a = f.kind === "circle" ? 0 : f.angle;
  return { x: f.x + u * Math.cos(a) + v * Math.sin(a), z: f.z - u * Math.sin(a) + v * Math.cos(a) };
}

function standable(world: World, x: number, z: number, layer: number, surface: Surface) {
  world.surface(x, z, surface, layer + 0.05);
  return surface.onTable && Math.abs(surface.y - layer) <= 0.05 && surface.normal.y >= MAX_SLOPE_COS && surface.underside >= surface.y + FLY_HEIGHT && world.solidAt(x, surface.y + 0.001, z) < 0;
}

function topSite(world: World, x: number, z: number, layer: number, surface: Surface) {
  if (!standable(world, x, z, layer, surface)) return false;
  const felt = surface.y;
  // Same-layer checks avoid both rounded footprint edges and a pot above a saucer.
  for (let i = 0; i < 32; i++) {
    const a = i * Math.PI / 16;
    if (!standable(world, x + Math.cos(a), z + Math.sin(a), felt, surface)) return false;
  }
  world.surface(x, z, surface, layer + 0.05);
  return true;
}

const EXCEPTIONS: Partial<Record<keyof typeof SCENES, Readonly<Record<string, string>>>> = {
  windowsill: {
    clock: "The round drum and back bead need a redesign of the stepped collision slices.",
    bell: "The clock drum also overlaps the bells' column envelopes beside those slices.",
    "basil tip": "The leafy crown uses a smooth collision envelope rather than individual foliage.",
  },
};

for (const scene of Object.values(SCENES)) test(`${scene.id}: drawn tops and sides stay inside felt surfaces`, (t) => {
  const cpu = process.cpuUsage();
  const world = new World(scene.place);
  const set = scene.buildSet();
  for (let n = 0; set.more?.(); n++) assert.ok(n < 100, "staged build finishes");
  let meshes = 0, triangles = 0;
  set.group.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.layers.isEnabled(0)) return;
    meshes++;
    triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3 * (object instanceof THREE.InstancedMesh ? object.count : 1);
  });
  // Indoor decoration adds 160 sill triangles; lab grains and a separately sorted
  // liquid add 736 triangles and one mesh. Picnic snowfall adds one instanced
  // quad mesh; the existing triangle ceiling still holds.
  const budget = { picnic: [25, 53307], windowsill: [15, 62304], lab: [10, 71756], bar: [8, 93060], restaurant: [40, 371299] }[scene.id];
  assert.ok(meshes <= budget[0] && triangles <= budget[1], `${meshes} meshes, ${triangles} triangles: stay within the measured geometry budgets`);
  const drawn = drawnSet(set.group, scene.id === "restaurant");
  const ray = new THREE.Raycaster();
  const surface = createSurface();
  const worldHit: RayHit = { point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 0 }, solid: -1, t: 0 };
  const failures = new Map<string, string>();
  let tops = 0, sides = 0;
  let lod: Lod = "near";
  const report = (name: string, kind: string, x: number, y: number, z: number, drawn: number, felt: number) => {
    const message = `${scene.id}/${lod}: ${name} ${kind} (${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(3)}) drawn=${drawn.toFixed(3)} felt=${felt.toFixed(3)} mm`;
    if (EXCEPTIONS[scene.id]?.[name]) return;
    failures.set(message, message);
  };
  const rough = (x: number, y: number, z: number) => world.solids.some((s) => NO_PRINTS.has(s.name) && inside(s.footprint, x, z) && y >= (s.bottom ?? 0) && y <= topPeak(s.top) + 3);
  const top = (x: number, z: number, layer: number) => {
    if (layer > scene.place.ceiling + FLY_HEIGHT || !topSite(world, x, z, layer, surface)) return;
    const name = surface.solid < 0 ? "floor" : world.solids[surface.solid].name;
    if (NO_PRINTS.has(name)) return;
    const felt = surface.y;
    const above = Math.min(felt + FLY_HEIGHT, world.underside(x, z, felt) - 0.001);
    ray.set(new THREE.Vector3(x, above, z), new THREE.Vector3(0, -1, 0));
    ray.far = above - felt + 0.01;
    tops++;
    const hit = drawn.cast(ray, lod, false, felt, above - felt - TOP_TOLERANCE);
    if (!hit?.face || rough(x, hit.point.y, z)) return;
    if (hit.point.y - felt > TOP_TOLERANCE) report(name, "top", x, felt, z, hit.point.y, felt);
  };
  const side = (f: Footprint, u: number, v: number) => {
    const edge = point(f, u, v);
    const n = sideNormal(f, edge.x, edge.z, { x: 0, y: 0, z: 0 });
    const x = edge.x + n.x * 3, z = edge.z + n.z * 3;
    if (!world.onTable(x, z)) return;
    // Every exposed layer beside a column/slab matters, including the floor under a table.
    const bases = new Set([0, ...world.solids.filter((s) => inside(s.footprint, x, z)).map((s) => topHeight(s, x, z))]);
    for (const base of bases) {
      if (base > scene.place.ceiling + FLY_HEIGHT || !standable(world, x, z, base, surface)) continue;
      for (const lift of [0.4, 0.85, FLY_HEIGHT]) {
        const y = base + lift;
        if (y > scene.place.ceiling + FLY_HEIGHT) continue;
        if (world.solidAt(x, y, z) >= 0 || world.solidAt(x - n.x * 0.001, y, z - n.z * 0.001) >= 0) continue;
        ray.set(new THREE.Vector3(x, y, z), new THREE.Vector3(-n.x, 0, -n.z));
        ray.far = 6;
        const felt = world.raycast(ray.ray.origin, ray.ray.direction, worldHit, ray.far);
        // Slopes and undersides aren't a column's side; overlapping solids can hide it.
        if (!felt || felt.solid < 0 || Math.abs(felt.normal.y) > 0.01) continue;
        const solid = world.solids[felt.solid];
        if (topPeak(solid.top) - base <= FLY_HEIGHT || NO_PRINTS.has(solid.name)) continue;
        const f = solid.footprint;
        if (f.kind === "box") {
          const dx = felt.point.x - f.x, dz = felt.point.z - f.z;
          const u = dx * Math.cos(f.angle) - dz * Math.sin(f.angle);
          const v = dx * Math.sin(f.angle) + dz * Math.cos(f.angle);
          const nx = felt.normal.x * Math.cos(f.angle) - felt.normal.z * Math.sin(f.angle);
          if ((Math.abs(nx) > 0.5 ? f.hz - Math.abs(v) : f.hx - Math.abs(u)) < 1) continue;
        }
        sides++;
        const hit = drawn.cast(ray, lod, true, base, felt.t - SIDE_TOLERANCE);
        if (!hit?.face || rough(hit.point.x, y, hit.point.z)) continue;
        if (felt.t - hit.distance > SIDE_TOLERANCE) report(solid.name, "side distance", x, y, z, hit.distance, felt.t);
      }
    }
  };
  try {
    for (const mode of scene.id === "restaurant" ? ["near", "far"] as const : ["near"] as const) {
      lod = mode;
      const floor = scene.place.floor;
      const [hx, hz] = floor.kind === "circle" ? [floor.r, floor.r] : [floor.hx, floor.hz];
      for (let i = 0; i < 25; i++) for (let j = 0; j < 25; j++) top(hx * (2 * (i + 0.5) / 25 - 1), hz * (2 * (j + 0.5) / 25 - 1), 0);
      for (const s of world.solids) {
        const f = s.footprint, [rx, rz] = radii(f);
        if (topPeak(s.top) <= scene.place.ceiling + FLY_HEIGHT) {
          top(f.x, f.z, topHeight(s, f.x, f.z));
          for (const r of [0.25, 0.5, 0.75, 0.9]) for (let k = 0; k < 16; k++) {
            const a = k * Math.PI / 8;
            const scale = f.kind === "box" ? 1 / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a))) : 1;
            const p = point(f, rx * Math.cos(a) * r * scale, rz * Math.sin(a) * r * scale);
            top(p.x, p.z, topHeight(s, p.x, p.z));
          }
        }
        if (f.kind === "box") {
          // A millimetre at each end prevents corner-grazing rays amplifying tiny differences.
          for (const sign of [-1, 1]) for (const fraction of [-0.75, 0, 0.75]) {
            if (rz * (1 - Math.abs(fraction)) >= 1) side(f, sign * rx, fraction * rz);
            if (rx * (1 - Math.abs(fraction)) >= 1) side(f, fraction * rx, sign * rz);
          }
        } else for (let k = 0; k < 16; k++) side(f, rx * Math.cos(k * Math.PI / 8), rz * Math.sin(k * Math.PI / 8));
      }
    }
    const used = process.cpuUsage(cpu);
    t.diagnostic(`${tops} tops, ${sides} sides; ${meshes} meshes, ${triangles} triangles; ${((used.user + used.system) / 1000).toFixed(0)} ms CPU`);
    assert.ok(tops > 100 && sides > 100, "both surfaces are exercised");
    assert.equal(failures.size, 0, [...failures.values()].join("\n"));
  } finally {
    drawn.dispose();
    disposeAll(set.group);
  }
});

test("top sites reject edges and blocked layers while retaining the floor beneath a slab", () => {
  const world = new World({
    floor: { kind: "rect", hx: 40, hz: 40 }, ceiling: 60, patches: [], start: { x: 0, z: 0, yaw: 0 },
    solids: [
      { name: "slab", footprint: { kind: "box", x: 0, z: 0, hx: 10, hz: 10, angle: 0 }, bottom: 4, top: { kind: "flat", y: 8 } },
      { name: "pot", footprint: { kind: "circle", x: 0, z: 0, r: 3 }, bottom: 8, top: { kind: "flat", y: 50 } },
      { name: "column", footprint: { kind: "circle", x: 20, z: 0, r: 3 }, top: { kind: "flat", y: 20 } },
    ],
  });
  const surface = createSurface();
  assert.ok(topSite(world, 0, 0, 0, surface), "air under the slab is a separate floor layer");
  assert.ok(topSite(world, 5, 0, 8, surface), "clear slab top beside the pot");
  assert.equal(topSite(world, 0, 0, 8, surface), false, "a pot never becomes a drawn hit on the slab below it");
  assert.equal(topSite(world, 23.01, 0, 0, surface), false, "just outside a column is not an interior floor sample");
  assert.equal(topSite(world, 9.99, 0, 8, surface), false, "just inside the slab edge is not an interior top sample");
  assert.equal(topSite(world, 3.01, 0, 8, surface), false, "the nearby pot interrupts the height layer");
});

test("the bounds tree preserves merged geometry, transforms, glass sides and both restaurant LODs", () => {
  const group = new THREE.Group();
  const opaque = new THREE.MeshStandardMaterial();
  const glass = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.3 });
  const batch = new Batch();
  batch.add(opaque, new THREE.BoxGeometry(12.4, 8.4, 12.4).translate(0, 4, 0));
  batch.add(opaque, new THREE.PlaneGeometry(3, 3).rotateX(-Math.PI / 2).translate(0, 8.35, 0));
  batch.add(glass, new THREE.BoxGeometry(1, 20, 20).translate(15, 10, 0));
  for (const mesh of batch.build(group)) mesh.matrixWorldAutoUpdate = true;
  group.position.x = 10;
  const tree = drawnSet(group, false);
  const ray = new THREE.Raycaster(new THREE.Vector3(10, 9.3, 0), new THREE.Vector3(0, -1, 0), 0, 1.31);
  try {
    // The permitted thin film must not mask a 0.2 mm error in the thick solid below it.
    const hit = tree.cast(ray, "near", false, 8, 1.199)!;
    assert.ok(Math.abs(hit.point.y - 8.2) < 0.001);
    ray.set(new THREE.Vector3(19, 0.4, 0), new THREE.Vector3(-1, 0, 0));
    ray.far = 6;
    assert.ok(3 - tree.cast(ray, "near", true, 0, 2.849)!.distance > 0.15, "a 0.2 mm proud side fails");
    ray.set(new THREE.Vector3(21, 0.85, 0), new THREE.Vector3(1, 0, 0));
    assert.ok(Math.abs(tree.cast(ray, "near", true)!.distance - 3.5) < 0.001, "glass still blocks the fly's side");
  } finally { tree.dispose(); disposeAll(group); }

  const lods = new THREE.Group();
  const tag = (g: THREE.BufferGeometry, kind: number) => {
    g.setAttribute("kind", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(kind), 1));
    return g;
  };
  lods.add(new THREE.Mesh(tag(new THREE.PlaneGeometry(10, 10).rotateX(-Math.PI / 2).translate(0, 2, 0), AREA_STRIDE), opaque));
  const detail = new THREE.Group();
  detail.visible = false;
  detail.add(new THREE.Mesh(tag(new THREE.PlaneGeometry(10, 10).rotateX(-Math.PI / 2).translate(0, 3, 0), 0), opaque));
  lods.add(detail);
  const both = drawnSet(lods, true);
  ray.set(new THREE.Vector3(0, 4, 0), new THREE.Vector3(0, -1, 0));
  ray.far = 4;
  try {
    assert.equal(both.cast(ray, "near", false)!.point.y, 3);
    assert.equal(both.cast(ray, "far", false)!.point.y, 2);
  } finally { both.dispose(); disposeAll(lods); }
});
