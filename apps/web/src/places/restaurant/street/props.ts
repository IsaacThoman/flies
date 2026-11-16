// What stands in the street: the lamp posts, the cars parked along this kerb
// (and a delivery van by day), what is left out on the restaurant's own
// pavement for the night (a bicycle at its rack, the terrace's tables and
// chairs stacked against the front, a bin, a planter), and the plane trees on
// the far pavement.

import * as THREE from "three";
import { random } from "../../../scene/build.ts";
import { LAMPS, PARKED, STREET } from "./layout.ts";
import { BY_DAY, KIND, Pieces } from "./pieces.ts";

/** Car paints, by a car's look. */
export const PAINTS: readonly string[] = ["#1d2a44", "#b9bcc0", "#e9e6df", "#7a1c1e", "#18191b", "#2f4a3a", "#d8a62a", "#4a5560", "#6c2a4a", "#3a6a8a"];
const TYRE = "#141414";
const CAR_WIDTH = 1760;

/**
 * A car, its front toward +x, its middle at (x, z) on the road, `length`
 * long: the body, the cabin's glass, the roof, wheels and bumpers, and its
 * lamps (white at the front, red behind).
 */
export function car(pieces: Pieces, length: number, paint: THREE.ColorRepresentation, x: number, y: number, z: number, flip = false) {
  const L = length;
  const W = CAR_WIDTH;
  const at = new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationY(flip ? Math.PI : 0));
  const put = (g: THREE.BufferGeometry, color: THREE.ColorRepresentation, k: number) => pieces.add(g.applyMatrix4(at), color, k);
  const side = (points: [number, number][], width: number) => new THREE.ExtrudeGeometry(new THREE.Shape(points.map(([a, b]) => new THREE.Vector2(a, b))), { depth: width, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, -width / 2);
  put(side([[-L / 2, 300], [L / 2, 300], [L / 2, 700], [L / 2 - 180, 790], [L / 2 - 1000, 880], [-L / 2 + 250, 910], [-L / 2, 820]], W), paint, KIND.paint);
  put(side([[L / 2 - 1050, 870], [-L / 2 + 330, 900], [-L / 2 + 950, 1400], [L / 2 - 1850, 1390]], W - 110), "#20262b", KIND.glass);
  put(new THREE.BoxGeometry(L - 2850, 55, W - 150).translate(-L / 2 + 950 + (L - 2850) / 2 + 30, 1420, 0), paint, KIND.paint);
  for (const end of [-1, 1]) {
    put(new THREE.BoxGeometry(160, 200, W + 20).translate(end * (L / 2 + 20), 400, 0), "#2a2a2c", KIND.matte);
    for (const s of [-1, 1]) {
      put(new THREE.CylinderGeometry(320, 320, 220, 12).rotateX(Math.PI / 2).translate(end * (L / 2 - 800), 320, s * (W / 2 - 90)), TYRE, KIND.matte);
      put(new THREE.BoxGeometry(30, 110, 320).translate(end * (L / 2 + 4), end > 0 ? 650 : 760, s * (W / 2 - 260)), end > 0 ? "#f4f0e4" : "#c01818", KIND.lens);
    }
  }
}

/** A delivery van, there by day: a tall box behind a cab. */
function van(pieces: Pieces, x: number, y: number, z: number) {
  const day = BY_DAY;
  pieces.box(x - 2700, x + 1300, y + 350, y + 2600, z - 1000, z + 1000, "#ecebe6", KIND.paint + day);
  pieces.box(x + 1300, x + 2350, y + 350, y + 1250, z - 980, z + 980, "#ecebe6", KIND.paint + day);
  pieces.add(new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(1050, 0), new THREE.Vector2(500, 850), new THREE.Vector2(0, 950)]), { depth: 1900, bevelEnabled: false }).translate(x + 1300, y + 1250, z - 950), "#2a3036", KIND.glass + day);
  for (const ax of [x - 1800, x + 1700]) for (const s of [-1, 1]) pieces.add(new THREE.CylinderGeometry(340, 340, 240, 12).rotateX(Math.PI / 2).translate(ax, y + 340, z + s * 900), TYRE, KIND.matte + day);
  pieces.box(x + 2350, x + 2400, y + 700, y + 850, z - 800, z - 500, "#f4f0e4", KIND.lens + day);
  pieces.box(x + 2350, x + 2400, y + 700, y + 850, z + 500, z + 800, "#f4f0e4", KIND.lens + day);
}

