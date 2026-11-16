// The kitchen behind the camera: only what a shot from the sill can see. The
// wall the window is set in, tiled above the worktop; the cupboards under
// it; across the room a dresser of plates, a doorway and a clock; the fridge;
// a table with a jug of flowers under the lamp, which lights the room at night.
// Plain shapes with painted colours: it is out of focus behind the fly.

import * as THREE from "three";
import { SILL, WINDOW } from "@fly/world";
import { mat4, paint } from "../../scene/build.ts";
import { LAMP } from "./light.ts";
import { tag, tone } from "./surfaces.ts";

/** The kitchen's floor and ceiling, its far wall and side walls, mm (the sill is 1.05 m from the floor). */
export const ROOM = { floor: -1050, ceiling: WINDOW.ceiling, far: 2900, side: 1700, worktop: -180 };

type Materials = { plaster: THREE.Material; tiles: THREE.Material; glaze: THREE.Material; paint: THREE.Material; metal: THREE.Material; leaf: THREE.Material };

const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
/** A wall's face: a rectangle in the plane z = at (facing +z, or -z with `back`). */
const faceZ = (x0: number, x1: number, y0: number, y1: number, at: number, back = false) => new THREE.PlaneGeometry(x1 - x0, y1 - y0).rotateY(back ? Math.PI : 0).translate((x0 + x1) / 2, (y0 + y1) / 2, at);

