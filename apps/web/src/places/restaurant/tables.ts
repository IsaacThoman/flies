// The tables and their chairs: marble tops on cast iron in the window and
// along the banquette, oak four-tops in the middle of the room, bentwood
// chairs pushed in or upturned for the night. Each kind of table and the
// chair (upright, and turned over) is built once from the world's own solids
// (tables-shapes.ts) and stamped where each stands, finely for its area's
// detail and in a few dozen triangles for its stand-in.

import { TABLES, topHeight } from "@fly/world";
import type { Solid, TableKind } from "@fly/world";
import { areaNamed } from "./areas.ts";
import type { Part } from "./parts.ts";
import { TABLES_GLSL } from "./tables-look.ts";
import { Lot, Mesh } from "./tables-mesh.ts";
import { apron, centred, chair, column, crossedFoot, farChair, farFour, farPedestal, marbleTop, oakLeg, oakTop, roundFoot, spider } from "./tables-shapes.ts";
import type { ChairSolids } from "./tables-shapes.ts";

/** Solids named `name` within `reach` of (x, z). */
const near = (solids: readonly Solid[], x: number, z: number, reach: number, name: (n: string) => boolean) =>
  solids.filter((s) => name(s.name) && Math.hypot(s.footprint.x - x, s.footprint.z - z) < reach);

function one(list: readonly Solid[], what: string) {
  if (list.length !== 1) throw new Error(`Expected one ${what}, found ${list.length}`);
  return list[0];
}

/** A table's own solids (not its chairs'), moved to its middle. */
function tableSolids(solids: readonly Solid[], kind: TableKind) {
  const t = TABLES.find((t) => t.kind === kind)!;
  const own = near(solids, t.x, t.z, 600, (n) => !n.startsWith("chair")).map((s) => centred(s, t.x, t.z));
  const named = (n: string) => own.filter((s) => s.name === n);
  return { top: one(named("table"), "table top"), named };
}

/** A chair's solids in its own frame, from a chair the world has facing +z. */
function chairSolids(solids: readonly Solid[], upturned: boolean) {
  const c = TABLES.flatMap((t) => t.chairs).find((c) => c.yaw === 0 && (c.upturned !== undefined) === upturned)!;
  const own = near(solids, c.x, c.z, 210, (n) => n.startsWith("chair")).map((s) => centred(s, c.x, c.z));
  const named = (n: string) => own.filter((s) => s.name === n);
  const rails = named("chair rail").sort((a, b) => (b.footprint.kind === "box" ? b.footprint.hx : 0) - (a.footprint.kind === "box" ? a.footprint.hx : 0));
  return {
    seat: one(named("chair seat"), "chair seat"),
    leg: one(named("chair leg").filter((s) => s.footprint.x > 0), "chair leg"),
    post: one(named("chair post").filter((s) => s.footprint.x > 0), "chair post"),
    rail: rails[0],
    mid: rails[1],
  };
}

export const tables: Part = {
  build(b, solids) {
    const near = new Map<TableKind, Mesh>();
    const far = new Map<TableKind, Mesh>();
    for (const kind of ["round", "square", "four"] as const) {
      const { top, named } = tableSolids(solids, kind);
      const m = new Mesh();
      const s = new Mesh();
      if (kind === "four") {
        oakTop(m, top);
        const into = (top.bottom ?? 0) + 0.1;
        for (const leg of named("table leg")) oakLeg(m, leg, into);
        for (const board of named("apron")) apron(m, board, into);
        farFour(s, top, named("table leg"), named("apron"));
      } else {
        const pedestal = one(named("pedestal"), "pedestal");
        marbleTop(m, top);
        spider(m, one(named("spider"), "spider"), kind === "round");
        // The round foot buries the column's plinth; the crossed one stands it on the floor between its bars.
        column(m, pedestal, kind === "round" ? 40 : 0);
        if (kind === "round") roundFoot(m, one(named("table foot"), "table foot"));
        else crossedFoot(m, named("table foot"));
        farPedestal(s, top, named("table foot"), pedestal);
      }
      near.set(kind, m);
      far.set(kind, s);
    }

    const upright = chairSolids(solids, false);
    const turned = chairSolids(solids, true);
    // Upturned, the seat's crown rests on the table, a tenth of a millimetre in.
    const flip = (turned.seat.bottom ?? 0) - 0.1 + topHeight(upright.seat, 0, 0);
    const parts: ChairSolids = { ...upright, tip: turned.leg };
    const { back, rear } = chair(parts, flip);
    const over = back.flipped(flip);
    const farChairs = farChair(parts, flip);

    const lots = new Map<number, { near: Lot; far: Lot }>();
    for (const t of TABLES) {
      const area = areaNamed(t.id).id;
      let lot = lots.get(area);
      if (!lot) lots.set(area, (lot = { near: new Lot(), far: new Lot() }));
      lot.near.add(near.get(t.kind)!, t);
      lot.far.add(far.get(t.kind)!, t);
      for (const c of t.chairs) {
        if (c.upturned === undefined) {
          lot.near.add(back, c);
          lot.near.add(rear, c);
          lot.far.add(farChairs.upright, c);
        } else {
          lot.near.add(over, c);
          lot.far.add(farChairs.upturned, c);
        }
      }
    }
    for (const [area, lot] of lots) {
      for (const { kind, geometry } of lot.near.geometries()) b.detailPainted(area, geometry, kind);
      for (const { kind, geometry } of lot.far.geometries()) b.standIn(area, geometry, "#ffffff", kind);
    }
  },
  solid: TABLES_GLSL,
};
