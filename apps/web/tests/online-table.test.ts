// This device at a table, as Online keeps it: the flies the table seats it
// (welcome and seated), asking for another count until the table answers,
// where its flies stand when the line comes back, and never taking one of
// its own flies for another player's.

import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import type { BrainDriver, TableSocket, TableSocketStatus } from "@fly/contracts";
import { PROTOCOL } from "@fly/net";
import type { ClientMessage, PlayerWire, SeatedFly, ServerMessage, Spot } from "@fly/net";
import { World, WORLDS } from "@fly/world";
import { Company } from "../src/company.ts";
import { Life } from "../src/life.ts";
import { Online } from "../src/online/online.ts";
import type { TableHost } from "../src/online/online.ts";

const gradient = { addColorStop() {} };
const context = new Proxy({}, { get: () => () => gradient });
(globalThis as { document?: unknown }).document = { createElement: () => ({ getContext: () => context }) };
(globalThis as { Path2D?: unknown }).Path2D = class { addPath() {} moveTo() {} bezierCurveTo() {} quadraticCurveTo() {} closePath() {} };

class FakeSocket implements TableSocket {
  status: TableSocketStatus = "open";
  closeCode = 0;
  closeReason = "";
  readonly sent: ClientMessage[] = [];
  readonly #inbox: string[] = [];
  send(data: string | Uint8Array) {
    if (typeof data === "string") this.sent.push(JSON.parse(data) as ClientMessage);
  }
  drain(text: (m: string) => void) {
    for (const m of this.#inbox.splice(0)) text(m);
  }
  close(code = 1000) {
    if (this.status === "closed") return;
    this.status = "closed";
    this.closeCode ||= code;
  }
  say(m: ServerMessage) {
    this.#inbox.push(JSON.stringify(m));
  }
  /** What this device asked the table, by type. */
  of<T extends ClientMessage["type"]>(type: T) {
    return this.sent.filter((m): m is Extract<ClientMessage, { type: T }> => m.type === type);
  }
}

const brain = (): BrainDriver => ({ status: "running", error: null, neurons: 0, connections: 0, eyes: null, regionRates: new Float32Array(), state: null, stateAt: 0, tick() {}, dispose() {} });

/** Another player's fly in a welcome or a join. */
const player = (id: number, of: number, away = false): PlayerWire => ({ id, colour: "#2fb8ff", away, of });

function table() {
  const world = new World(WORLDS.picnic);
  const life = new Life(world, brain());
  const company = new Company(world, brain);
  const sockets: FakeSocket[] = [];
  const seatedWith: (readonly SeatedFly[])[] = [];
  let flies = 1;
  const others = {
    list: [] as { id: number; of: number; colour: string; away: boolean }[],
    join(id: number, colour: string, away: boolean, of: number) {
      this.list.push({ id, colour, away, of });
    },
    leave(id: number) {
      this.list = this.list.filter((o) => o.id !== id);
    },
    get(id: number) {
      return this.list.find((o) => o.id === id);
    },
    forget() {},
    heard() {},
    clear() {
      this.list.length = 0;
    },
  };
  const host = {
    scene: new THREE.Scene(),
    stage: { weather: { rain: 0 }, set: {} },
    life,
    company,
    others,
    hands: { variants: [] as number[] },
    fly: {},
    eyes: { see() {} },
    bubbles: { table: null },
    felt: { air: { x: 0, y: 0, z: 0 }, touch: 0, looming: [] },
    flies: () => flies,
    // As the game does: the company becomes as many as are seated after the first, each with its id.
    seat(seated: readonly SeatedFly[]) {
      seatedWith.push(seated);
      company.resize(seated.length - 1, life.pantry);
      for (let i = 0; i < company.list.length; i++) company.list[i].id = seated[i + 1].id;
    },
    share() {},
    here: () => "picnic" as const,
    moving: () => false,
    moveTo() {},
    onWorld() {},
  } as unknown as TableHost;
  const online = new Online(host, () => {
    const s = new FakeSocket();
    sockets.push(s);
    return s;
  }, "ws://test/rooms", "abcdefghjk", "0123456789abcdef", null);
  const socket = () => sockets[sockets.length - 1];
  /** A frame of the line: what has come is read, and the hello said if the line has just opened. */
  const frame = (dt = 0.016) => online.line.update(dt);
  const welcome = (mine: SeatedFly[], players: PlayerWire[] = [], epoch = 0): ServerMessage => ({
    type: "welcome", v: PROTOCOL, id: mine[0].id, colour: mine[0].colour, flies: mine, starter: 0, seed: 1, now: 5000, wall: 0, offset: 0, place: "picnic", epoch,
    world: { light: "clock", weather: "now" }, players, foods: [], balls: [], happenings: [], bubbles: [], at: mine[0].at, room: { name: "Flies", listed: false, locked: false },
  });
  return { online, life, company, others, sockets, socket, frame, welcome, seatedWith, setFlies: (n: number) => (flies = n) };
}

const fly = (id: number, at: Spot): SeatedFly => ({ id, colour: `#${id}${id}${id}`, at });

test("welcomed, this device's flies are the ones the table seated, each standing where the table set it down", () => {
  const t = table();
  t.setFlies(3);
  t.frame();
  const hello = t.socket().of("hello")[0];
  assert.equal(hello.flies, 3);
  assert.equal(hello.at, undefined, "the first time, the table says where they stand");
  t.socket().say(t.welcome([fly(2, [10, 20, 0.5]), fly(5, [-30, 40, 1]), fly(6, [50, -60, 2])]));
  t.frame();
  assert.equal(t.online.asked, 3);
  assert.deepEqual(t.online.mine.map((f) => f.id), [2, 5, 6]);
  assert.deepEqual(t.company.list.map((c) => c.id), [5, 6]);
  const where = [t.life, ...t.company.list.map((c) => c.life)].map((l) => [l.body.position.x, l.body.position.z, l.body.yaw]);
  assert.deepEqual(where, [[10, 20, 0.5], [-30, 40, 1], [50, -60, 2]]);
});

test("a count asked for is asked once until the table answers; seated is the answer, and its new flies stand where the table set them", () => {
  const t = table();
  t.frame();
  t.socket().say(t.welcome([fly(1, [0, 0, 0])]));
  t.frame();
  t.online.recount(1, 0);
  assert.deepEqual(t.socket().of("flies"), [], "nothing to ask: one is what it has");
  t.online.recount(3, 0);
  t.online.recount(3, 100);
  t.online.recount(3, 500);
  assert.deepEqual(t.socket().of("flies"), [{ type: "flies", count: 3 }]);
  assert.equal(t.online.asked, 1, "not counted as asked until it is answered");
  t.socket().say({ type: "seated", flies: [fly(1, [0, 0, 0]), fly(3, [70, 80, 0.25]), fly(4, [-70, 80, 0.75])], asked: 3 });
  t.frame();
  assert.equal(t.online.asked, 3);
  assert.deepEqual(t.online.mine.map((f) => f.id), [1, 3, 4]);
  assert.deepEqual(t.company.list.map((c) => [c.id, c.life.body.position.x, c.life.body.position.z]), [[3, 70, 80], [4, -70, 80]]);
  t.online.recount(3, 60_000);
  assert.equal(t.socket().of("flies").length, 1, "answered: not asked again");
  // Fewer seats than asked for is an answer too: it is not asked again by itself.
  t.online.recount(4, 61_000);
  t.socket().say({ type: "seated", flies: [fly(1, [0, 0, 0]), fly(3, [70, 80, 0.25]), fly(4, [-70, 80, 0.75])], asked: 4 });
  t.frame();
  for (let ms = 62_000; ms < 200_000; ms += 1000) t.online.recount(4, ms);
  assert.deepEqual(t.socket().of("flies").map((m) => m.count), [3, 4]);
  assert.equal(t.online.asked, 4);
});

test("a count the room drops is asked again, later each time, a few times; then only once the player changes it", () => {
  const t = table();
  t.frame();
  t.socket().say(t.welcome([fly(1, [0, 0, 0])]));
  t.frame();
  const at: number[] = [];
  for (let ms = 0; ms <= 120_000; ms += 100) {
    const before = t.socket().of("flies").length;
    t.online.recount(4, ms);
    if (t.socket().of("flies").length > before) at.push(ms);
  }
  assert.deepEqual(at, [0, 1000, 3000, 7000, 15_000]);
  assert.equal(t.online.asked, 1, "never answered: the table still has one");
  t.online.recount(2, 120_100);
  t.online.recount(4, 120_200);
  t.online.recount(4, 121_200);
  assert.deepEqual(t.socket().of("flies").map((m) => m.count).slice(5), [2, 4], "a new count is asked, and the old one again after it");
});

test("a count changed while one is unanswered waits for the answer, then asks the newest", () => {
  const t = table();
  t.frame();
  t.socket().say(t.welcome([fly(1, [0, 0, 0])]));
  t.frame();
  t.online.recount(4, 0);
  t.online.recount(2, 10);
  t.online.recount(3, 20);
  assert.deepEqual(t.socket().of("flies").map((m) => m.count), [4]);
  t.socket().say({ type: "seated", flies: [fly(1, [0, 0, 0]), fly(2, [1, 1, 0]), fly(3, [2, 2, 0]), fly(4, [3, 3, 0])], asked: 4 });
  t.frame();
  t.online.recount(3, 30);
  assert.deepEqual(t.socket().of("flies").map((m) => m.count), [4, 3]);
  // A late answer to an older count doesn't settle the newer one.
  t.socket().say({ type: "seated", flies: [fly(1, [0, 0, 0]), fly(2, [1, 1, 0]), fly(3, [2, 2, 0]), fly(4, [3, 3, 0])], asked: 4 });
  t.frame();
  t.online.recount(3, 1030);
  assert.deepEqual(t.socket().of("flies").map((m) => m.count), [4, 3, 3]);
});

test("coming back after the line dropped, the hello says where each fly stands, and only one the table has elsewhere is moved", () => {
  const t = table();
  t.setFlies(2);
  t.frame();
  t.socket().say(t.welcome([fly(1, [0, 0, 0]), fly(4, [30, 30, 0])]));
  t.frame();
  const companion = t.company.list[0].life;
  t.life.setDown(12, -8, 1.5);
  companion.setDown(-40, 25, 0.5);
  const height = (l: Life) => l.body.position.y;
  t.socket().close(1006);
  t.frame();
  for (let i = 0; i < 200 && t.sockets.length < 2; i++) t.frame(0.1);
  t.frame();
  const hello = t.socket().of("hello")[0];
  assert.deepEqual(hello.at, [[12, -8, 1.5, height(t.life)], [-40, 25, 0.5, height(companion)]]);
  assert.equal(hello.epoch, 0);
  assert.equal(hello.flies, 2);
  // The table had the first where it stands, and the second somewhere else (it walked too far while the line was down).
  t.socket().say(t.welcome([fly(1, [12, -8, 1.5, height(t.life)]), fly(4, [60, 70, 2])]));
  t.frame();
  assert.deepEqual([t.life.body.position.x, t.life.body.position.z, t.life.body.yaw], [12, -8, 1.5]);
  assert.deepEqual([companion.body.position.x, companion.body.position.z, companion.body.yaw], [60, 70, 2]);
  assert.equal(t.company.list[0].life, companion, "the same fly, carried on");
});

test("this device's own flies are never taken for another player's, from the welcome or a join", () => {
  const t = table();
  t.setFlies(2);
  t.frame();
  // The welcome lists the other devices' flies; here one of its own is among them too, as a stale join might have it.
  t.socket().say(t.welcome([fly(3, [0, 0, 0]), fly(6, [1, 1, 0])], [player(1, 1), player(2, 1), player(6, 3)]));
  t.frame();
  assert.deepEqual(t.others.list.map((o) => [o.id, o.of]), [[1, 1], [2, 1]]);
  t.socket().say({ type: "joined", ...player(7, 3) });
  t.socket().say({ type: "joined", ...player(6, 6) });
  t.socket().say({ type: "joined", ...player(8, 8) });
  t.frame();
  assert.deepEqual(t.others.list.map((o) => o.id), [1, 2, 8]);
  t.online.remove(6);
  t.online.remove(3);
  assert.deepEqual(t.socket().of("remove"), [], "not its own, nor is it the starter");
});

test("a fly heard of as another device's than before (its seats given up and taken while the line was down) is that device's, not the one before's", () => {
  const t = table();
  t.frame();
  t.socket().say(t.welcome([fly(1, [0, 0, 0])], [player(2, 2), player(3, 2)]));
  t.frame();
  t.socket().close(1006);
  t.frame();
  for (let i = 0; i < 200 && t.sockets.length < 2; i++) t.frame(0.1);
  t.frame();
  t.socket().say(t.welcome([fly(1, [0, 0, 0])], [player(2, 5), player(5, 5)]));
  t.frame();
  assert.deepEqual(t.others.list.map((o) => [o.id, o.of]), [[2, 5], [5, 5]]);
});

test("the other devices, as the screens have them, are the same while their flies are and another once their seats are someone else's", async () => {
  const { devicesOf } = await import("../src/online/others.ts");
  const known = new WeakMap();
  const other = (id: number, of: number) => ({ id, of, colour: `c${id}` }) as unknown as import("../src/online/others.ts").Other;
  const [a1, a2, b2] = [other(2, 2), other(3, 2), other(4, 4)];
  const first = devicesOf([a1, a2, b2], known);
  assert.deepEqual(first.map((d) => [d.id, d.colours]), [[2, ["c2", "c3"]], [4, ["c4"]]]);
  // A recount: the same device, with a fly more, and the same object.
  const again = devicesOf([a1, a2, b2, other(5, 2)], known);
  assert.equal(again[0], first[0]);
  assert.deepEqual(again[0].colours, ["c2", "c3", "c5"]);
  assert.equal(again[1], first[1]);
  // The first device left and another sat down in its seats: heard of anew, it is another device.
  const reclaimed = devicesOf([b2, other(2, 2), other(3, 2)], known);
  assert.equal(reclaimed[0], first[1]);
  assert.notEqual(reclaimed[1], first[0]);
  assert.deepEqual(reclaimed[1].id, 2);
});
