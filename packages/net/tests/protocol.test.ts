import assert from "node:assert/strict";
import { test } from "node:test";
import { DINING_ROOM, PASS, RESTAURANT, TABLE_TOPS, WORLDS } from "@fly/world";
import {
  AIRBORNE, BITES, CLOSE, EATING, FLIES, FLY, FLY_MAX, HANDS, MAX_OWN, OWN_MAX, HOLDING, PROTOCOL, createFlyState, decodeBites, decodeFlies, dropOwner,
  AIR_BEYOND, BITES_MAX, MAX_BITES, ROOM_SCALE, TABLETOP_SCALE, bitesEpoch, bitesLength, roomTime, encodeBites, encodeFlies, encodeFly, encodeOwn, foundId, isTableCode, readState, seqAtOrAfter, stateLength, tableCode, wireScale,
} from "../src/index.ts";
import type { FlyState } from "../src/index.ts";

function sampleState(): FlyState {
  const s = createFlyState();
  s.id = 6;
  s.flags = AIRBORNE | EATING | HANDS | HOLDING;
  s.seq = 65535;
  s.epoch = 300;
  s.t = 123456.4;
  s.x = -123.456;
  s.y = 87.65;
  s.z = 301.2;
  s.yaw = -2.5;
  s.upX = 0.3;
  s.upZ = -0.2;
  s.vx = 410.4;
  s.vy = -12;
  s.vz = 3;
  Object.assign(s.pose, { speed: -3.3, turn: 2.2, wings: 0.7, groom: 0.1, feed: 0.9, crouch: 0.4, pitch: 0.5, roll: -0.3 });
  Object.assign(s.hand, { x: 10.5, y: 2.25, z: -40.1, eyeX: 400, eyeY: 120.5, eyeZ: -300, tool: 3, variant: 1 });
  return s;
}

test("a fly's state goes over the wire in 35 bytes, 49 with the hand, and comes back as near as the eye can tell", () => {
  const view = new DataView(new ArrayBuffer(FLY_MAX));
  const s = sampleState();
  const n = encodeFly(view, TABLETOP_SCALE, s);
  assert.equal(n, 49);
  s.flags &= ~HANDS;
  assert.equal(encodeFly(view, TABLETOP_SCALE, s), 35);
  s.flags |= HANDS;
  encodeFly(view, TABLETOP_SCALE, s);
  assert.equal(view.getUint8(0), FLY);
  assert.equal(view.getUint8(1), 1);
  assert.equal(view.getUint8(2), s.id);
  const back = createFlyState();
  assert.equal(readState(view, 3, TABLETOP_SCALE, back), 3 + stateLength(s.flags));
  assert.equal(back.flags, s.flags);
  assert.equal(back.seq, 65535);
  assert.equal(back.epoch, 300 & 0xff, "the place's count wraps at a byte");
  assert.equal(back.t, 123456);
  for (const k of ["x", "y", "z"] as const) assert.ok(Math.abs(back[k] - s[k]) <= 0.01, k);
  // Yaw comes back in [0, 2π), the same heading.
  assert.ok(Math.abs(Math.atan2(Math.sin(back.yaw - s.yaw), Math.cos(back.yaw - s.yaw))) < 1e-4);
  assert.ok(Math.abs(back.upX - 0.3) < 0.01 && Math.abs(back.upZ + 0.2) < 0.01);
  assert.equal(back.vx, 410);
  for (const k of ["speed", "turn", "wings", "groom", "feed", "crouch", "pitch", "roll"] as const) assert.ok(Math.abs(back.pose[k] - s.pose[k]) < 0.13, k);
  assert.ok(Math.abs(back.hand.x - 10.5) < 0.03 && Math.abs(back.hand.eyeY - 120.5) < 0.06);
  assert.equal(back.hand.tool, 3);
  assert.equal(back.hand.variant, 1);
});

test("a tabletop's state keeps its original bytes inside the protocol 4 batch", () => {
  const view = new DataView(new ArrayBuffer(FLY_MAX));
  const n = encodeFly(view, wireScale(WORLDS.lab), sampleState());
  // Existing state bytes remain compatible inside the new batch envelope.
  assert.equal(Buffer.from(view.buffer, 0, n).toString("hex"), "0101061d2cffff40e20100e3e71f11d43a249a26e79a01f4ff0300f323b31ae6664bc4d2002d00defca00fb50448f40301");
});

