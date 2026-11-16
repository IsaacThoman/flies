// The restaurant in areas: each table with its chairs and what is on it, the
// bar in three lengths, the back bar in two, the pass and the kitchen, the
// host's stand by the door, the service station, the banquette in two, and
// the window's ledge. Each area is drawn in detail only while the camera is
// near it, and otherwise by its stand-in in the room-wide far mesh, so what
// is off in the distance costs a few hundred triangles and no draws of its
// own (set.ts).

import { BANQUETTE, DINING_ROOM, HOST_STAND, PASS, SHOPFRONT, STATION, TABLES, TABLE_TOPS, ZINC_BAR } from "@fly/world";
import type { Solid } from "@fly/world";
import { KITCHEN } from "./plan.ts";

export type AreaSpec = {
  /** 1 to 31: its bit in the near mask. */
  id: number;
  name: string;
  /** What it holds, as a box. */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  y0: number;
  y1: number;
};

/** How near (mm) the camera must be to an area's box for it to be drawn in detail. */
export const DETAIL_REACH = 650;

const specs: Omit<AreaSpec, "id">[] = [];
const box = (name: string, x0: number, x1: number, z0: number, z1: number, y0: number, y1: number) => specs.push({ name, x0, x1, z0, z1, y0, y1 });

for (const t of TABLES) {
  const half = t.kind === "four" ? TABLE_TOPS.four.half : t.kind === "round" ? TABLE_TOPS.round.r : TABLE_TOPS.square.half;
  // The chairs stand round it; upturned on it, their legs reach up to about 1.2 m.
  const reach = half + (t.chairs.length ? 290 : 0);
  box(t.id, t.x - reach, t.x + reach, t.z - reach, t.z + reach, 0, t.chairs.some((c) => c.upturned !== undefined) ? 1260 : 900);
}
const bar = ZINC_BAR;
const barX0 = bar.underbar.x - bar.underbar.hx;
const barZ = [bar.underbar.z0 - 50, -1150, 0, bar.zinc.z + bar.zinc.hz + 100];
for (let i = 0; i < 3; i++) box(`bar ${i + 1}`, barX0, -2190, barZ[i], barZ[i + 1], 0, DINING_ROOM.height);
const backZ = [bar.back.z0, -550, bar.back.z1];
for (let i = 0; i < 2; i++) box(`back bar ${i + 1}`, -DINING_ROOM.hx, bar.back.x1, backZ[i], backZ[i + 1], 0, 2450);
box("pass", PASS.x0 - 120, PASS.x1 + 120, KITCHEN.z1, PASS.shelf.z1, 0, PASS.head + 200);
box("host", HOST_STAND.x - HOST_STAND.hx - 60, HOST_STAND.x + HOST_STAND.hx + 60, HOST_STAND.z - HOST_STAND.hz - 60, HOST_STAND.z + HOST_STAND.hz + 60, 0, HOST_STAND.top + 60);
box("station", STATION.x - STATION.hx - 40, STATION.x + STATION.hx + 40, STATION.z - STATION.hz, STATION.z + STATION.hz + 40, 0, STATION.top + 300);
const midBanquette = -350;
box("banquette back", BANQUETTE.x0 - 20, DINING_ROOM.hx, BANQUETTE.z0, midBanquette, 0, 2300);
box("banquette front", BANQUETTE.x0 - 20, DINING_ROOM.hx, midBanquette, BANQUETTE.z1, 0, 2300);
box("ledge", -DINING_ROOM.hx, SHOPFRONT.ledge.x1, DINING_ROOM.hz - SHOPFRONT.ledge.depth - 20, DINING_ROOM.hz, 0, SHOPFRONT.ledge.top + 360);

export const AREAS: readonly AreaSpec[] = specs.map((s, i) => ({ ...s, id: i + 1 }));
if (AREAS.length > 31) throw new Error("More areas than bits in the near mask");

export const areaNamed = (name: string) => {
  const a = AREAS.find((s) => s.name === name);
  if (!a) throw new Error(`No area ${name}`);
  return a;
};

/** The area whose box holds a point, or 0 for none (the room's shell). */
export function areaAt(x: number, y: number, z: number): number {
  for (const a of AREAS) if (x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1 && y >= a.y0 && y <= a.y1) return a.id;
  return 0;
}

/** Which area a solid of the world belongs to (by its footprint's middle and its underside), or 0 for the shell (walls, the shop front, what hangs on the walls). */
export function areaOf(solid: Solid): number {
  const f = solid.footprint;
  return areaAt(f.x, (solid.bottom ?? 0) + 1, f.z);
}

/** How far (mm) a point is from an area's box: 0 inside. */
export function distanceTo(a: AreaSpec, x: number, y: number, z: number) {
  const dx = Math.max(a.x0 - x, 0, x - a.x1);
  const dy = Math.max(a.y0 - y, 0, y - a.y1);
  const dz = Math.max(a.z0 - z, 0, z - a.z1);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
