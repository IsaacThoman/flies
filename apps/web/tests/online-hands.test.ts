import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { Contacts } from "@fly/body";
import type { BrainDriver, TableSocket } from "@fly/contracts";
import { AWAY, HANDS, HOLDING, TABLETOP_SCALE, createFlyState, encodeFlies } from "@fly/net";
import { World } from "@fly/world";
import { Life } from "../src/life.ts";
import { Online } from "../src/online/online.ts";
import { OtherFlies } from "../src/online/others.ts";
import type { TableHost } from "../src/online/online.ts";
import { Hands, TOOLS } from "../src/tools/hands.ts";

const gradient = { addColorStop() {} };
const context = new Proxy({}, { get: () => () => gradient });
(globalThis as { document?: unknown }).document = { createElement: () => ({ getContext: () => context }) };
(globalThis as { Path2D?: unknown }).Path2D = class { addPath() {} moveTo() {} bezierCurveTo() {} quadraticCurveTo() {} closePath() {} };

for (const tool of ["feather", "blow"]) for (const stop of ["away", "flag", "silence"]) {
  test(`${tool} stops on ${stop}, while committed drops and balls finish`, (t) => {
    let now = 1000;
    t.mock.method(performance, "now", () => now);
    const world = new World({ floor: { kind: "rect", hx: 500, hz: 500 }, solids: [], patches: [], start: { x: 0, z: 0, yaw: 0 }, ceiling: 300 });
    const life = new Life(world, {} as BrainDriver);
    const scene = new THREE.Scene();
    const host = {
      scene, life, company: { list: [] }, others: new OtherFlies(scene, world), hands: new Hands(world), eyes: { see() {} }, stage: { weather: { rain: 0 }, set: {} }, fly: { model: { mark() {} } },
      bubbles: { table: null }, felt: { air: { x: 0, y: 0, z: 0 }, contacts: new Contacts(), looming: [] }, flies: () => 1, seat() {}, share() {},
    } as unknown as TableHost;
    const socket: TableSocket = { status: "connecting", closeCode: 0, closeReason: "", send() {}, drain() {}, close() {} };
    const online = new Online(host, () => socket, "ws://test", "abcdefghjk", "key", null);
    t.after(() => { online.leave(); online.dispose(); });
    online.line.onMessage({ type: "joined", id: 2, colour: "#ffffff", away: false, of: 2 });
    const state = createFlyState();
    state.id = 2;
    state.t = now;
    state.flags = HANDS | HOLDING;
    state.hand.tool = TOOLS.findIndex((toolSpec) => toolSpec.id === tool);
    state.hand.eyeZ = -10;
    const batch = new DataView(new ArrayBuffer(100));
    const hear = () => { const n = encodeFlies(batch, TABLETOP_SCALE, [state]); online.line.onFlies(new DataView(batch.buffer, 0, n)); };
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 10, 20);
    // The other flies posed where the table has them (the game does it each frame, others.ts), then the table's frame, which their hands act in.
    const step = () => {
      online.others.update(online.line.clock.now(now), 0.02, camera.position, 480, life.body);
      online.update(0.02, camera, now / 1000, () => 0);
    };
    const contacts = new Contacts();
    const feather = () => {
      contacts.clear();
      online.touch(life.body, contacts);
      return contacts.strongest;
    };
    const stimulus = () => tool === "feather" ? feather() : Math.hypot(online.air.x, online.air.y, online.air.z);
    step(); hear(); step();
    assert.ok(stimulus() > 0, "the live tool acts first");
    online.line.onMessage({ type: "drop", by: 2, id: 2000001, kind: "sugar", x: 10, z: 0, y: 0, at: now });
    online.line.onMessage({ type: "ball", by: 2, at: now - 1, from: [0, 5, -10], via: [0, 5, 0], to: [0, 5, 10] });
    if (stop === "away") online.line.onMessage({ type: "away", id: 2, away: true });
    else if (stop === "flag") { state.flags |= AWAY; state.seq++; state.t++; hear(); }
    else { now += 1499; step(); assert.ok(stimulus() > 0); now += 2; }
    step();
    assert.equal(stimulus(), 0);
    assert.ok(online.threat, "committed ball remains in flight");
    for (let i = 0; i < 100; i++) { now += 20; step(); }
    assert.ok(online.pantry.foods.some((f) => f.id === 2000001), "drop still lands");
    assert.equal(online.threat, null, "ball finishes");
    now += 50;
    state.flags = HANDS | HOLDING;
    state.seq++;
    state.t = now;
    online.line.onMessage({ type: "away", id: 2, away: false });
    hear(); step();
    assert.ok(stimulus() > 0, "fresh input resumes the tool");
  });
}