test("each place has the finest scale that holds it: a tabletop's for the tables, a room's for the restaurant", () => {
  for (const id of ["picnic", "windowsill", "lab", "greenhouse", "kitchen"]) assert.deepEqual(wireScale(WORLDS[id]), { position: 50, pointer: 20, eye: 10 }, id);
  assert.equal(wireScale(RESTAURANT), ROOM_SCALE);
});

test("in the restaurant a fly, its pointer and its camera go anywhere in the room and come back within half a step", () => {
  const scale = wireScale(RESTAURANT);
  const view = new DataView(new ArrayBuffer(FLY_MAX));
  const back = createFlyState();
  const { hx, hz, height, wall } = DINING_ROOM;
  // The fly: over the floor and in the air past its edge, from the floor to the ceiling. The pointer and the camera: anywhere within the walls, and the kitchen's bench behind the back one.
  const flies = [-hx - AIR_BEYOND, -1234.56, 0, 987.65, hx + AIR_BEYOND];
  const deep = [-hz - AIR_BEYOND, -2100.3, 0, 1777.7, hz + AIR_BEYOND];
  const highs = [0, TABLE_TOPS.round.top, 1080, height, height + 400];
  const reach = [-hx - wall, -2000.1, 3.3, hx + wall];
  const across = [PASS.kitchen.z0, -hz - wall, 41.9, hz + wall];
  for (const x of flies) for (const z of deep) for (const y of highs) {
    const s = sampleState();
    s.x = x;
    s.y = y;
    s.z = z;
    for (const hxp of reach) for (const hzp of across) {
      Object.assign(s.hand, { x: hxp, y: y / 2, z: hzp, eyeX: -hxp, eyeY: height, eyeZ: -hzp });
      encodeFly(view, scale, s);
      readState(view, 3, scale, back);
      for (const k of ["x", "y", "z"] as const) assert.ok(Math.abs(back[k] - s[k]) <= 0.5 / scale.position + 1e-9, `${k} ${s[k]}`);
      for (const k of ["x", "y", "z"] as const) assert.ok(Math.abs(back.hand[k] - s.hand[k]) <= 0.5 / scale.pointer + 1e-9, `pointer ${k} ${s.hand[k]}`);
      for (const k of ["eyeX", "eyeY", "eyeZ"] as const) assert.ok(Math.abs(back.hand[k] - s.hand[k]) <= 0.5 / scale.eye + 1e-9, `camera ${k} ${s.hand[k]}`);
    }
  }
});

test("a length past a scale's range is held at its end, never wrapped round to the other side", () => {
  const view = new DataView(new ArrayBuffer(FLY_MAX));
  const back = createFlyState();
  for (const scale of [TABLETOP_SCALE, ROOM_SCALE]) {
    const s = sampleState();
    s.x = 1e6;
    s.z = -1e6;
    s.hand.x = 1e6;
    s.hand.eyeZ = -1e6;
    encodeFly(view, scale, s);
    readState(view, 3, scale, back);
    assert.equal(back.x, 32767 / scale.position);
    assert.equal(back.z, -32768 / scale.position);
    assert.equal(back.hand.x, 32767 / scale.pointer);
    assert.equal(back.hand.eyeZ, -32768 / scale.eye);
  }
});

test("a short or broken message is refused, not read past its end", () => {
  const view = new DataView(new ArrayBuffer(20));
  assert.equal(readState(view, 1, TABLETOP_SCALE, createFlyState()), -1);
  const batch = new DataView(new Uint8Array([FLIES, 3, 1]).buffer);
  assert.equal(decodeFlies(batch, TABLETOP_SCALE, createFlyState(), () => {}), -1);
});

test("a batch carries every fly's state with its player's id", () => {
  const a = sampleState();
  a.id = 4;
  const b = sampleState();
  b.id = 7;
  b.flags = 0;
  b.x = 5;
  const view = new DataView(new ArrayBuffer(256));
  const n = encodeFlies(view, TABLETOP_SCALE, [a, b]);
  assert.equal(n, 2 + 1 + 46 + 1 + 32);
  const seen: [number, number][] = [];
  assert.equal(decodeFlies(new DataView(view.buffer, 0, n), TABLETOP_SCALE, createFlyState(), (s) => seen.push([s.id, Math.round(s.x)])), 2);
  assert.deepEqual(seen, [[4, -123], [7, 5]]);
});

