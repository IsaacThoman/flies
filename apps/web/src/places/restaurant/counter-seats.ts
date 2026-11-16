// The bar's stools and the lamps over it. Each stool is a cast-iron foot, a
// post and a leather seat on a wooden pan, turned to the world's own
// profiles; each pendant an enamel bell (the world's dome) closed underneath
// by a frosted diffuser, hung on a braided cord from a canopy on the
// ceiling. The middle pendant is the one left on.

import { DINING_ROOM, PENDANTS, STOOL } from "@fly/world";
import type { Solid } from "@fly/world";
import { areaOf } from "./areas.ts";
import type { Builder } from "./builder.ts";
import { turn } from "./counter-shapes.ts";
import { KIND } from "./kinds.ts";

/** The counter's own kinds (kinds.ts, PART_KINDS.counter), shaded in counter.ts. */
export const CTR = {
  leather: 72,
  cord: 73,
  diffuser: 74,
  shade: 75,
  citrus: 76,
  peach: 77,
  board: 78,
  cake: 79,
} as const;

const { seat, post, foot } = STOOL;
type Profile = [number, number][];

/** A dome's height at radius r: base + height × (1 − (r/R)²)^power. */
export const domeAt = (r: number, R: number, base: number, height: number, power: number) => base + height * Math.pow(Math.max(0, 1 - (r / R) ** 2), power);

const footAt = (r: number) => domeAt(r, foot.r, foot.rim, foot.crown, 1);
const seatAt = (r: number) => domeAt(r, seat.r, seat.rim, seat.crown, 1);

/** A shallow ring turned into a top `at` radius r: 0.4 mm deep, 5 mm across. */
const groove = (r: number, at: (r: number) => number): Profile => [
  [r + 2.5, at(r + 2.5)],
  [r, at(r) - 0.4],
  [r - 2.5, at(r - 2.5)],
];

/** The foot: its edge rounded, then the world's dome in to the post, with two rings turned into it. */
const FOOT: Profile = [
  [foot.r, 0],
  [foot.r, foot.rim - 1.4],
  [foot.r - 0.45, foot.rim - 0.4],
  ...[foot.r - 1.4, 200, 160].map((r): Profile[number] => [r, footAt(r)]),
  ...groove(121.5, footAt),
  ...[84, 50, post].map((r): Profile[number] => [r, footAt(r)]),
];

/** The foot and the post up from it, with turned grooves near its foot and under the seat. */
const IRON: Profile = [
  ...FOOT,
  [post, 644],
  [post - 0.6, 645],
  [post - 0.6, 647],
  [post, 648],
  [post, seat.bottom + 0.5],
];

/** The seat's wooden pan, under the cushion. */
const PAN: Profile = [
  [0, seat.bottom],
  [seat.r - 4, seat.bottom],
  [seat.r - 1.2, seat.bottom + 0.5],
  [seat.r - 0.2, seat.bottom + 1.8],
  [seat.r, seat.bottom + 3.5],
  [seat.r, seat.bottom + 13.6],
  [seat.r - 0.4, seat.bottom + 14.6],
  [seat.r - 1.5, seat.bottom + 15],
];

/** The leather cushion: piped round its bottom and its top, the world's dome over it. */
const CUSHION: Profile = [
  [seat.r - 1.8, seat.bottom + 14.9],
  [seat.r - 0.1, seat.bottom + 16.2],
  [seat.r - 0.4, seat.bottom + 17.8],
  [seat.r - 1.6, seat.bottom + 19.2],
  [seat.r - 1.6, seat.rim - 4.4],
  [seat.r - 0.4, seat.rim - 3],
  [seat.r - 0.1, seat.rim - 1.4],
  [seat.r - 0.7, seat.rim - 0.3],
  ...[seat.r - 1.6, 172, 152, 120, 80, 38, 0].map((r): [number, number] => [r, seatAt(r)]),
];

/** A stool's turned parts at the origin, built once and moved to each stool. */
function stoolParts() {
  return {
    iron: turn(IRON, 40),
    pan: turn(PAN, 40),
    cushion: turn(CUSHION, 40),
    farIron: turn([[foot.r, 0], [foot.r, foot.rim], [post, footAt(post)], [post, seat.bottom]], 8),
    farSeat: turn([[0, seat.bottom], [seat.r, seat.bottom], [seat.r, seat.rim], [0, seat.rim + seat.crown]], 8),
  };
}

