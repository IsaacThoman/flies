// The nervous system drawn inside the fly: every part has a shape, the
// shapes sit where they should in the body, and they go with the body as the
// rig poses it.

import assert from "node:assert/strict";
import { test } from "node:test";
import { BODY_JOINTS, HEAD, J, LEG_COUNT, LEG_SEGMENTS, LEGS, THORAX, legPair } from "../src/anatomy.ts";
import { buildBody } from "../src/body.ts";
import { createFly } from "../src/index.ts";
import { buildNerves } from "../src/nerves/build.ts";
import { GLOW_SLOTS, NERVE_PARTS } from "../src/nerves/parts.ts";
import { pose } from "./helpers.ts";

const DT = 1 / 60;
const geometry = buildNerves();
const position = geometry.getAttribute("position"), normal = geometry.getAttribute("normal");
const joint = geometry.getAttribute("aJoint"), info = geometry.getAttribute("aInfo");
const ROLES = ["sensory", "central", "motor"];

/** Each vertex's part id, or null for the panel's backdrop. */
const partOf = (i: number) => (info.getX(i) < 0 ? null : NERVE_PARTS[Math.round(info.getX(i))].id);

/** Where a vertex is, posed by `frames`. */
function posed(frames: Float32Array, i: number): number[] {
  const o = Math.round(joint.getX(i)) * 12, x = position.getX(i), y = position.getY(i), z = position.getZ(i);
  return [0, 4, 8].map((r) => frames[o + r] * x + frames[o + r + 1] * y + frames[o + r + 2] * z + frames[o + r + 3]);
}

test("every part has a shape, with its part's role, on a joint the rig poses", () => {
  const counts = new Map<string, number>();
  for (let i = 0; i < position.count; i++) {
    const id = partOf(i);
    assert.ok(joint.getX(i) >= 0 && joint.getX(i) < BODY_JOINTS);
    if (id === null) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
    const part = NERVE_PARTS[Math.round(info.getX(i))];
    assert.equal(ROLES[Math.round(info.getY(i))], part.role, id);
    assert.ok(info.getZ(i) > 0, `${id} has tissue to draw`);
    assert.ok(Math.abs(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i)) - 1) < 1e-3, `${id} normal`);
  }
  for (const part of NERVE_PARTS) assert.ok((counts.get(part.id) ?? 0) > 0, `${part.id} is drawn`);
  assert.equal(new Set(NERVE_PARTS.map((p) => p.id)).size, NERVE_PARTS.length, "no part twice");
  assert.ok(GLOW_SLOTS >= NERVE_PARTS.length && GLOW_SLOTS % 4 === 0);
  // The panel's backdrop comes first, so that the panel draws it behind everything.
  assert.deepEqual([0, 1, 2, 3].map(partOf), [null, null, null, null]);
});

test("the brain sits in the head and the cord on the floor of the thorax", () => {
  const fly = createFly();
  const rest = fly.nerves.rest;
  // The thorax's underside along its length, from the body's own mesh near the midline.
  const body = buildBody(), bp = body.getAttribute("position"), bj = body.getAttribute("aJoint");
  const floor = new Map<number, number>();
  for (let i = 0; i < bp.count; i++) {
    if (Math.round(bj.getX(i)) !== J.thorax) continue;
    const o = J.thorax * 12, x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i);
    const q = [0, 4, 8].map((r) => rest[o + r] * x + rest[o + r + 1] * y + rest[o + r + 2] * z + rest[o + r + 3]);
    if (Math.abs(q[0]) > 0.06) continue;
    const k = Math.round(q[2] * 100);
    floor.set(k, Math.min(floor.get(k) ?? Infinity, q[1]));
  }
  const inside = (p: number[], centre: readonly number[], radii: readonly number[], room: number) =>
    ((p[0] - centre[0]) / radii[0]) ** 2 + ((p[1] - centre[1]) / radii[1]) ** 2 + ((p[2] - centre[2]) / radii[2]) ** 2 <= room;
  const brain = /^(lamina|medulla|lobula|optic|antennal-lobe|mushroom|superior|lateral-horn|ventrolateral|inferior|subesophageal|central-complex|pars|brain-rind)/;
  const cord = /^cord-(t[123]|abdominal|.*tectulum)-/;
  for (let i = 4; i < position.count; i++) {
    const id = partOf(i)!;
    const p = posed(rest, i);
    // The head capsule's back is flattened against the thorax: half as deep behind its middle.
    if (brain.test(id)) assert.ok(inside(p, HEAD.centre, [HEAD.radii[0] * 1.05, HEAD.radii[1], p[2] < HEAD.centre[2] ? HEAD.radii[2] * 0.6 : HEAD.radii[2]], 1), `${id} at ${p.map((x) => x.toFixed(3))} in the head`);
    if (cord.test(id)) {
      assert.ok(inside(p, THORAX.centre, [THORAX.radii[0], THORAX.radii[1], THORAX.radii[2] * 1.1], 1), `${id} in the thorax`);
      assert.ok(p[1] < THORAX.centre[1], `${id} low in the thorax`);
      if (Math.abs(p[0]) < 0.06) assert.ok(p[1] > (floor.get(Math.round(p[2] * 100)) ?? -Infinity), `${id} at ${p.map((x) => x.toFixed(3))} above the thorax's floor`);
    }
  }
  fly.dispose();
});

