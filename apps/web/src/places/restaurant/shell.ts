// The room itself: the penny-round floor, the wainscot and the plaster above
// it, the pressed-tin ceiling and its cornice, the shop front's frames, its
// ledge and its door, the pass through the back wall and the dim kitchen
// beyond it, the kitchen's swing door, the ceiling fans still for the night.
// Every face the fly can reach is in the world's plane (a wall's face, the
// glass's): the wainscot's panels are sunk into the wall, not proud of it;
// what stands out (the cornice, the fans, the head over the shop front) is
// above the fly's ceiling or past the floor's edge. Drawn always, as part of
// the room-wide far mesh, and what the fly's eyes see with the stand-ins.

import * as THREE from "three";
import { BANQUETTE, DINING_ROOM, PASS, SHOPFRONT } from "@fly/world";
import type { Builder } from "./builder.ts";
import { box, lathe } from "./geometry.ts";
import { KIND } from "./kinds.ts";
import { BACK_MIRROR } from "./backbar.ts";
import { DIFFUSERS } from "./live.ts";
import { FANS, FRONT, KITCHEN, OUT_OF_REACH, WAINSCOT } from "./plan.ts";
import { mat4 } from "../../scene/build.ts";

const { hx, hz, height } = DINING_ROOM;

/** A rectangle of wall, facing into the room from one of its four walls: along the wall from u0 to u1 (x, or z on the side walls), y0 to y1 up, `inset` mm into the wall. */
type Wall = "back" | "front" | "left" | "right";
function face(wall: Wall, u0: number, u1: number, y0: number, y1: number, inset = 0) {
  const w = u1 - u0;
  const h = y1 - y0;
  const g = new THREE.PlaneGeometry(w, h);
  const u = (u0 + u1) / 2;
  const y = (y0 + y1) / 2;
  if (wall === "back") return g.translate(u, y, -hz - inset);
  if (wall === "front") return g.rotateY(Math.PI).translate(u, y, hz + inset);
  if (wall === "left") return g.rotateY(Math.PI / 2).translate(-hx - inset, y, u);
  return g.rotateY(-Math.PI / 2).translate(hx + inset, y, u);
}

