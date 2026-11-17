import assert from "node:assert/strict";
import { test } from "node:test";
import { Contacts, FLY_HEIGHT, FLY_LENGTH, MAX_CONTACTS, POINT_REACH, TOUCH_PARTS, TOUCH_POINTS, press, pressFlat } from "../src/index.ts";
import type { TouchPart } from "../src/index.ts";

const standing = { position: { x: 0, y: 0, z: 0 }, yaw: 0, onFeet: true };

/** What a contact at a point (mm, in the fly's frame standing at the origin facing +z, its left +x) presses, part by part. */
function felt(at: { ahead: number; up: number; left: number }, reach: number, strength = 1, body = standing): Record<TouchPart, number> {
  const out = new Float64Array(TOUCH_PARTS.length);
  press(body, at.left, at.up, at.ahead, reach, strength, out);
  return Object.fromEntries(TOUCH_PARTS.map((part, k) => [part, out[k]])) as Record<TouchPart, number>;
}
const touched = (parts: Record<TouchPart, number>) => TOUCH_PARTS.filter((part) => parts[part] > 0);
const HEAD = TOUCH_PARTS.filter((part) => /Eye|Front|Occiput|Mouthparts/.test(part));

test("every part has points, the sided ones mirrored left to right, standing and in the air", () => {
  for (const points of [TOUCH_POINTS.standing, TOUCH_POINTS.flying]) {
    for (const part of TOUCH_PARTS) assert.ok(points.some((p) => p.part === part), part);
    for (const p of points) {
      const mirror = p.part.endsWith("Left") ? p.part.replace(/Left$/, "Right") : p.part.endsWith("Right") ? p.part.replace(/Right$/, "Left") : p.part;
      assert.ok(points.some((q) => q.part === mirror && q.ahead === p.ahead && q.up === p.up && q.left === -p.left), `${p.part} at ${p.ahead}, ${p.up}, ${p.left}`);
    }
  }
});

test("a feather resting on its back touches its notum and wings, not its head", () => {
  const parts = felt({ ahead: 0, up: FLY_HEIGHT, left: 0 }, 0.5, 0.4);
  assert.ok(parts.touchNotum > 0 && parts.touchNotum <= 0.4);
  assert.ok(parts.touchWings > 0);
  for (const part of HEAD) assert.equal(parts[part], 0, part);
  assert.equal(parts.touchLegs, 0);
});

test("a raindrop lands where it lands: on its head, its head's top; on its abdomen, its folded wings and its abdomen", () => {
  const head = felt({ ahead: 0.4 * FLY_LENGTH, up: FLY_HEIGHT, left: 0 }, 0.5, 0.25);
  assert.ok(head.touchFrontLeft > 0 && head.touchFrontRight > 0 && head.touchEyeLeft > 0);
  assert.equal(head.touchMouthpartsLeft, 0);
  assert.equal(head.touchLegs, 0);
  const tail = felt({ ahead: -0.4 * FLY_LENGTH, up: FLY_HEIGHT, left: 0 }, 0.5, 0.25);
  assert.deepEqual(touched(tail), ["touchWings", "touchAbdomen"]);
});

test("touched on one side of its head, that side's parts feel it", () => {
  const parts = felt({ ahead: 0.4 * FLY_LENGTH, up: 0.34 * FLY_LENGTH, left: 1 }, POINT_REACH);
  assert.ok(parts.touchEyeLeft > 0);
  assert.equal(parts.touchEyeRight, 0);
});

test("each part feels the contact's strength times the share of its points touched, at most the strength", () => {
  const all = felt({ ahead: 0, up: FLY_HEIGHT, left: 0 }, 10, 0.7);
  for (const part of TOUCH_PARTS) assert.ok(Math.abs(all[part] - 0.7) < 1e-12, part);
  const some = felt({ ahead: 0, up: FLY_HEIGHT, left: 0 }, 0.5, 1);
  assert.ok(some.touchNotum > 0 && some.touchNotum < 1);
});

test("it is touched the same wherever it stands and whichever way it faces", () => {
  const yaw = 2.1;
  const body = { position: { x: 30, y: 5, z: -12 }, yaw, onFeet: true };
  // The point 0.4 body lengths behind its middle, on its top, turned with it.
  const back = -0.4 * FLY_LENGTH;
  const out = new Float64Array(TOUCH_PARTS.length);
  press(body, 30 + Math.sin(yaw) * back, 5 + FLY_HEIGHT, -12 + Math.cos(yaw) * back, 0.5, 0.25, out);
  const there = felt({ ahead: back, up: FLY_HEIGHT, left: 0 }, 0.5, 0.25);
  TOUCH_PARTS.forEach((part, k) => assert.ok(Math.abs(out[k] - there[part]) < 1e-12, part));
});

test("landing, its feet meet the ground; flying into a wall, its face does; standing at one, its front legs", () => {
  const out = new Float64Array(TOUCH_PARTS.length);
  pressFlat(standing, 0, 1, 0, POINT_REACH, 1, out);
  assert.deepEqual(TOUCH_PARTS.filter((_, k) => out[k] > 0), ["touchLegs"]);
  out.fill(0);
  pressFlat({ ...standing, onFeet: false }, 0, 0, -1, POINT_REACH, 1, out);
  assert.equal(out[TOUCH_PARTS.indexOf("touchFrontLeft")], 1);
  assert.equal(out[TOUCH_PARTS.indexOf("touchLegs")], 0);
  out.fill(0);
  pressFlat(standing, 0, 0, -1, POINT_REACH, 1, out);
  assert.deepEqual(TOUCH_PARTS.filter((_, k) => out[k] > 0), ["touchLegs"]);
});

test("contacts are kept up to a frame's worth, without allocating, and cleared", () => {
  const contacts = new Contacts();
  contacts.add(1, 2, 3, 0.5, 0);
  assert.equal(contacts.count, 0, "nothing at strength 0");
  for (let k = 0; k < MAX_CONTACTS + 3; k++) contacts.add(k, 0, 0, 0.5, k === 2 ? 3 : 0.5);
  assert.equal(contacts.count, MAX_CONTACTS);
  assert.equal(contacts.strongest, 1, "strength is at most 1");
  const copy = new Contacts();
  copy.addAll(contacts);
  assert.equal(copy.count, MAX_CONTACTS);
  contacts.clear();
  assert.equal(contacts.count, 0);
  assert.equal(contacts.strongest, 0);
});