export function buildRoom(m: Materials) {
  const pieces: [THREE.Material, THREE.BufferGeometry][] = [];
  const plaster = (g: THREE.BufferGeometry, c: THREE.ColorRepresentation) => pieces.push([m.plaster, paint(g, c)]);
  const tile = (g: THREE.BufferGeometry, c: THREE.ColorRepresentation) => pieces.push([m.tiles, paint(g, c)]);
  const glaze = (g: THREE.BufferGeometry, c: THREE.ColorRepresentation | ((p: THREE.Vector3, n: THREE.Vector3) => THREE.ColorRepresentation), speckle = 0) => pieces.push([m.glaze, tag(paint(g, c as THREE.ColorRepresentation), "speckle", speckle)]);
  /** Painted wood (grain 0 along x, 1 up), or bare oiled wood (2 along x, 3 up). */
  const wood = (g: THREE.BufferGeometry, c: THREE.ColorRepresentation, grain: number, matrix?: THREE.Matrix4) => {
    if (matrix) g.applyMatrix4(matrix);
    pieces.push([m.paint, tag(paint(g, c), "grain", grain)]);
  };
  const metal = (g: THREE.BufferGeometry, c: THREE.ColorRepresentation) => pieces.push([m.metal, paint(g, c)]);
  const { floor, ceiling, far, side, worktop } = ROOM;
  const wall = WINDOW.wall;
  const TILE_TOP = 300;
  const WALL = "#f4ead8";
  const CUPBOARD = "#8fb1a1";

  // The window wall: tiles from the worktop up, plaster above, the window's opening left open.
  tile(faceZ(-side, -SILL.hx, worktop, TILE_TOP, wall), "#f7f5ef");
  tile(faceZ(SILL.hx, side, worktop, TILE_TOP, wall), "#f7f5ef");
  tile(faceZ(-SILL.hx, SILL.hx, worktop, -48, wall), "#f7f5ef");
  plaster(faceZ(-side, -SILL.hx, TILE_TOP, ceiling, wall), WALL);
  plaster(faceZ(SILL.hx, side, TILE_TOP, ceiling, wall), WALL);
  plaster(faceZ(-SILL.hx, SILL.hx, WINDOW.head, ceiling, wall), WALL);
  // A rounded edge along the top of the tiles.
  for (const [x0, x1] of [[-side, -SILL.hx], [SILL.hx, side]]) glaze(new THREE.CylinderGeometry(5, 5, x1 - x0, 8, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).translate((x0 + x1) / 2, TILE_TOP, wall), "#f2efe6");

  // The worktop: oiled oak, its front edge rounded; the cupboards under it, with knobs; a dark kickboard.
  wood(box(-side, side, worktop - 40, worktop, wall, wall + 620), "#d7a76c", 2);
  for (let x = -side; x < side - 1; x += 500) {
    const x1 = Math.min(side, x + 500);
    wood(box(x + 4, x1 - 4, floor + 110, worktop - 46, wall + 590, wall + 610), CUPBOARD, 1);
    wood(box(x + 40, x1 - 40, floor + 150, worktop - 86, wall + 610, wall + 616), "#9dbcad", 1);
    metal(new THREE.SphereGeometry(13, 12, 8).translate(x1 - 70, worktop - 140, wall + 628), "#c9a14a");
  }
  wood(box(-side, side, floor, floor + 110, wall + 560, wall + 580), "#4d5a52", 0);

  // The floor's quarry tiles, the ceiling, the side walls.
  tile(new THREE.PlaneGeometry(side * 2, far - wall).rotateX(-Math.PI / 2).translate(0, floor, (far + wall) / 2), "#b0583a");
  plaster(new THREE.PlaneGeometry(side * 2, far - wall).rotateX(Math.PI / 2).translate(0, ceiling, (far + wall) / 2), "#f6efe2");
  plaster(new THREE.PlaneGeometry(far - wall, ceiling - floor).rotateY(Math.PI / 2).translate(-side, (ceiling + floor) / 2, (far + wall) / 2), "#f1e2c4");
  plaster(new THREE.PlaneGeometry(far - wall, ceiling - floor).rotateY(-Math.PI / 2).translate(side, (ceiling + floor) / 2, (far + wall) / 2), "#f1e2c4");
  // A beam across the ceiling.
  wood(box(-side, side, ceiling - 160, ceiling, 1250, 1430), "#a7774a", 2);

  // The far wall: a doorway into a dim hall, a dresser of plates, a clock.
  const door = { x0: -1350, x1: -550, top: 1000 };
  plaster(faceZ(-side, door.x0, floor, ceiling, far, true), "#f3e6cc");
  plaster(faceZ(door.x1, side, floor, ceiling, far, true), "#f3e6cc");
  plaster(faceZ(door.x0, door.x1, door.top, ceiling, far, true), "#f3e6cc");
  plaster(faceZ(door.x0, door.x1, floor, door.top + 300, far + 900, true), "#b8a688");
  plaster(new THREE.PlaneGeometry(900, door.top + 300 - floor).rotateY(Math.PI / 2).translate(door.x0, (door.top + 300 + floor) / 2, far + 450), "#cbb896");
  plaster(new THREE.PlaneGeometry(900, door.top + 300 - floor).rotateY(-Math.PI / 2).translate(door.x1, (door.top + 300 + floor) / 2, far + 450), "#cbb896");
  tile(new THREE.PlaneGeometry(door.x1 - door.x0, 900).rotateX(-Math.PI / 2).translate((door.x0 + door.x1) / 2, floor, far + 450), "#9a5a40");
  plaster(new THREE.PlaneGeometry(door.x1 - door.x0, 900).rotateX(Math.PI / 2).translate((door.x0 + door.x1) / 2, door.top + 300, far + 450), "#a89878");
  // The door's frame.
  for (const x of [door.x0, door.x1]) wood(box(x - 30, x + 30, floor, door.top + 30, far - 20, far), "#efe8da", 3);
  wood(box(door.x0 - 30, door.x1 + 30, door.top, door.top + 60, far - 20, far), "#efe8da", 2);
  // The dresser: a cupboard base, a worktop, shelves above with plates standing on them.
  const dresser = { x0: 150, x1: 1450, depth: 420 };
  wood(box(dresser.x0, dresser.x1, floor, -200, far - dresser.depth, far), CUPBOARD, 1);
  wood(box(dresser.x0 - 20, dresser.x1 + 20, -200, -170, far - dresser.depth - 20, far), "#d7a76c", 2);
  wood(box(dresser.x0, dresser.x1, -170, 900, far - 40, far), "#9dbcad", 1);
  for (const y of [120, 420, 700]) {
    wood(box(dresser.x0, dresser.x1, y, y + 22, far - 250, far - 40), CUPBOARD, 0);
    for (let x = dresser.x0 + 80; x < dresser.x1 - 60; x += 115) {
      const r = y === 700 ? 70 : 95;
      const rim = ["#2b5aa0", "#c8463a", "#3f8a6a"][(Math.round(x / 115) + y) % 3];
      // A plate standing on the shelf, leaning back against the rail: a white well and a coloured rim.
      const lean = mat4({ x, y: y + 22 + r, z: far - 75 - (Math.round(x / 115) % 2) * 8 }, new THREE.Euler(-0.14, Math.PI, 0, "YXZ"));
      glaze(new THREE.CircleGeometry(r * 0.74, 20).applyMatrix4(lean), "#f8f4ea");
      glaze(new THREE.RingGeometry(r * 0.74, r, 20, 1).applyMatrix4(lean), rim);
    }
    wood(box(dresser.x0, dresser.x1, y + 52, y + 60, far - 255, far - 245), "#7c9a8b", 0);
  }
  wood(box(dresser.x0 - 30, dresser.x1 + 30, 900, 960, far - 280, far), CUPBOARD, 0);
  for (let x = dresser.x0 + 160; x < dresser.x1; x += 325) {
    wood(box(x - 140, x + 140, floor + 80, -260, far - dresser.depth - 6, far - dresser.depth), "#9dbcad", 1);
    metal(new THREE.SphereGeometry(12, 10, 6).translate(x + 100, -330, far - dresser.depth - 16), "#c9a14a");
  }
  // A jug on the dresser's top.
  glaze(new THREE.LatheGeometry([[0, 0], [60, 0], [70, 60], [58, 140], [48, 190], [58, 215], [0, 215]].map(([r, y]) => new THREE.Vector2(r, y)), 20).translate(dresser.x1 - 160, -170, far - 220), "#e8b23a", 1);
  // The clock.
  {
    const at = new THREE.Vector3(-150, 720, far - 6);
    glaze(new THREE.CylinderGeometry(150, 150, 30, 40).rotateX(Math.PI / 2).translate(at.x, at.y, at.z), (p) => (Math.hypot(p.x - at.x, p.y - at.y) > 132 ? tone("#2f4f45") : tone("#fbf6ea")));
    for (let h = 0; h < 12; h++) {
      const a = (h / 12) * Math.PI * 2;
      metal(box(-3, 3, 104, 122, 0, 3).rotateZ(a).translate(at.x, at.y, at.z - 18), "#2a2a2a");
    }
    metal(box(-4, 4, 0, 82, 0, 3).rotateZ(-2.1).translate(at.x, at.y, at.z - 22), "#2a2a2a");
    metal(box(-3, 3, 0, 116, 0, 3).rotateZ(0.6).translate(at.x, at.y, at.z - 24), "#2a2a2a");
  }

  // The fridge, round-shouldered and cream, on the left.
  {
    const x0 = -side;
    const x1 = -side + 640;
    const z0 = 900;
    const z1 = 1580;
    glaze(new THREE.BoxGeometry(x1 - x0, 1700, z1 - z0, 1, 1, 1).translate((x0 + x1) / 2, floor + 850, (z0 + z1) / 2), "#f0e3c4");
    glaze(new THREE.CapsuleGeometry((z1 - z0) / 2, x1 - x0 - (z1 - z0), 6, 20).rotateZ(Math.PI / 2).scale(1, 0.25, 1).translate((x0 + x1) / 2, floor + 1700, (z0 + z1) / 2), "#f0e3c4");
    metal(box(x1, x1 + 30, floor + 1100, floor + 1400, z0 + 40, z0 + 70), "#d8dade");
    metal(box(x1, x1 + 6, floor + 1040, floor + 1050, z0, z1), "#c0c4ca");
  }

  // The table under the lamp: an old pine top on painted legs, and a jug of yellow tulips.
  const table = { x: 0, z: 1520, hx: 520, hz: 380, top: -290 };
  wood(box(table.x - table.hx, table.x + table.hx, table.top - 34, table.top, table.z - table.hz, table.z + table.hz), "#d9ae7a", 2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) wood(box(table.x + sx * (table.hx - 60) - 25, table.x + sx * (table.hx - 60) + 25, floor, table.top - 34, table.z + sz * (table.hz - 60) - 25, table.z + sz * (table.hz - 60) + 25), "#e9e1cf", 3);
  wood(box(table.x - table.hx + 50, table.x + table.hx - 50, table.top - 110, table.top - 34, table.z - table.hz + 45, table.z - table.hz + 60), "#e9e1cf", 2);
  // Two chairs pulled in.
  for (const sx of [-1, 1]) {
    const cx = table.x + sx * 280;
    const cz = table.z - table.hz - 120;
    wood(box(cx - 210, cx + 210, floor + 440, floor + 470, cz - 200, cz + 200), "#e9e1cf", 2);
    for (const lx of [-1, 1]) for (const lz of [-1, 1]) wood(box(cx + lx * 180 - 16, cx + lx * 180 + 16, floor, floor + 440, cz + lz * 170 - 16, cz + lz * 170 + 16), "#e9e1cf", 3);
    for (const lx of [-1, 1]) wood(box(cx + lx * 180 - 16, cx + lx * 180 + 16, floor + 470, floor + 900, cz - 186, cz - 154), "#e9e1cf", 3);
    for (const y of [floor + 700, floor + 860]) wood(box(cx - 190, cx + 190, y, y + 40, cz - 184, cz - 156), "#e9e1cf", 2);
  }
  {
    const jug = new THREE.Vector3(table.x + 60, table.top, table.z - 40);
    glaze(new THREE.LatheGeometry([[0, 0], [55, 0], [70, 70], [62, 150], [44, 200], [52, 222], [0, 222]].map(([r, y]) => new THREE.Vector2(r, y)), 20).translate(jug.x, jug.y, jug.z), "#3f6fb0", 1);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const lean = 0.25 + (i % 2) * 0.12;
      const stem = new THREE.Vector3(Math.cos(a) * Math.sin(lean), Math.cos(lean), Math.sin(a) * Math.sin(lean));
      const length = 330 + (i % 3) * 40;
      const tip = jug.clone().add(new THREE.Vector3(0, 200, 0)).add(stem.clone().multiplyScalar(length));
      pieces.push([m.leaf, paint(new THREE.CylinderGeometry(4, 5, length, 5).translate(0, length / 2, 0).applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), stem))).translate(jug.x, jug.y + 200, jug.z), "#5e9a3a")]);
      pieces.push([m.leaf, paint(new THREE.SphereGeometry(1, 10, 8).scale(26, 40, 26).translate(0, 10, 0), (p) => (p.y > 30 ? tone("#ffd84a") : tone("#f0b81e"))).applyMatrix4(mat4(tip, new THREE.Euler(Math.sin(a) * lean, 0, -Math.cos(a) * lean)))]);
    }
  }

  // The lamp over the table: an enamel shade on its flex, and its bulb, which glows at night.
  metal(new THREE.CylinderGeometry(3, 3, ceiling - LAMP.y - 90, 6).translate(LAMP.x, (ceiling + LAMP.y + 90) / 2, LAMP.z), "#2a2a2a");
  glaze(new THREE.LatheGeometry([[18, 160], [28, 150], [40, 120], [150, 20], [175, 0], [170, -4], [36, 116], [16, 146]].map(([r, y]) => new THREE.Vector2(r, y)), 32).translate(LAMP.x, LAMP.y - 30, LAMP.z), (_p, n) => (n.y > 0.1 ? tone("#2f5d4a") : tone("#fbf6ea")));
  const bulbMaterial = new THREE.MeshBasicMaterial({ color: "#6a5a40" });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(30, 16, 10).translate(LAMP.x, LAMP.y + 20, LAMP.z), bulbMaterial);
  const dark = new THREE.Color("#6a5a40");
  const lit = new THREE.Color("#fff3d0");
  return {
    pieces,
    objects: [bulb],
    update(night: number) {
      bulbMaterial.color.copy(dark).lerp(lit, night);
    },
  };
}