/** A lamp post on a kerb, its lantern at the lamp's place: a column on a plinth, a short arm, a six-sided lantern under a cap. */
function lampPost(pieces: Pieces, x: number, y: number, z: number, top: number) {
  const iron = "#1c2420";
  pieces.add(new THREE.CylinderGeometry(150, 190, 700, 8).translate(x, y + 350, z), iron, KIND.metal);
  pieces.add(new THREE.CylinderGeometry(55, 80, top - y - 300, 8).translate(x, (y + top - 300) / 2, z), iron, KIND.metal);
  lantern(pieces, x, top, z, iron);
}

function lantern(pieces: Pieces, x: number, y: number, z: number, iron: string) {
  pieces.add(new THREE.CylinderGeometry(70, 40, 120, 6).translate(x, y - 330, z), iron, KIND.metal);
  pieces.add(new THREE.CylinderGeometry(200, 120, 440, 6).translate(x, y, z), "#fff4dc", KIND.lantern);
  pieces.add(new THREE.ConeGeometry(260, 220, 6).translate(x, y + 330, z), iron, KIND.metal);
  pieces.add(new THREE.SphereGeometry(40, 6, 4).translate(x, y + 470, z), iron, KIND.metal);
}

/** A bicycle, side on along x, its wheels on the ground at y. */
function bicycle(pieces: Pieces, x: number, y: number, z: number, frame: string) {
  const r = 340;
  const rear = new THREE.Vector3(x - 520, y + r, z);
  const front = new THREE.Vector3(x + 520, y + r, z);
  for (const c of [rear, front]) {
    pieces.add(new THREE.TorusGeometry(r - 10, 16, 5, 22).translate(c.x, c.y, c.z), TYRE, KIND.matte);
    pieces.add(new THREE.CylinderGeometry(22, 22, 70, 6).rotateX(Math.PI / 2).translate(c.x, c.y, c.z), "#8a8c8e", KIND.metal);
  }
  const seat = new THREE.Vector3(x - 200, y + r + 560, z);
  const crank = new THREE.Vector3(x - 40, y + r - 20, z);
  const head = new THREE.Vector3(x + 420, y + r + 520, z);
  const tube = (a: THREE.Vector3, b: THREE.Vector3, w = 18, color = frame) => {
    const d = new THREE.Vector3().subVectors(b, a);
    const g = new THREE.CylinderGeometry(w, w, d.length(), 6);
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())));
    const m = a.clone().add(b).multiplyScalar(0.5);
    pieces.add(g.translate(m.x, m.y, m.z), color, KIND.metal);
  };
  tube(rear, crank);
  tube(rear, seat);
  tube(seat, crank);
  tube(seat.clone().add(new THREE.Vector3(30, -40, 0)), head);
  tube(crank, head);
  tube(head, front, 16);
  tube(seat, seat.clone().add(new THREE.Vector3(0, 120, 0)), 12, "#8a8c8e");
  pieces.box(seat.x - 150, seat.x + 100, seat.y + 110, seat.y + 160, z - 60, z + 60, "#1a1612", KIND.matte);
  tube(head, head.clone().add(new THREE.Vector3(0, 120, 0)), 14, "#8a8c8e");
  pieces.add(new THREE.CylinderGeometry(14, 14, 560, 6).rotateX(Math.PI / 2).translate(head.x, head.y + 120, z), "#8a8c8e", KIND.metal);
  // A basket on the front, as a city bike has.
  pieces.box(front.x - 80, front.x + 160, head.y - 30, head.y + 140, z - 150, z + 150, "#a07e4e", KIND.matte);
}