test("bites carry the food and how much, with the sender's count", () => {
  const view = new DataView(new ArrayBuffer(64));
  const n = encodeBites(view, 70000, [{ food: 3, amount: 0.0123 }, { food: 2_000_007, amount: 0.5 }]);
  assert.equal(n, 20);
  assert.equal(view.getUint8(0), BITES);
  const got: [number, number][] = [];
  assert.equal(decodeBites(new DataView(view.buffer, 0, n), (f, a) => got.push([f, a])), 70000 & 0xffff);
  assert.equal(got[0][0], 3);
  assert.ok(Math.abs(got[0][1] - 0.0123) < 1e-6);
  assert.equal(got[1][0], 2_000_007);
  assert.ok(Math.abs(got[1][1] - 0.5) < 1e-6, "each bite carries its own amount");
});

test("bites name the place's epoch after them, where a reader of the bites alone still finds them as before", () => {
  const view = new DataView(new ArrayBuffer(BITES_MAX));
  const bites = [{ food: 3, amount: 0.0123 }, { food: 2_000_007, amount: 0.5 }];
  const n = encodeBites(view, 9, bites, bites.length, 260);
  assert.equal(n, 21);
  const tagged = new DataView(view.buffer, 0, n);
  assert.equal(bitesEpoch(tagged), 260 & 0xff);
  const got: number[] = [];
  assert.equal(decodeBites(tagged, (f) => got.push(f)), 9, "the bites are read as they always were");
  assert.deepEqual(got, [3, 2_000_007]);
  assert.equal(bitesEpoch(new DataView(view.buffer, 0, encodeBites(view, 9, bites))), null, "a device from before says no epoch");
  assert.ok(BITES_MAX >= bitesLength(MAX_BITES) + 1);
});

test("a fly's time on the wire wraps at 2^32 ms, and is read back as the room time nearest the reader's", () => {
  const wrap = 2 ** 32;
  for (const now of [0, 1000, wrap - 10, wrap + 5, 3 * wrap + 123_456]) {
    for (const offset of [-3000, -1, 0, 1, 499, 2000]) {
      const t = now + offset;
      if (t < 0) continue;
      const view = new DataView(new ArrayBuffer(FLY_MAX));
      const s = createFlyState();
      s.t = t;
      encodeFly(view, TABLETOP_SCALE, s);
      const back = createFlyState();
      // After the batch's type, count and the fly's id.
      readState(view, 3, TABLETOP_SCALE, back);
      assert.ok(back.t < wrap);
      assert.equal(roomTime(back.t, now), t, `${t} read at ${now}`);
    }
  }
});

test("sequence numbers compare across their wrap", () => {
  assert.ok(seqAtOrAfter(5, 65530));
  assert.ok(!seqAtOrAfter(65530, 5));
  assert.ok(seqAtOrAfter(7, 7));
});

test("protocol 5 retains fly batches and agrees on seasonal weather", () => {
  assert.equal(PROTOCOL, 5);
  assert.equal(CLOSE.locked, 4008);
});

test("dropped food is named for its player, found food for where it is", () => {
  assert.equal(dropOwner(3_000_012), 3);
  assert.equal(dropOwner(11), 0);
  assert.equal(foundId("strawberry juice", 10.1, -4), foundId("strawberry juice", 10.2, -4.1));
  assert.notEqual(foundId("strawberry juice", 10, -4), foundId("strawberry juice", 30, -4));
  assert.equal(dropOwner(foundId("crumb", 1, 1)), 0);
});

test("a table's code is ten letters and digits that can't be mistaken for one another, and nothing else is one", () => {
  const random = (bytes: Uint8Array<ArrayBuffer>) => crypto.getRandomValues(bytes);
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const code = tableCode(random);
    assert.ok(isTableCode(code), code);
    assert.ok(!/[01ilo]/.test(code), code);
    seen.add(code);
  }
  assert.equal(seen.size, 200);
  for (const bad of ["", "abc", "ABCDEFGHJK", "abcdefghj1", "abcdefghjkm", null, 12345]) assert.ok(!isTableCode(bad), String(bad));
});

