// What the fly's eyes see of the kitchen: the big shapes only, in one plain
// mesh on the eyes' layer. The eyes render the world six times at 16 or 32
// pixels, so the kitchen's detail (and the draws and triangles it costs) is
// left out, but its walls, the window's frame against the bright sky outside,
// and the things on the sill are all there, lit as the scene is.

import * as THREE from "three";
import { ALARM_CLOCK, BANANA, BASIL_CROWN, HONEY_JAR, POSTCARD, WINE_BOTTLE, FRUIT_BOWL, PEACH_PLATE, BASIL_POT, SILL, SILL_SOLIDS, WINDOW, bananaAt } from "@fly/world";
import { EYE_LAYER } from "../../eyes/eyes.ts";
import { Batch, paint } from "../../scene/build.ts";
import { FRAME_HEAD, sunlit } from "./light.ts";
import type { Sunlight } from "./light.ts";
import { ROOM } from "./room.ts";

const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);

export function buildSeen(sunlight: Sunlight, colors: { sill: string; frame: string; wall: string }) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, envMapIntensity: 0.3, side: THREE.DoubleSide });
  sunlit(material, sunlight, "seen", { lamp: true });
  const batch = new Batch();
  const add = (g: THREE.BufferGeometry, c: THREE.ColorRepresentation) => batch.add(material, paint(g, c));
  const { rail, jamb, mullion, bar, transom, glass, wall, head } = WINDOW;
  const back = glass - 40;

  // The sill, the window's frame and the wall it is set in.
  add(box(-SILL.hx, SILL.hx, -34, 0, glass, SILL.hz), colors.sill);
  add(box(-SILL.hx, SILL.hx, 0, rail.top, back, glass + rail.depth), colors.frame);
  add(box(-SILL.hx, -SILL.hx + jamb.width, rail.top, head, back, glass + jamb.depth), colors.frame);
  add(box(SILL.hx - jamb.width, SILL.hx, rail.top, head, back, glass + jamb.depth), colors.frame);
  add(box(-SILL.hx, SILL.hx, FRAME_HEAD, head, back, glass + jamb.depth), colors.frame);
  add(box(-mullion.half, mullion.half, rail.top, FRAME_HEAD, back, glass + mullion.depth), colors.frame);
  for (const x of bar.at) add(box(x - bar.half, x + bar.half, rail.top, FRAME_HEAD, glass - 12, glass + bar.depth), colors.frame);
  add(box(-SILL.hx, SILL.hx, transom.y - transom.half, transom.y + transom.half, glass - 12, glass + bar.depth), colors.frame);
  for (const side of [-1, 1]) {
    add(box(side < 0 ? -SILL.hx - 400 : SILL.hx, side < 0 ? -SILL.hx : SILL.hx + 400, -40, head + 400, -420, wall), colors.wall);
    add(box(side < 0 ? -ROOM.side : SILL.hx + 400, side < 0 ? -SILL.hx - 400 : ROOM.side, ROOM.floor, ROOM.ceiling, wall - 20, wall), colors.wall);
  }
  add(box(-SILL.hx, SILL.hx, head, ROOM.ceiling, -420, wall), colors.wall);
  add(box(-SILL.hx, SILL.hx, ROOM.floor, -34, wall - 20, wall), "#ece8de");

  // The kitchen behind: worktop and cupboards, floor, ceiling, walls.
  add(box(-ROOM.side, ROOM.side, ROOM.floor, ROOM.worktop, wall, wall + 620), "#9cb4a6");
  add(box(-ROOM.side, ROOM.side, ROOM.floor - 10, ROOM.floor, wall, ROOM.far), "#b0583a");
  add(box(-ROOM.side, ROOM.side, ROOM.ceiling, ROOM.ceiling + 10, wall, ROOM.far), "#f6efe2");
  add(box(-ROOM.side - 10, -ROOM.side, ROOM.floor, ROOM.ceiling, wall, ROOM.far), "#f1e2c4");
  add(box(ROOM.side, ROOM.side + 10, ROOM.floor, ROOM.ceiling, wall, ROOM.far), "#f1e2c4");
  add(box(-ROOM.side, ROOM.side, ROOM.floor, ROOM.ceiling, ROOM.far, ROOM.far + 10), "#e8d9bc");

  // What stands on the sill.
  add(new THREE.CylinderGeometry(BASIL_POT.r, BASIL_POT.r - 1, BASIL_POT.rim, 12).translate(BASIL_POT.x, BASIL_POT.rim / 2, BASIL_POT.z), "#c8714a");
  add(new THREE.CylinderGeometry(BASIL_POT.saucer, BASIL_POT.saucer - 2, 6, 12).translate(BASIL_POT.x, 3, BASIL_POT.z), "#c8714a");
  for (const c of BASIL_CROWN) add(new THREE.IcosahedronGeometry(1, 1).scale(c.r, c.top - BASIL_POT.rim, c.r).translate(BASIL_POT.x + c.x, BASIL_POT.rim, BASIL_POT.z + c.z), "#3f9a2c");
  add(new THREE.CylinderGeometry(ALARM_CLOCK.r, ALARM_CLOCK.r, ALARM_CLOCK.depth + ALARM_CLOCK.bezel, 12).rotateX(Math.PI / 2).translate(ALARM_CLOCK.x, ALARM_CLOCK.y, ALARM_CLOCK.z + ALARM_CLOCK.bezel / 2), "#c53a2c");
  add(new THREE.CylinderGeometry(HONEY_JAR.r, HONEY_JAR.r, HONEY_JAR.top, 10).translate(HONEY_JAR.x, HONEY_JAR.top / 2, HONEY_JAR.z), "#d8901c");
  add(box(SILL.hx - POSTCARD.foot, SILL.hx, 0, POSTCARD.length, POSTCARD.z - POSTCARD.width / 2, POSTCARD.z + POSTCARD.width / 2), "#5a8ac0");
  for (const side of [-1, 1]) add(new THREE.IcosahedronGeometry(ALARM_CLOCK.bells.r, 0).translate(ALARM_CLOCK.x + side * ALARM_CLOCK.bells.x, ALARM_CLOCK.bells.base, ALARM_CLOCK.z), "#d8dce2");
  add(new THREE.CylinderGeometry(FRUIT_BOWL.r * 0.85, FRUIT_BOWL.r * 0.7, 28, 14).translate(FRUIT_BOWL.x, 14, FRUIT_BOWL.z), "#ece0c6");
  for (const s of SILL_SOLIDS) {
    if (s.name !== "peach" && s.name !== "plum") continue;
    const f = s.footprint as { x: number; z: number; r: number };
    add(new THREE.IcosahedronGeometry(f.r, 1).translate(f.x, (s.top as { base: number }).base, f.z), s.name === "peach" ? "#f0903a" : "#4a1a48");
  }
  const p = { x: 0, z: 0 };
  for (const t of [0.15, 0.35, 0.55, 0.75]) {
    bananaAt(t, p);
    const r = BANANA.radius(t);
    add(new THREE.IcosahedronGeometry(r, 1).scale(1.4, 0.8, 1.4).translate(p.x, 0, p.z), "#e8bb3a");
  }
  add(new THREE.CylinderGeometry(WINE_BOTTLE.r, WINE_BOTTLE.r, WINE_BOTTLE.shoulder + 20, 12).translate(WINE_BOTTLE.x, (WINE_BOTTLE.shoulder + 20) / 2, WINE_BOTTLE.z), "#1e3a20");
  add(new THREE.CylinderGeometry(WINE_BOTTLE.neck, WINE_BOTTLE.neck, WINE_BOTTLE.top, 8).translate(WINE_BOTTLE.x, WINE_BOTTLE.top / 2, WINE_BOTTLE.z), "#1e3a20");
  add(new THREE.CylinderGeometry(PEACH_PLATE.r, PEACH_PLATE.r - 4, 5, 14).translate(PEACH_PLATE.x, 2.5, PEACH_PLATE.z), "#f4f0e8");
  add(new THREE.CylinderGeometry(25, 27, 16, 12).translate(PEACH_PLATE.x - 5, 8, PEACH_PLATE.z - 3), "#e88a34");

  const holder = new THREE.Group();
  const [mesh] = batch.build(holder);
  mesh.removeFromParent();
  mesh.layers.set(EYE_LAYER);
  return { mesh, material };
}
