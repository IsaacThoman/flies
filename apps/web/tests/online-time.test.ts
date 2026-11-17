import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import type { BrainDriver, TableSocket } from "@fly/contracts";
import { TABLETOP_SCALE, createFlyState, encodeFlies } from "@fly/net";
import { createPicnic } from "@fly/world";
import { Life } from "../src/life.ts";
import { Online } from "../src/online/online.ts";
import type { TableHost } from "../src/online/online.ts";
import { Hands } from "../src/tools/hands.ts";

const gradient = { addColorStop() {} };
const context = new Proxy({}, { get: () => () => gradient });
(globalThis as { document?: unknown }).document = { createElement: () => ({ getContext: () => context }) };
(globalThis as { Path2D?: unknown }).Path2D = class { addPath() {} moveTo() {} bezierCurveTo() {} quadraticCurveTo() {} closePath() {} };

test("other flies keep moving across u32 room-time wraps, including a synchronized clock after several wraps", (t) => {
  let now = 0;
  t.mock.method(performance, "now", () => now);
  const world = createPicnic();
  const life = new Life(world, {} as BrainDriver);
  const host = { scene: new THREE.Scene(), life, hands: new Hands(world), eyes: { see() {} }, stage: { weather: { rain: 0 }, set: {} }, fly: { model: { mark() {} } }, bubbles: { table: null } } as unknown as TableHost;
  const socket: TableSocket = { status: "connecting", closeCode: 0, closeReason: "", send() {}, drain() {}, close() {} };
  const online = new Online(host, () => socket, "ws://test", "abcdefghjk", "key", null);
  t.after(() => { online.leave(); online.dispose(); });
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 10, 20);
  const step = () => online.update(0.05, camera, 480, now / 1000, () => 0);
  const batch = new DataView(new ArrayBuffer(100));
  for (const cycle of [1, 3]) {
    online.others.forget();
    online.line.onMessage({ type: "joined", id: 2, colour: "#ffffff", away: false });
    const offset = cycle === 3 ? 3 * 2 ** 32 - 400 : -6000;
    for (let i = -2; i <= 3; i++) {
      const roomNow = cycle * 2 ** 32 + i * 50;
      now = roomNow - offset;
      if (i === -2) online.line.clock.sample(now, roomNow, now);
      step();
      const state = createFlyState();
      state.id = 2;
      state.seq = i + 3;
      state.t = roomNow;
      state.x = i;
      const n = encodeFlies(batch, TABLETOP_SCALE, [state]);
      online.line.onFlies(new DataView(batch.buffer, 0, n));
      assert.equal(online.others.get(2)!.track.newest!.t, roomNow, `cycle ${cycle}, step ${i}`);
    }
    step();
    const other = online.others.get(2)!;
    assert.equal(other.resting, false);
    assert.ok(other.position.x > 0, "interpolated movement crosses the wrap");
  }
});