test("an own batch carries up to MAX_OWN fly ids, one hand and only the requested count, at either place scale", () => {
  for (const scale of [TABLETOP_SCALE, ROOM_SCALE]) {
    const states = Array.from({ length: MAX_OWN }, (_, i) => {
      const s = sampleState();
      s.id = i + 2;
      if (i > 0) s.flags &= ~HANDS;
      s.x += i;
      return s;
    });
    const view = new DataView(new ArrayBuffer(OWN_MAX));
    const n = encodeOwn(view, scale, states);
    assert.equal(n, OWN_MAX);
    assert.equal(view.getUint8(0), FLY);
    const seen: [number, number, boolean][] = [];
    const decode = (bytes: number) => decodeFlies(new DataView(view.buffer, 0, bytes), scale, createFlyState(), (s) => seen.push([s.id, s.x, !!(s.flags & HANDS)]), FLY);
    assert.equal(decode(n), MAX_OWN);
    assert.deepEqual(seen.map(([id, , hand]) => [id, hand]), [[2, true], [3, false], [4, false], [5, false]]);
    for (const [i, [, x]] of seen.entries()) assert.ok(Math.abs(x - states[i].x) <= 0.5 / scale.position);
    seen.length = 0;
    const short = encodeOwn(view, scale, states, 2);
    assert.equal(decode(short), 2);
    assert.deepEqual(seen.map(([id]) => id), [2, 3]);
    assert.equal(decodeFlies(new DataView(view.buffer, 0, short), scale, createFlyState(), () => {}), -1, "a FLY is not a room's FLIES");
    assert.equal(decode(short - 1), -1, "a truncated own batch is refused");
  }
});

test("the single-fly helper is byte-identical to a one-element own batch, including its fly id", () => {
  const s = sampleState();
  const single = new DataView(new ArrayBuffer(FLY_MAX));
  const own = new DataView(new ArrayBuffer(OWN_MAX));
  const n = encodeFly(single, TABLETOP_SCALE, s);
  assert.equal(n, encodeOwn(own, TABLETOP_SCALE, [s]));
  assert.deepEqual(new Uint8Array(single.buffer, 0, n), new Uint8Array(own.buffer, 0, n));
  const ids: number[] = [];
  assert.equal(decodeFlies(new DataView(single.buffer, 0, n), TABLETOP_SCALE, createFlyState(), (s) => ids.push(s.id), FLY), 1);
  assert.deepEqual(ids, [6]);
});

test("every truncated hand state is refused without changing the caller's state", () => {
  const encoded = new DataView(new ArrayBuffer(FLY_MAX));
  const n = encodeFly(encoded, TABLETOP_SCALE, sampleState());
  for (let length = 0; length < n; length++) {
    const state = createFlyState();
    state.x = 42;
    const untouched = structuredClone(state);
    assert.equal(readState(new DataView(encoded.buffer, 0, length), 3, TABLETOP_SCALE, state), -1, `length ${length}`);
    assert.deepEqual(state, untouched);
  }
});

test("bites are bounded to sixteen, and incomplete or oversized requests deliver no bites", () => {
  const out = new DataView(new ArrayBuffer(4 + 17 * 8));
  const bites = Array.from({ length: 17 }, (_, i) => ({ food: i + 1, amount: 0.25 }));
  const length = encodeBites(out, 42, bites);
  assert.equal(length, 4 + 16 * 8);
  const seen: number[] = [];
  assert.equal(decodeBites(new DataView(out.buffer, 0, length), (id) => seen.push(id)), 42);
  assert.deepEqual(seen, bites.slice(0, 16).map((b) => b.food));
  for (let n = 0; n < length; n++) {
    let calls = 0;
    assert.equal(decodeBites(new DataView(out.buffer, 0, n), () => calls++), -1, `length ${n}`);
    assert.equal(calls, 0);
  }
  out.setUint8(3, 17);
  assert.equal(decodeBites(out, () => assert.fail("oversized request delivered a bite")), -1);
});

test("half a sequence space is ambiguous and never counts as a newer packet", () => {
  for (const a of [0, 1, 12345, 32767]) {
    assert.equal(seqAtOrAfter(a, a + 32768), false);
    assert.equal(seqAtOrAfter(a + 32768, a), false);
  }
});
