// The table and the picnic on it, built from the world's description
// (packages/world/src/picnic.ts) so that what the fly stands on is exactly
// what is drawn. Merged by material into a few meshes.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { DECOR, PATCHES, SOLIDS, TABLE_RADIUS, topHeight, topNormal } from "@fly/world";
import type { Solid } from "@fly/world";
import { Batch, canvas2d, canvasTexture, freeze, mat4, paint, random } from "./build.ts";
import { LAWN_Y } from "./backdrop.ts";

export type Table = {
  group: THREE.Group;
  /** Materials whose look follows the time of day. */
  materials: THREE.MeshStandardMaterial[];
  /** What the fly's eyes see of the table: the big shapes, without the small details. */
  seen: THREE.Object3D[];
  update(time: number): void;
};

const byName = (name: string) => SOLIDS.filter((s) => s.name === name);
const one = (name: string) => byName(name)[0];

/** The uv of a table point, for painting the table's texture. */
const tableUV = (x: number, z: number, size: number) => ({ px: (0.5 + x / (TABLE_RADIUS * 2)) * size, py: (0.5 + z / (TABLE_RADIUS * 2)) * size });

function tableTexture() {
  const S = 1024;
  const { canvas, g } = canvas2d(S, S);
  // Glossy white enamel, a touch warmer at the middle.
  const base = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  base.addColorStop(0, "#ffffff");
  base.addColorStop(0.8, "#f4f8fb");
  base.addColorStop(1, "#dfe9f2");
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  // A blue gingham napkin.
  const { napkin } = DECOR;
  const n = tableUV(napkin.x, napkin.z, S);
  const size = (napkin.size / (TABLE_RADIUS * 2)) * S;
  g.save();
  g.translate(n.px, n.py);
  g.rotate(-napkin.angle);
  g.fillStyle = "#ffffff";
  g.fillRect(-size / 2, -size / 2, size, size);
  const check = size / 12;
  for (let i = 0; i < 12; i++) {
    g.fillStyle = "rgba(70, 150, 230, 0.45)";
    g.fillRect(-size / 2 + i * check, -size / 2, check / 2, size);
    g.fillRect(-size / 2, -size / 2 + i * check, size, check / 2);
  }
  g.strokeStyle = "rgba(40, 110, 200, 0.6)";
  g.lineWidth = 3;
  g.strokeRect(-size / 2 + 6, -size / 2 + 6, size - 12, size - 12);
  g.restore();
  // Soft contact shadows under everything standing on the table.
  const shadow = (x: number, z: number, r: number, strength: number) => {
    const c = tableUV(x + r * 0.15, z + r * 0.2, S);
    const rr = (r / (TABLE_RADIUS * 2)) * S * 1.35;
    const grad = g.createRadialGradient(c.px, c.py, rr * 0.2, c.px, c.py, rr);
    grad.addColorStop(0, `rgba(40, 70, 110, ${strength})`);
    grad.addColorStop(1, "rgba(40, 70, 110, 0)");
    g.fillStyle = grad;
    g.fillRect(c.px - rr, c.py - rr, rr * 2, rr * 2);
  };
  for (const solid of SOLIDS) {
    const f = solid.footprint;
    const r = f.kind === "circle" ? f.r : f.kind === "ellipse" ? Math.max(f.rx, f.rz) : Math.max(f.hx, f.hz) * 1.3;
    if (solid.name === "straw" || solid.name === "dew") continue;
    shadow(f.x, f.z, r, solid.name === "lemonade" || solid.name === "jam" ? 0.32 : 0.26);
  }
  // A wet ring left by the lemonade jar.
  const ring = tableUV(-60, -110, S);
  g.beginPath();
  g.arc(ring.px, ring.py, (30 / (TABLE_RADIUS * 2)) * S, 0, Math.PI * 1.7);
  g.strokeStyle = "rgba(150, 200, 235, 0.35)";
  g.lineWidth = 3;
  g.stroke();
  const texture = canvasTexture(canvas);
  return texture;
}