export function buildProps(pieces: Pieces) {
  const rnd = random(77);
  const walk = STREET.pavement;
  const road = STREET.road;
  for (const lamp of LAMPS) {
    if (lamp.z > STREET.facades) {
      // Down the side street the lanterns hang from brackets on the houses.
      const wall = lamp.x < (STREET.side.x0 + STREET.side.x1) / 2 ? STREET.side.x0 : STREET.side.x1;
      pieces.box(Math.min(wall, lamp.x), Math.max(wall, lamp.x), lamp.y + 560, lamp.y + 600, lamp.z - 25, lamp.z + 25, "#1c2420", KIND.metal);
      lantern(pieces, lamp.x, lamp.y, lamp.z, "#1c2420");
    } else lampPost(pieces, lamp.x, walk, lamp.z, lamp.y);
  }
  for (const p of PARKED) car(pieces, p.length, PAINTS[p.look % PAINTS.length], p.x, road, STREET.parking, rnd.next() < 0.5);
  // By day a van unloading on the far side.
  van(pieces, -10_400, road, STREET.farKerb - 1150);

  // Out on the restaurant's pavement: a bicycle locked to its rack, the bin by the lamp, the terrace stacked away, a box of box hedge by the door.
  const kerbSide = STREET.kerb - 650;
  for (const x of [-3300, -2300]) pieces.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(x - 330, walk, kerbSide), new THREE.Vector3(x - 330, walk + 650, kerbSide), new THREE.Vector3(x - 200, walk + 820, kerbSide), new THREE.Vector3(x + 200, walk + 820, kerbSide), new THREE.Vector3(x + 330, walk + 650, kerbSide), new THREE.Vector3(x + 330, walk, kerbSide)]), 16, 26, 6), "#7c7f82", KIND.metal);
  bicycle(pieces, -3250, walk, kerbSide - 140, "#2f5a6a");
  pieces.add(new THREE.CylinderGeometry(270, 240, 900, 12).translate(1700, walk + 450, STREET.kerb - 500), "#24382c", KIND.metal);
  pieces.add(new THREE.CylinderGeometry(285, 285, 70, 12).translate(1700, walk + 930, STREET.kerb - 500), "#1e2e24", KIND.metal);
  const terrace = { x: -3550, z: STREET.front + 420 };
  for (let i = 0; i < 2; i++) {
    const x = terrace.x + i * 720;
    pieces.add(new THREE.CylinderGeometry(300, 300, 30, 16).translate(x, walk + 740, terrace.z), "#c8c4bc", KIND.metal);
    pieces.add(new THREE.CylinderGeometry(28, 28, 720, 6).translate(x, walk + 370, terrace.z), "#2a2a2a", KIND.metal);
    pieces.add(new THREE.CylinderGeometry(220, 220, 20, 12).translate(x, walk + 10, terrace.z), "#2a2a2a", KIND.metal);
  }
  for (let i = 0; i < 5; i++) {
    // Chairs stacked in a leaning column: their seats and backs, and the legs of the bottom one.
    const x = terrace.x + 1500 + rnd.range(-15, 15);
    const y = walk + 450 + i * 60;
    pieces.box(x - 210, x + 210, y, y + 25, terrace.z - 210, terrace.z + 210, "#6e4a34", KIND.matte);
    pieces.box(x - 200, x + 200, y + 25 + 200, y + 25 + 420, terrace.z - 230, terrace.z - 205, "#6e4a34", KIND.matte);
  }
  for (const s of [-1, 1]) for (const t of [-1, 1]) pieces.add(new THREE.CylinderGeometry(12, 12, 450, 5).translate(terrace.x + 1500 + s * 190, walk + 225, terrace.z + t * 190), "#4a4a4a", KIND.metal);
  pieces.box(2350, 2850, walk, walk + 550, STREET.front + 80, STREET.front + 480, "#3a3530", KIND.matte);
  for (let i = 0; i < 4; i++) pieces.add(new THREE.IcosahedronGeometry(rnd.range(180, 240), 1).translate(2420 + i * 120, walk + 650 + rnd.range(-40, 60), STREET.front + 280), "#3f5a34", KIND.leaves);
  // Bollards along the kerb at the corner of the side street, across.
  for (let x = STREET.side.x0 + 300; x < STREET.side.x1; x += 1400) pieces.add(new THREE.CylinderGeometry(70, 80, 900, 8).translate(x, walk + 450, STREET.farKerb + 300), "#202424", KIND.metal);

  // Plane trees on the far pavement, their crowns lit from under by the lamps at night.
  for (const x of [-8800, 14_200, -23_000, 27_500, -36_000]) {
    const z = STREET.farKerb + 1100;
    pieces.add(new THREE.CylinderGeometry(120, 200, 5200, 7).translate(x, walk + 2600, z), "#6a6052", KIND.matte);
    pieces.add(new THREE.BoxGeometry(1100, 30, 1100).translate(x, walk + 10, z), "#3a3a38", KIND.metal);
    for (let k = 0; k < 9; k++) {
      const s = rnd.range(700, 1250);
      const a = rnd.range(0, Math.PI * 2);
      const r = rnd.range(0, 1300);
      pieces.add(new THREE.IcosahedronGeometry(s, 1).scale(1.15, 0.8, 1).translate(x + Math.cos(a) * r, walk + 6200 + rnd.range(-500, 1300), z + Math.sin(a) * r * 0.7), k % 3 ? "#4c6a36" : "#5a7a40", KIND.leaves);
    }
  }
}