function stool(b: Builder, s: Solid, parts: ReturnType<typeof stoolParts>) {
  const { x, z } = s.footprint;
  const area = areaOf(s);
  b.detail(area, parts.iron.clone().translate(x, 0, z), "#ffffff", KIND.iron);
  b.detail(area, parts.pan.clone().translate(x, 0, z), "#ffffff", KIND.bentwood);
  b.detail(area, parts.cushion.clone().translate(x, 0, z), "#6e1c16", CTR.leather);
  b.standIn(area, parts.farIron.clone().translate(x, 0, z), "#ffffff", KIND.iron);
  b.standIn(area, parts.farSeat.clone().translate(x, 0, z), "#6e1c16", CTR.leather);
}

const P = PENDANTS;
const shadeAt = (r: number) => domeAt(r, P.r, P.bottom, P.height, 1);
/** Where the diffuser closes the shade, a little up inside its rim. */
const DIFFUSER = { y: P.bottom + 4, r: P.r - 6.3 };

/** The shade: the rolled rim (its white inside showing above the diffuser), then the world's paraboloid up to the cord. */
const SHADE: Profile = [
  [DIFFUSER.r - 0.4, DIFFUSER.y],
  [P.r - 4.9, P.bottom + 1.7],
  [P.r - 3.6, P.bottom + 0.4],
  [P.r - 1.8, P.bottom],
  [P.r, P.bottom],
  [P.r, P.bottom],
  ...[P.r - 0.6, P.r - 2, P.r - 6, P.r - 16, 135, 105, 70, 36, 25, 23, 0].map((r): Profile[number] => [r, shadeAt(r)]),
];

/** The canopy the cord hangs from, at the ceiling: out of reach. */
const CANOPY: Profile = [
  [P.cord, DINING_ROOM.height - 48],
  [14, DINING_ROOM.height - 48],
  [17, DINING_ROOM.height - 46],
  [40, DINING_ROOM.height - 32],
  [46, DINING_ROOM.height - 24],
  [46, DINING_ROOM.height],
];

function pendantParts() {
  return {
    shade: turn(SHADE, 48),
    diffuser: turn([[0, DIFFUSER.y], [DIFFUSER.r, DIFFUSER.y]], 48),
    farShade: turn([[P.r, P.bottom], [P.r * 0.7, shadeAt(P.r * 0.7)], [0, P.bottom + P.height]], 12),
    farDiffuser: turn([[0, DIFFUSER.y], [DIFFUSER.r, DIFFUSER.y]], 12),
  };
}

function pendant(b: Builder, s: Solid, parts: ReturnType<typeof pendantParts>) {
  const { x, z } = s.footprint;
  const area = areaOf(s);
  b.detail(area, parts.shade.clone().translate(x, 0, z), "#1d4632", CTR.shade);
  b.detail(area, parts.diffuser.clone().translate(x, 0, z), "#f4efe4", CTR.diffuser);
  b.standIn(area, parts.farShade.clone().translate(x, 0, z), "#1d4632", CTR.shade);
  b.standIn(area, parts.farDiffuser.clone().translate(x, 0, z), "#f4efe4", CTR.diffuser);
}

function cord(b: Builder, s: Solid) {
  const { x, z } = s.footprint;
  const area = areaOf(s);
  const y0 = s.bottom ?? 0;
  b.detail(area, turn([[P.cord, y0], [P.cord, DINING_ROOM.height - 47]], 10, x, z), "#2a2420", CTR.cord);
  b.detail(area, turn(CANOPY, 24, x, z), "#ffffff", KIND.brass);
  b.standIn(area, turn([[P.cord, y0], [P.cord, DINING_ROOM.height]], 3, x, z), "#2a2420", CTR.cord);
}

/** Draws the stools and the pendants: whichever of their solids it is given (a stool's foot and post come with its seat). */
export function buildSeats(b: Builder, solids: readonly Solid[]) {
  const stools = stoolParts();
  const pendants = pendantParts();
  for (const s of solids) {
    if (s.name === "stool") stool(b, s, stools);
    else if (s.name === "pendant") pendant(b, s, pendants);
    else if (s.name === "cord") cord(b, s);
  }
  for (const g of [...Object.values(stools), ...Object.values(pendants)]) g.dispose();
}

export const SEATS = new Set(["stool", "stool foot", "stool post", "pendant", "cord"]);