function ginghamTexture(color: string) {
  const { canvas, g } = canvas2d(128, 128);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = color;
  for (let i = 0; i < 8; i++) {
    g.globalAlpha = 0.55;
    g.fillRect(i * 16, 0, 8, 128);
    g.fillRect(0, i * 16, 128, 8);
  }
  g.globalAlpha = 1;
  const texture = canvasTexture(canvas, { repeat: true });
  texture.repeat.set(1.6, 1.6);
  return texture;
}

/** The top of a domed solid as a mesh: a polar grid over its footprint, at exactly its height. */
function domeGeometry(solid: Solid, rings: number, segments: number) {
  const f = solid.footprint;
  if (f.kind === "box") throw new Error("Boxes are flat");
  const rx = f.kind === "circle" ? f.r : f.rx;
  const rz = f.kind === "circle" ? f.r : f.rz;
  const angle = f.kind === "circle" ? 0 : f.angle;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const positions: number[] = [];
  const normals: number[] = [];
  const n = { x: 0, y: 1, z: 0 };
  const point = (si: number, ti: number) => {
    const sv = Math.min(0.9999, si / rings);
    const th = (ti / segments) * Math.PI * 2;
    const u = Math.cos(th) * rx * sv;
    const v = Math.sin(th) * rz * sv;
    const x = f.x + u * c + v * s;
    const z = f.z - u * s + v * c;
    const y = topHeight(solid, x, z);
    topNormal(solid, x, z, n);
    positions.push(x, y, z);
    normals.push(n.x, n.y, n.z);
  };
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segments; j++) {
      point(i, j);
      point(i + 1, j + 1);
      point(i + 1, j);
      if (i > 0) {
        point(i, j);
        point(i, j + 1);
        point(i + 1, j + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  return geometry;
}

export function buildTable(): Table {
  const group = new THREE.Group();
  const rnd = random(11);
  const glossy = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0, envMapIntensity: 0.6 });
  const juicy = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.16, metalness: 0, envMapIntensity: 0.55 });
  const matte = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0, envMapIntensity: 0.5 });
  const tableMaterial = new THREE.MeshStandardMaterial({ map: tableTexture(), roughness: 0.3, metalness: 0, envMapIntensity: 0.5 });
  const cloth = new THREE.MeshStandardMaterial({ map: ginghamTexture("#e8344e"), roughness: 0.85, side: THREE.DoubleSide });
  const glass = new THREE.MeshStandardMaterial({ color: "#e6f6ff", roughness: 0.04, metalness: 0, transparent: true, opacity: 0.14, depthWrite: false, envMapIntensity: 1.4 });
  const liquid = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, transparent: true, opacity: 0.72, depthWrite: false });
  const batch = new Batch();
  const seen: THREE.Object3D[] = [];

  // The table: a glossy white disc with a rounded rim on a white pedestal.
  const top = new THREE.Mesh(new THREE.CircleGeometry(TABLE_RADIUS, 96).rotateX(-Math.PI / 2), tableMaterial);
  freeze(top);
  group.add(top);
  seen.push(top);
  batch.add(glossy, paint(new THREE.CylinderGeometry(TABLE_RADIUS + 4, TABLE_RADIUS + 1, 10, 96, 1, true).translate(0, -7, 0), "#f2f7fb"));
  batch.add(glossy, paint(new THREE.TorusGeometry(TABLE_RADIUS + 1.5, 4, 8, 96).rotateX(Math.PI / 2).translate(0, -1.5, 0), "#ffffff"));
  const pedestal = new THREE.LatheGeometry(
    [[0, LAWN_Y], [150, LAWN_Y], [150, LAWN_Y + 14], [40, LAWN_Y + 50], [28, LAWN_Y + 200], [24, -60], [60, -18], [0, -12]].map(([r, y]) => new THREE.Vector2(r, y)),
    32,
  );
  batch.add(glossy, paint(pedestal, "#eef4f8"));

  // The lemonade: a tall jar with a blue lid and a striped straw.
  const lemonade = one("lemonade");
  const lf = lemonade.footprint as { x: number; z: number; r: number };
  const lidTop = (lemonade.top as { y: number }).y;
  const jar = new THREE.Mesh(new THREE.CylinderGeometry(lf.r, lf.r, lidTop - 9, 48, 1, true).translate(lf.x, (lidTop - 9) / 2, lf.z), glass);
  jar.renderOrder = 3;
  freeze(jar);
  group.add(jar);
  const drink = new THREE.Mesh(paint(new THREE.CylinderGeometry(lf.r - 1.5, lf.r - 1.5, lidTop - 26, 40).translate(lf.x, (lidTop - 26) / 2 + 1, lf.z), (p) => (p.y > lidTop - 30 ? "#fff6b8" : "#ffe14f")), liquid);
  drink.renderOrder = 2;
  freeze(drink);
  group.add(drink);
  seen.push(drink);
  batch.add(glossy, paint(new THREE.CylinderGeometry(lf.r + 1.5, lf.r + 1.5, 9, 48).translate(lf.x, lidTop - 4.5, lf.z), (p, n) => (n.y > 0.5 ? "#7fd4ff" : Math.sin(p.y * 2.2) > 0 ? "#43aef0" : "#9fe0ff")));
  // A lemon slice standing in the drink, against the glass.
  batch.add(juicy, paint(new THREE.CylinderGeometry(20, 20, 3, 32).rotateX(Math.PI / 2).rotateY(0.6).translate(lf.x + 12, 44, lf.z + 22), (p) => {
    const d = Math.hypot(p.x - (lf.x + 12), p.y - 44);
    return d > 18 ? "#f5d000" : d > 16.5 ? "#fffbe0" : Math.sin(Math.atan2(p.y - 44, p.x - lf.x - 12) * 5) > 0.85 ? "#fffbe0" : "#ffe66b";
  }));
  const straw = one("straw");
  const sf = straw.footprint as { x: number; z: number; r: number };
  const strawTop = (straw.top as { y: number }).y;
  batch.add(glossy, paint(new THREE.CylinderGeometry(sf.r, sf.r, strawTop - 50, 12, 24).translate(sf.x, (strawTop + 50) / 2, sf.z), (p) => (Math.floor((p.y - 50) / 7) % 2 === 0 ? "#ff5f9e" : "#ffffff")));

  // The jam jar, with a gingham cover tied with a ribbon.
  const jam = one("jam");
  const jf = jam.footprint as { x: number; z: number; r: number };
  const jamTop = (jam.top as { y: number }).y;
  const jamGlass = new THREE.Mesh(new THREE.CylinderGeometry(jf.r, jf.r, jamTop - 8, 48, 1, true).translate(jf.x, (jamTop - 8) / 2, jf.z), glass);
  jamGlass.renderOrder = 3;
  freeze(jamGlass);
  group.add(jamGlass);
  batch.add(juicy, paint(new THREE.CylinderGeometry(jf.r - 1.2, jf.r - 1.2, jamTop - 16, 40).translate(jf.x, (jamTop - 16) / 2 + 1, jf.z), "#d4123e"));
  const cover = new THREE.CylinderGeometry(jf.r + 3, jf.r + 9, 13, 48, 3, true);
  {
    const pos = cover.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < -6) {
        const a = Math.atan2(pos.getZ(i), pos.getX(i));
        pos.setY(i, y + Math.sin(a * 9) * 2.2);
      }
    }
  }
  const coverSkirt = new THREE.Mesh(cover.translate(jf.x, jamTop - 7.5, jf.z), cloth);
  const coverTop = new THREE.Mesh(new THREE.CircleGeometry(jf.r + 3, 48).rotateX(-Math.PI / 2).translate(jf.x, jamTop, jf.z), cloth);
  for (const m of [coverSkirt, coverTop]) {
    freeze(m);
    group.add(m);
    seen.push(m);
  }
  batch.add(glossy, paint(new THREE.TorusGeometry(jf.r + 3.6, 1.6, 6, 48).rotateX(Math.PI / 2).translate(jf.x, jamTop - 6, jf.z), "#ff7eb6"));

  // Strawberries: a whole one with seeds and leaves, and a half one, cut face up.
  const berry = one("strawberry");
  batch.add(juicy, paint(domeGeometry(berry, 14, 40), (p) => {
    const k = Math.min(1, p.y / 24);
    return new THREE.Color("#c3001f").lerp(new THREE.Color("#ff3048"), k);
  }));
  const half = one("strawberry half");
  batch.add(juicy, paint(domeGeometry(half, 10, 40), (p) => {
    const hf = half.footprint as { x: number; z: number; rx: number; rz: number; angle: number };
    const s = Math.min(1, Math.hypot((p.x - hf.x) / hf.rx, (p.z - hf.z) / hf.rz));
    return s > 0.86 ? "#e0102c" : s > 0.7 ? "#ff6b7c" : s > 0.25 ? "#ffb3bd" : "#fff0f0";
  }));
  const leafColor = (p: THREE.Vector3) => (p.y > 0 ? "#3fbf3a" : "#2c8f2a");
  {
    const bf = berry.footprint as { x: number; z: number; rx: number; rz: number; angle: number };
    // The green sepals, a star lying over one end of its long axis.
    const ex = bf.x + Math.sin(bf.angle) * bf.rz * 0.78;
    const ez = bf.z + Math.cos(bf.angle) * bf.rz * 0.78;
    const ey = topHeight(berry, ex, ez);
    const sepal = new THREE.Shape();
    sepal.moveTo(0, -2.2);
    sepal.quadraticCurveTo(5, -1.2, 11, 0);
    sepal.quadraticCurveTo(5, 1.2, 0, 2.2);
    sepal.closePath();
    for (let i = 0; i < 7; i++) {
      const leaf = new THREE.ShapeGeometry(sepal, 4).rotateX(-Math.PI / 2);
      const m = mat4({ x: ex, y: ey + 0.6, z: ez }, new THREE.Euler(0.25 * Math.sin(i * 1.7), (i / 7) * Math.PI * 2 + bf.angle, -0.35, "YXZ"));
      batch.add(matte, paint(leaf, (p) => (p.y > ey + 1 ? "#62d84a" : "#2fa83a")), m);
    }
    batch.add(matte, paint(new THREE.CylinderGeometry(0.9, 1.2, 7, 6).rotateZ(0.5).translate(ex + 1, ey + 3, ez), "#3c9a2e"));
  }
  // Seeds on the whole strawberry, following its surface.
  const seeds: THREE.Matrix4[] = [];
  {
    const bf = berry.footprint as { x: number; z: number; rx: number; rz: number; angle: number };
    const n = { x: 0, y: 1, z: 0 };
    for (let i = 0; i < 90; i++) {
      const th = rnd.range(0, Math.PI * 2);
      const sv = Math.sqrt(rnd.range(0.02, 0.85));
      const u = Math.cos(th) * bf.rx * sv;
      const v = Math.sin(th) * bf.rz * sv;
      const x = bf.x + u * Math.cos(bf.angle) + v * Math.sin(bf.angle);
      const z = bf.z - u * Math.sin(bf.angle) + v * Math.cos(bf.angle);
      const y = topHeight(berry, x, z);
      topNormal(berry, x, z, n);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(n.x, n.y, n.z));
      seeds.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + 0.1, z), q, new THREE.Vector3(1, 0.5, 1)));
    }
  }
  const seedMesh = new THREE.InstancedMesh(paint(new THREE.SphereGeometry(0.7, 6, 4), "#ffe27a"), glossy, seeds.length);
  seeds.forEach((m, i) => seedMesh.setMatrixAt(i, m));
  seedMesh.computeBoundingSphere();
  freeze(seedMesh);
  group.add(seedMesh);

  // Cherries on their stems.
  const cherries = byName("cherry");
  for (const cherry of cherries) {
    const f = cherry.footprint as { x: number; z: number; r: number };
    batch.add(juicy, paint(new THREE.SphereGeometry(f.r, 28, 18).translate(f.x, f.r, f.z), (_p, n) => (n.y > 0.85 ? "#ff3d5c" : "#a3001f")));
  }
  {
    const [a, b] = cherries.map((c) => c.footprint as { x: number; z: number; r: number });
    const join = new THREE.Vector3((a.x + b.x) / 2 + 8, 42, (a.z + b.z) / 2 - 10);
    for (const c of [a, b]) {
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(c.x, c.r * 2 - 1, c.z), new THREE.Vector3(c.x + 2, c.r * 2 + 18, c.z - 4), join);
      batch.add(matte, paint(new THREE.TubeGeometry(curve, 10, 0.9, 5), "#5d8a2b"));
    }
    const cherryLeaf = new THREE.SphereGeometry(1, 12, 6).scale(6, 0.6, 15);
    batch.add(matte, paint(cherryLeaf, leafColor), mat4(join.clone().add(new THREE.Vector3(4, 1, -10)), new THREE.Euler(0.4, 0.5, 0.3)));
  }

  // A slice of orange.
  {
    const orange = one("orange slice");
    const f = orange.footprint as { x: number; z: number; r: number };
    const h = (orange.top as { y: number }).y;
    batch.add(juicy, paint(new THREE.CylinderGeometry(f.r, f.r, h, 64, 1, false).translate(f.x, h / 2, f.z), (p, n) => {
      if (n.y < 0.5) return "#ff9a1a";
      const dx = p.x - f.x;
      const dz = p.z - f.z;
      const d = Math.hypot(dx, dz) / f.r;
      if (d > 0.94) return "#ff8a00";
      if (d > 0.86) return "#fff3d6";
      const a = Math.atan2(dz, dx);
      const segment = Math.abs(Math.sin(a * 5));
      if (segment < 0.08 || d < 0.1) return "#fff3d6";
      return new THREE.Color("#ffb21e").lerp(new THREE.Color("#ffd65c"), d * 0.7);
    }));
  }

  // A green apple.
  {
    const apple = one("apple");
    const f = apple.footprint as { x: number; z: number; r: number };
    const base = (apple.top as { base: number }).base;
    batch.add(juicy, paint(new THREE.SphereGeometry(f.r, 40, 26).translate(f.x, base, f.z), (p) => {
      const blush = Math.max(0, Math.sin((p.x - f.x) * 0.05 + 1) * Math.cos((p.z - f.z) * 0.04)) * Math.max(0, (p.y - base) / f.r);
      return new THREE.Color("#79d33f").lerp(new THREE.Color("#ffd23a"), Math.max(0, (p.y - base) / f.r) * 0.25).lerp(new THREE.Color("#ff6b3a"), blush * 0.5);
    }));
    const stem = new THREE.QuadraticBezierCurve3(new THREE.Vector3(f.x, base + f.r - 2, f.z), new THREE.Vector3(f.x + 1, base + f.r + 6, f.z), new THREE.Vector3(f.x + 4, base + f.r + 10, f.z + 1));
    batch.add(matte, paint(new THREE.TubeGeometry(stem, 6, 1.2, 5), "#7a4a24"));
    batch.add(matte, paint(new THREE.SphereGeometry(1, 12, 6).scale(7, 0.6, 16), leafColor), mat4({ x: f.x + 9, y: base + f.r + 8, z: f.z + 5 }, new THREE.Euler(0.5, 0.9, -0.4)));
  }

  // Sugar cubes, and grains of sugar spilt beside them.
  for (const cube of byName("sugar")) {
    const f = cube.footprint as { x: number; z: number; hx: number; hz: number; angle: number };
    const y = (cube.top as { y: number }).y;
    const geometry = new RoundedBoxGeometry(f.hx * 2, 16, f.hz * 2, 2, 1.2);
    batch.add(matte, paint(geometry, (p) => (Math.sin(p.x * 3.1) * Math.cos(p.z * 2.7 + p.y) > 0.92 ? "#e8f6ff" : "#fcfeff")), mat4({ x: f.x, y: y - 8, z: f.z }, new THREE.Euler(0, f.angle, 0)));
  }
  const grains: THREE.Matrix4[] = [];
  for (const p of PATCHES.filter((p) => p.name === "spilt sugar")) {
    for (let i = 0; i < 70; i++) {
      const a = rnd.range(0, Math.PI * 2);
      const r = Math.sqrt(rnd.next()) * p.r * 1.3;
      grains.push(mat4({ x: p.x + Math.cos(a) * r, y: 0.3, z: p.z + Math.sin(a) * r }, new THREE.Euler(rnd.range(0, 3), rnd.range(0, 3), rnd.range(0, 3)), { x: 1, y: 1, z: 1 }));
    }
  }
  const grainMesh = new THREE.InstancedMesh(paint(new THREE.BoxGeometry(0.6, 0.6, 0.6), "#ffffff"), glossy, grains.length);
  grains.forEach((m, i) => grainMesh.setMatrixAt(i, m));
  grainMesh.computeBoundingSphere();
  freeze(grainMesh);
  group.add(grainMesh);

  // A drip of honey and a smear of jam: flat, glossy puddles.
  const puddle = (x: number, z: number, r: number, color: string, wobble: number) => {
    const shape = new THREE.Shape();
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const rr = r * (1 + Math.sin(a * 3 + wobble) * 0.12 + Math.sin(a * 5 + wobble * 2) * 0.06);
      if (i === 0) shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.25, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.6, bevelSegments: 2 });
    batch.add(juicy, paint(geometry.rotateX(-Math.PI / 2).translate(x, 0.05, z), color));
  };
  const honey = PATCHES.find((p) => p.name === "honey")!;
  const jamPatch = PATCHES.find((p) => p.name === "jam")!;
  puddle(honey.x, honey.z, honey.r, "#ffae1a", 1);
  puddle(jamPatch.x, jamPatch.z, jamPatch.r, "#b5002c", 3);

  // A fallen leaf, thin enough to walk over.
  {
    const { leaf } = DECOR;
    const shape = new THREE.Shape();
    shape.moveTo(0, -leaf.length / 2);
    shape.quadraticCurveTo(leaf.length * 0.32, 0, 0, leaf.length / 2);
    shape.quadraticCurveTo(-leaf.length * 0.32, 0, 0, -leaf.length / 2);
    const geometry = new THREE.ShapeGeometry(shape, 12).rotateX(-Math.PI / 2);
    batch.add(matte, paint(geometry, (p) => (Math.abs(p.x) < 0.8 ? "#c6ef7a" : "#6fcb3c")), mat4({ x: leaf.x, y: 0.12, z: leaf.z }, new THREE.Euler(0, leaf.angle, 0)));
  }

  // Dew: clear drops on the table and on the lemonade jar.
  const dew: THREE.Matrix4[] = [];
  for (const drop of byName("dew")) {
    const f = drop.footprint as { x: number; z: number; r: number };
    const h = (drop.top as { height: number }).height;
    dew.push(mat4({ x: f.x, y: 0, z: f.z }, new THREE.Euler(), { x: f.r, y: h, z: f.r }));
  }
  for (let i = 0; i < 40; i++) {
    const a = rnd.range(-0.4, 2.2) + Math.PI * 0.4;
    const y = rnd.range(8, lidTop - 16);
    const r = rnd.range(0.8, 2.2);
    const q = new THREE.Euler(0, 0, 0);
    const m = new THREE.Matrix4().makeRotationFromEuler(q);
    const n = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    m.compose(new THREE.Vector3(lf.x + n.x * (lf.r + 0.1), y, lf.z + n.z * (lf.r + 0.1)), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n), new THREE.Vector3(r, r * 0.6, r * 1.2));
    dew.push(m);
  }
  const dewMaterial = new THREE.MeshStandardMaterial({ color: "#f2fbff", roughness: 0.02, transparent: true, opacity: 0.55, envMapIntensity: 2.2, depthWrite: false });
  const dewMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), dewMaterial, dew.length);
  dew.forEach((m, i) => dewMesh.setMatrixAt(i, m));
  dewMesh.computeBoundingSphere();
  dewMesh.renderOrder = 4;
  freeze(dewMesh);
  group.add(dewMesh);

  seen.push(...batch.build(group));
  return {
    group,
    materials: [glossy, juicy, matte, tableMaterial, cloth, glass, liquid, dewMaterial],
    seen,
    update() {},
  };
}