/** A strip from the wall's plane back to a recess, along one edge of a sunk panel: its bevel. */
function bevel(wall: Wall, a: [number, number], b: [number, number], depth: number, inwardU: number, inwardY: number, slope: number) {
  // Corners in (along, up, into the wall), the strip's outer edge at the plane, its inner edge `slope` mm in and `depth` deep.
  const pts = [
    [a[0], a[1], 0],
    [b[0], b[1], 0],
    [b[0] + inwardU * slope, b[1] + inwardY * slope, depth],
    [a[0] + inwardU * slope, a[1] + inwardY * slope, depth],
  ];
  const world = pts.map(([u, y, d]) => {
    if (wall === "back") return [u, y, -hz - d];
    if (wall === "front") return [u, y, hz + d];
    if (wall === "left") return [-hx - d, y, u];
    return [hx + d, y, u];
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([...world[0], ...world[1], ...world[2], ...world[0], ...world[2], ...world[3]], 3));
  g.computeVertexNormals();
  // Whichever way round the corners came, face the room.
  const n = g.attributes.normal;
  const into = wall === "back" ? [0, 0, 1] : wall === "front" ? [0, 0, -1] : wall === "left" ? [1, 0, 0] : [-1, 0, 0];
  if (n.getX(0) * into[0] + n.getY(0) * into[1] + n.getZ(0) * into[2] < 0) {
    const p = g.attributes.position.array as Float32Array;
    for (let i = 0; i < 6; i += 3) for (let k = 0; k < 3; k++) [p[(i + 1) * 3 + k], p[(i + 2) * 3 + k]] = [p[(i + 2) * 3 + k], p[(i + 1) * 3 + k]];
    g.computeVertexNormals();
  }
  return g;
}

/**
 * The wainscot along a run of wall: skirting, rails and stiles in the wall's
 * plane, panels sunk 9 mm into it between bevels; above it, plaster to the
 * ceiling (with gaps where `openings` say).
 */
function wainscot(b: Builder, wall: Wall, u0: number, u1: number, top = WAINSCOT.rail) {
  const wood = "#ffffff";
  const { skirt } = WAINSCOT;
  const length = u1 - u0;
  b.shell(face(wall, u0, u1, 0, skirt), "#5a4636", KIND.mahogany);
  const railH = 70;
  b.shell(face(wall, u0, u1, top - railH, top), wood, KIND.mahogany);
  const lower = skirt + 60;
  b.shell(face(wall, u0, u1, skirt, lower), wood, KIND.mahogany);
  const n = Math.max(1, Math.round(length / 620));
  const w = length / n;
  const stile = 70;
  const y0 = lower;
  const y1 = top - railH;
  for (let i = 0; i <= n; i++) {
    const at = u0 + i * w;
    const a = i === 0 ? at : at - stile / 2;
    const c = i === n ? at : at + stile / 2;
    if (c > a) b.shell(face(wall, a, c, y0, y1), wood, KIND.mahogany);
  }
  const depth = 9;
  const slope = 18;
  for (let i = 0; i < n; i++) {
    const a = u0 + i * w + (i === 0 ? 0 : stile / 2);
    const c = u0 + (i + 1) * w - (i === n - 1 ? 0 : stile / 2);
    b.shell(face(wall, a + slope, c - slope, y0 + slope, y1 - slope, depth), "#d8c8bc", KIND.mahogany);
    b.shell(bevel(wall, [a, y0], [c, y0], depth, 0, 1, slope), wood, KIND.mahogany);
    b.shell(bevel(wall, [c, y1], [a, y1], depth, 0, -1, slope), wood, KIND.mahogany);
    b.shell(bevel(wall, [a, y1], [a, y0], depth, 1, 0, slope), wood, KIND.mahogany);
    b.shell(bevel(wall, [c, y0], [c, y1], depth, -1, 0, slope), wood, KIND.mahogany);
  }
}

export function buildShell(b: Builder) {
  const cream = "#e2d2ae";

  // The floor, from wall to wall, and on under the back bar and the banquette.
  b.shell(new THREE.PlaneGeometry(hx * 2, hz * 2).rotateX(-Math.PI / 2), "#ffffff", KIND.tile);

  // The walls: wainscot to the rail, plaster above to the cornice.
  const plaster = (wall: Wall, u0: number, u1: number, y0: number, y1: number) => b.shell(face(wall, u0, u1, y0, y1), cream, KIND.plaster);
  const { rail } = WAINSCOT;
  // The back wall, either side of the pass and the kitchen's door.
  const { x0: px0, x1: px1, sill, head } = PASS;
  const door = PASS.door;
  // The kitchen door's frame round it, in the wall's plane.
  const frame = 60;
  const dx0 = door.x0 - frame;
  const dx1 = door.x1 + frame;
  wainscot(b, "back", -hx, px0);
  wainscot(b, "back", px1, dx0);
  wainscot(b, "back", dx1, hx);
  plaster("back", -hx, px0, rail, height);
  plaster("back", px1, dx0, rail, height);
  plaster("back", dx1, hx, rail, height);
  plaster("back", px0, px1, head, height);
  plaster("back", dx0, dx1, door.head + frame, height);
  // Under the pass: steel-clad, for the kitchen's knocks.
  b.shell(face("back", px0, px1, 0, sill), "#ffffff", KIND.steel);
  // The left wall behind the bar, and the right behind the banquette (which hides its foot).
  wainscot(b, "left", -hz, hz);
  // Round the back bar's mirror, sunk into the wall over the shelves (backbar.ts).
  const m = BACK_MIRROR;
  plaster("left", -hz, m.z0, rail, height);
  plaster("left", m.z1, hz, rail, height);
  plaster("left", m.z0, m.z1, m.y1, height);
  wainscot(b, "right", -hz, BANQUETTE.z0);
  wainscot(b, "right", BANQUETTE.z1, hz - 0.5);
  b.shell(face("right", BANQUETTE.z0, BANQUETTE.z1, 0, BANQUETTE.back.top), "#3a2a20", KIND.mahogany);
  plaster("right", BANQUETTE.z0, BANQUETTE.z1, BANQUETTE.back.top, rail + 150);
  plaster("right", -hz, hz, rail + 150, height);
  plaster("right", -hz, BANQUETTE.z0, rail, rail + 150);
  plaster("right", BANQUETTE.z1, hz, rail, rail + 150);
  // A picture rail high on the walls, and a deep cornice where they meet the tin: out of the fly's reach.
  const coveProfile: [number, number][] = [];
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Math.PI / 2;
    coveProfile.push([Math.sin(a) * 150, height - 150 + (1 - Math.cos(a)) * 150]);
  }
  const cornice = (wall: Wall, u0: number, u1: number) => {
    // A quarter-round cove from the wall up to the ceiling, then a flat fillet and a bead.
    const steps = coveProfile.length;
    const positions: number[] = [];
    for (let i = 0; i < steps - 1; i++) {
      const [o0, y0] = coveProfile[i];
      const [o1, y1] = coveProfile[i + 1];
      const quad = [
        [u0, y0, o0],
        [u1, y0, o0],
        [u1, y1, o1],
        [u0, y0, o0],
        [u1, y1, o1],
        [u0, y1, o1],
      ];
      for (const [u, y, o] of quad) {
        if (wall === "back") positions.push(u, y, -hz + o);
        else if (wall === "front") positions.push(u, y, hz - o);
        else if (wall === "left") positions.push(-hx + o, y, u);
        else positions.push(hx - o, y, u);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    if (wall === "front" || wall === "left") {
      const p = g.attributes.position.array as Float32Array;
      for (let i = 0; i < p.length; i += 9) for (let k = 0; k < 3; k++) [p[i + 3 + k], p[i + 6 + k]] = [p[i + 6 + k], p[i + 3 + k]];
    }
    g.computeVertexNormals();
    b.shell(g, "#e8dcc0", KIND.plaster);
    b.shell(face(wall, u0, u1, height - 190, height - 150), "#d8c8a8", KIND.paint);
  };
  cornice("back", -hx, hx);
  cornice("front", -hx, hx);
  cornice("left", -hz, hz);
  cornice("right", -hz, hz);
  for (const wall of ["back", "left", "right"] as const) {
    const [u0, u1] = wall === "back" ? [-hx, hx] : [-hz, hz];
    b.shell(face(wall, u0, u1, OUT_OF_REACH + 220, OUT_OF_REACH + 250, -12), "#5a4232", KIND.mahogany);
  }

  // The pressed-tin ceiling, and the roses the pendants hang from.
  b.shell(new THREE.PlaneGeometry(hx * 2, hz * 2).rotateX(Math.PI / 2).translate(0, height, 0), "#e6dcc4", KIND.tin);

  // The kitchen's swing door, flat in the back wall: a painted leaf with a kick plate and a round window into the dim kitchen.
  {
    const w = door.x1 - door.x0;
    const porthole = { x: (door.x0 + door.x1) / 2, y: 1500, r: 160 };
    const leaf = new THREE.Shape();
    leaf.moveTo(-w / 2, 0);
    leaf.lineTo(w / 2, 0);
    leaf.lineTo(w / 2, door.head);
    leaf.lineTo(-w / 2, door.head);
    leaf.lineTo(-w / 2, 0);
    const hole = new THREE.Path();
    hole.absarc(0, porthole.y, porthole.r, 0, Math.PI * 2, true);
    leaf.holes.push(hole);
    b.shell(new THREE.ShapeGeometry(leaf, 24).translate(porthole.x, 0, -hz), "#24382e", KIND.paint);
    b.shell(new THREE.RingGeometry(porthole.r - 0.01, porthole.r + 26, 40).translate(porthole.x, porthole.y, -hz + 0.4), "#ffffff", KIND.steel);
    b.shell(new THREE.CircleGeometry(porthole.r, 32).translate(porthole.x, porthole.y, -hz - 12), "#46504c", KIND.kitchen);
    b.shell(box(door.x0 + 40, 0, -hz, door.x1 - 40, 280, -hz + 0.4), "#ffffff", KIND.steel);
    for (const x of [dx0, door.x1]) b.shell(face("back", x, x + frame, 0, door.head + frame), "#ffffff", KIND.mahogany);
    b.shell(face("back", door.x0, door.x1, door.head, door.head + frame), "#ffffff", KIND.mahogany);
  }

  // The pass's reveal through the wall, steel-lined.
  {
    const t = DINING_ROOM.wall;
    b.shell(new THREE.PlaneGeometry(px1 - px0, t).rotateX(Math.PI / 2).translate((px0 + px1) / 2, head, -hz - t / 2), "#ffffff", KIND.steel);
    b.shell(new THREE.PlaneGeometry(t, head - sill).rotateY(Math.PI / 2).translate(px0, (sill + head) / 2, -hz - t / 2), "#ffffff", KIND.steel);
    b.shell(new THREE.PlaneGeometry(t, head - sill).rotateY(-Math.PI / 2).translate(px1, (sill + head) / 2, -hz - t / 2), "#ffffff", KIND.steel);
  }

  // The kitchen beyond, dim: white tiles, the line of ranges and its hood along the far wall, steel tables, a shelf of pans.
  {
    const { z0, z1, x0, x1, ceiling, line } = KITCHEN;
    const tile = "#9aa4a0";
    b.shell(new THREE.PlaneGeometry(x1 - x0, z0 - z1).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, 0, (z0 + z1) / 2), "#4a4640", KIND.kitchen);
    b.shell(new THREE.PlaneGeometry(x1 - x0, z0 - z1).rotateX(Math.PI / 2).translate((x0 + x1) / 2, ceiling, (z0 + z1) / 2), "#6a6e6a", KIND.kitchen);
    b.shell(new THREE.PlaneGeometry(x1 - x0, ceiling).translate((x0 + x1) / 2, ceiling / 2, z1), tile, KIND.kitchen);
    b.shell(new THREE.PlaneGeometry(z0 - z1, ceiling).rotateY(Math.PI / 2).translate(x0, ceiling / 2, (z0 + z1) / 2), tile, KIND.kitchen);
    b.shell(new THREE.PlaneGeometry(z0 - z1, ceiling).rotateY(-Math.PI / 2).translate(x1, ceiling / 2, (z0 + z1) / 2), tile, KIND.kitchen);
    b.shell(box(x0 + 200, 0, line.z - line.depth / 2, x1 - 200, line.top, z1), "#7a8080", KIND.kitchen);
    b.shell(box(x0 + 300, 1800, z1 + 0, x1 - 300, 2300, z1 + 900), "#8a9090", KIND.kitchen);
    b.shell(box(PASS.x0 + 100, 0, -4300, PASS.x1 - 100, 880, -3600), "#8c9292", KIND.kitchen);
    b.shell(box(x0 + 200, 1500, z1 + 40, x0 + 1600, 1530, z1 + 380), "#7a8080", KIND.kitchen);
    for (let i = 0; i < 4; i++) b.shell(new THREE.CylinderGeometry(110, 100, 120, 14).translate(x0 + 400 + i * 300, 1590, z1 + 210), "#5a5e5e", KIND.kitchen);
    // A strip light left on over the line.
    b.shell(box(x0 + 600, ceiling - 40, line.z - 60, x1 - 600, ceiling, line.z + 60), "#e8f4ff", KIND.lamp);
  }

  // The shop front from inside: the ledge under the glass, its panelled riser; the mullions and the transom; the head and fascia over them; the door's leaf beyond the glass.
  {
    const z = FRONT.z;
    const { ledge, mullion, transom } = SHOPFRONT;
    const ledgeZ = z - ledge.depth;
    b.shell(box(ledge.x0, ledge.top - 30, ledgeZ, ledge.x1, ledge.top, z), "#ffffff", KIND.mahogany);
    b.shell(new THREE.PlaneGeometry(ledge.x1 - ledge.x0, ledge.top - 30).rotateY(Math.PI).translate((ledge.x0 + ledge.x1) / 2, (ledge.top - 30) / 2, ledgeZ), "#ffffff", KIND.mahogany);
    // The riser's sunk panels, on its face toward the room.
    const bays = Math.round((ledge.x1 - ledge.x0) / 750);
    const w = (ledge.x1 - ledge.x0) / bays;
    for (let i = 0; i < bays; i++) {
      const a = ledge.x0 + i * w + 50;
      const c = ledge.x0 + (i + 1) * w - 50;
      b.shell(new THREE.PlaneGeometry(c - a - 30, ledge.top - 200).rotateY(Math.PI).translate((a + c) / 2, ledge.top / 2 - 15, ledgeZ + 8), "#c8b4a8", KIND.mahogany);
      for (const [y0, y1] of [[100, 115], [ledge.top - 115, ledge.top - 100]]) b.shell(box(a, y0, ledgeZ, c, y1, ledgeZ + 8), "#ffffff", KIND.mahogany);
      for (const x of [a, c - 15]) b.shell(box(x, 100, ledgeZ, x + 15, ledge.top - 100, ledgeZ + 8), "#ffffff", KIND.mahogany);
    }
    b.shell(new THREE.PlaneGeometry(ledge.depth, ledge.top).rotateY(Math.PI / 2).translate(ledge.x1, ledge.top / 2, z - ledge.depth / 2), "#ffffff", KIND.mahogany);
    // Under the last pane, past the ledge's end, the riser in the glass's plane.
    b.shell(new THREE.PlaneGeometry(FRONT.x1 - ledge.x1, ledge.top).rotateY(Math.PI).translate((ledge.x1 + FRONT.x1) / 2, ledge.top / 2, z), "#ffffff", KIND.mahogany);
    const green = "#1d3027";
    for (const x of FRONT.bars) {
      const door = x === SHOPFRONT.door.x0 || x === SHOPFRONT.door.x1;
      b.shell(box(x - mullion.half, door ? 0 : ledge.top, z - mullion.depth, x + mullion.half, height, z), green, KIND.paint);
    }
    b.shell(box(-hx, transom.y - transom.half, z - transom.depth, hx, transom.y + transom.half, z), green, KIND.paint);
    // The glazing bars of the small panes above the transom, beyond the glass.
    for (let x = -hx + FRONT.pane; x < FRONT.door.x1; x += FRONT.pane) {
      if (FRONT.bars.some((m) => Math.abs(m - x) < 60)) continue;
      b.shell(box(x - 9, transom.y + transom.half, z + 2, x + 9, FRONT.head, z + 30), green, KIND.paint);
    }
    // The head over the shop front, a moulded beam out of reach, and the fascia's inside face above it.
    b.shell(box(-hx, FRONT.head, z - 90, hx, FRONT.head + 120, z), green, KIND.paint);
    b.shell(box(-hx, FRONT.head + 120, z - 50, hx, FRONT.head + 150, z), green, KIND.paint);
    b.shell(new THREE.PlaneGeometry(hx * 2, height - FRONT.head - 150).rotateY(Math.PI).translate(0, (height + FRONT.head + 150) / 2, z), cream, KIND.plaster);
    // The pier right of the door, in the glass's plane, panelled like the rest.
    wainscot(b, "front", SHOPFRONT.door.x1 + mullion.half, hx);
    plaster("front", SHOPFRONT.door.x1 + mullion.half, hx, rail, FRONT.head);
    // The door's leaf beyond the glass: stiles, rails, a kick plate, a brass push bar across its glass.
    const d = FRONT.door;
    b.shell(box(d.x0, 0, d.z0, d.x0 + d.stile, d.top + 100, d.z1), green, KIND.paint);
    b.shell(box(d.x1 - d.stile, 0, d.z0, d.x1, d.top + 100, d.z1), green, KIND.paint);
    b.shell(box(d.x0, 0, d.z0, d.x1, d.bottom, d.z1), green, KIND.paint);
    b.shell(box(d.x0, d.top, d.z0, d.x1, d.top + 100, d.z1), green, KIND.paint);
    b.shell(box(d.x0 + 20, 20, d.z0 - 1, d.x1 - 20, d.bottom - 30, d.z0), "#ffffff", KIND.brass);
    b.shell(new THREE.CylinderGeometry(14, 14, d.x1 - d.x0 - 200, 12).rotateZ(Math.PI / 2).translate((d.x0 + d.x1) / 2, 1050, d.z0 - 2), "#ffffff", KIND.brass);
    for (const x of [d.x0 + 110, d.x1 - 110]) b.shell(new THREE.CylinderGeometry(8, 8, 40, 8).rotateX(Math.PI / 2).translate(x, 1050, d.z0 + 15), "#ffffff", KIND.brass);
  }

  // The ventilation's diffusers, square louvres in the tin (live.ts).
  for (const d of DIFFUSERS) {
    for (const [half, depth] of [[230, 14], [170, 24], [110, 34], [50, 44]]) {
      for (const s of [-1, 1]) {
        b.shell(box(d.x - half, height - depth, d.z + s * half - 6, d.x + half, height, d.z + s * half + 6), "#d8dad8", KIND.steel);
        b.shell(box(d.x + s * half - 6, height - depth, d.z - half, d.x + s * half + 6, height, d.z + half), "#d8dad8", KIND.steel);
      }
    }
    b.shell(box(d.x - 45, height - 3, d.z - 45, d.x + 45, height - 1, d.z + 45), "#1a1c1c", KIND.matte);
  }

  // The ceiling fans, still: a brass motor on a downrod, five dark blades.
  for (const fan of FANS) {
    b.shell(lathe([[0, 0], [70, 0], [95, 40], [100, 90], [70, 130], [20, 140], [0, 142]], 10, fan.x, fan.z).translate(0, fan.y - 70, 0), "#ffffff", KIND.brass);
    b.shell(new THREE.CylinderGeometry(14, 14, height - fan.y - 60, 6, 1, true).translate(fan.x, (height + fan.y + 60) / 2, fan.z), "#ffffff", KIND.brass);
    b.shell(lathe([[0, 0], [60, 0], [70, 40], [0, 60]], 10, fan.x, fan.z).translate(0, height - 60, 0), "#ffffff", KIND.brass);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + fan.x * 0.001;
      b.shell(new THREE.BoxGeometry(fan.r - 90, 6, 120).translate((fan.r + 90) / 2, 0, 0), "#ffffff", KIND.mahogany, mat4({ x: fan.x, y: fan.y - 10, z: fan.z }, new THREE.Euler(0.08, a, 0)));
    }
  }

}