test("the nerves go with the legs, the head and the proboscis however the fly moves", () => {
  const fly = createFly();
  const legOf = (j: number) => (j >= J.leg && j < J.leg + LEG_COUNT * LEG_SEGMENTS ? Math.floor((j - J.leg) / LEG_SEGMENTS) : -1);
  const radius = [0.026, 0.0155, 0.0095, 0.0078, 0.0066];
  for (const p of [pose({ speed: 4, turn: 1 }), pose({ groom: 1 }), pose({ feed: 1 }), pose({ airborne: true, wings: 1, pitch: 0.4 }), pose({ crouch: 1 })]) {
    for (let t = 0; t < 1.2; t += DT) fly.update(p, DT);
    const frames = fly.rig.joints;
    for (let i = 4; i < position.count; i++) {
      const j = Math.round(joint.getX(i)), leg = legOf(j);
      if (leg < 0) continue;
      // Inside its segment: within the leg's radius of its axis (the segment's x axis, from its joint along its length).
      const seg = (j - J.leg) % LEG_SEGMENTS, spec = LEGS[legPair(leg)];
      const length = [spec.coxa, spec.femur, spec.tibia, spec.basitarsus, spec.tarsus][seg];
      const q = posed(frames, i), o = j * 12;
      const d = [q[0] - frames[o + 3], q[1] - frames[o + 7], q[2] - frames[o + 11]];
      const along = d[0] * frames[o] + d[1] * frames[o + 4] + d[2] * frames[o + 8];
      const off = Math.sqrt(Math.max(0, d[0] ** 2 + d[1] ** 2 + d[2] ** 2 - along ** 2));
      assert.ok(along > -0.005 && along < length + 0.005 && off <= radius[seg] * 1.2 + 0.001, `${partOf(i)} in leg ${leg} segment ${seg}`);
    }
  }
  fly.dispose();
});

test("the X-ray turns the body to glass and back, and draws the nervous system only while it is on", () => {
  const fly = createFly();
  const nerves = fly.object.getObjectByName("fly-nerves")!, body = fly.object.getObjectByName("fly-body") as import("three").Mesh;
  const opaque = body.material;
  fly.update(pose(), DT);
  assert.equal(nerves.visible, false);
  fly.nerves.xray = 0.3;
  fly.update(pose(), DT);
  assert.equal(nerves.visible, true);
  assert.notEqual(body.material, opaque);
  assert.ok((body.material as import("three").Material).transparent);
  fly.nerves.xray = 0;
  fly.update(pose(), DT);
  assert.equal(nerves.visible, false);
  assert.equal(body.material, opaque, "exactly the ordinary fly again");
  fly.nerves.xray = Number.NaN;
  fly.update(pose(), DT);
  assert.equal(nerves.visible, false, "nonsense is off");
  fly.dispose();
});
