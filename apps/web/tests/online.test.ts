// A device's line to its table comes back when it drops, and only the table
// turning it away ends it; the lists the table and the game share agree.

import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import type { TableSocket, TableSocketStatus } from "@fly/contracts";
import { CLOSE, PROTOCOL, TABLETOP_SCALE, TABLE_LIGHTS, TABLE_WEATHERS, createFlyState, decodeBites, readState } from "@fly/net";
import type { ClientMessage, ServerMessage } from "@fly/net";
import { WORLDS } from "@fly/world";
import { TableLine } from "../src/online/connection.ts";
import { APP_ROOMS, APP_SITE, inApp, invitedTo, inviteLink, roomsUrl } from "../src/online/invite.ts";
import { PLACES } from "../src/places/catalog.ts";
import { TOOLS } from "../src/tools/hands.ts";

beforeEach(() => {
  mock.method(performance, "now", () => 1000);
  mock.method(Math, "random", () => 0.5);
});
afterEach(() => mock.reset());

class FakeSocket implements TableSocket {
  status: TableSocketStatus = "connecting";
  closeCode = 0;
  closeReason = "";
  readonly sent: string[] = [];
  readonly binary: Uint8Array[] = [];
  readonly #inbox: string[] = [];
  send(data: string | Uint8Array) {
    if (typeof data === "string") this.sent.push(data);
    else this.binary.push(data.slice());
  }
  drain(text: (m: string) => void) {
    for (const m of this.#inbox.splice(0)) text(m);
  }
  close(code = 1000) {
    if (this.status === "closed") return;
    this.status = "closed";
    this.closeCode ||= code;
  }
  raw(text: string) {
    this.#inbox.push(text);
  }
  /** The room says something. */
  say(m: ServerMessage | null) {
    this.raw(JSON.stringify(m));
  }
  drop(code: number) {
    this.status = "closed";
    this.closeCode = code;
  }
}

const welcome = (now: number): ServerMessage => ({ type: "welcome", v: PROTOCOL, id: 2, colour: "#2fb8ff", starter: 1, seed: 1, now, wall: 0, offset: 0, place: "picnic", epoch: 0, world: { light: "clock", weather: "now" }, players: [], foods: [], balls: [], happenings: [], bubbles: [], at: [0, 0, 0], room: { name: "Flies", listed: false, locked: false } });

function line() {
  const sockets: FakeSocket[] = [];
  let at: [number, number, number] | undefined;
  const l = new TableLine(() => {
    const s = new FakeSocket();
    sockets.push(s);
    return s;
  }, "ws://test/rooms", () => ({ type: "hello", v: PROTOCOL, table: "abcdefghjk", key: "0123456789abcdef", at }));
  return { line: l, sockets, setAt: (spot: [number, number, number]) => (at = spot) };
}

test("the line says hello when it opens and is at the table once welcomed", () => {
  const { line: l, sockets } = line();
  l.update(0.016);
  assert.equal(sockets[0].sent.length, 0, "nothing before it is open");
  sockets[0].status = "open";
  l.update(0.016);
  const hello = JSON.parse(sockets[0].sent[0]) as ClientMessage;
  assert.equal(hello.type, "hello");
  sockets[0].say(welcome(5000));
  l.update(0.016);
  assert.equal(l.status, "joined");
});

test("a dropped line is opened again, later each time, and the hello says where the fly is now", () => {
  const { line: l, sockets, setAt } = line();
  sockets[0].status = "open";
  l.update(0.016);
  sockets[0].say(welcome(5000));
  l.update(0.016);
  sockets[0].drop(1006);
  l.update(0.016);
  assert.equal(l.status, "lost");
  setAt([12, -3, 1]);
  // Not at once: the first try waits about half a second.
  l.update(0.2);
  assert.equal(sockets.length, 1);
  for (let i = 0; i < 10; i++) l.update(0.1);
  assert.equal(sockets.length, 2, "opened again");
  sockets[1].status = "open";
  l.update(0.016);
  assert.deepEqual((JSON.parse(sockets[1].sent[0]) as Extract<ClientMessage, { type: "hello" }>).at, [12, -3, 1]);
  // Failing again, it waits longer.
  sockets[1].drop(1006);
  l.update(0.016);
  for (let i = 0; i < 7; i++) l.update(0.1);
  assert.equal(sockets.length, 2, "still waiting after 0.7 s");
  for (let i = 0; i < 10; i++) l.update(0.1);
  assert.equal(sockets.length, 3);
  assert.equal(l.reconnects, 2);
});

test("after a deploy restarts the server, devices come back within a second or two; shown again, a page tries at once", () => {
  const { line: l, sockets } = line();
  sockets[0].status = "open";
  l.update(0.016);
  sockets[0].say(welcome(5000));
  l.update(0.016);
  sockets[0].drop(CLOSE.restart);
  l.update(0.016);
  for (let i = 0; i < 16; i++) l.update(0.1);
  assert.equal(sockets.length, 2);
  sockets[1].drop(1006);
  l.update(0.016);
  l.hurry();
  l.update(0.016);
  assert.equal(sockets.length, 3);
});

test("the table turning the device away ends the line for good", () => {
  for (const reason of ["removed", "unknown", "full", "version", "elsewhere"] as const) {
    const { line: l, sockets } = line();
    sockets[0].status = "open";
    l.update(0.016);
    sockets[0].say({ type: "refused", reason });
    sockets[0].drop(CLOSE[reason]);
    l.update(0.016);
    for (let i = 0; i < 300; i++) l.update(0.1);
    assert.equal(l.status, "refused", reason);
    assert.equal(l.refusal, reason);
    assert.equal(sockets.length, 1, `${reason}: never opened again`);
  }
});

test("a message from the room out of shape is dropped before the game sees it, and the line carries on", () => {
  const { line: l, sockets } = line();
  const heard: ServerMessage[] = [];
  l.onMessage = (m) => heard.push(m);
  sockets[0].status = "open";
  l.update(0.016);
  const bad = [{ ...welcome(5000), players: "everyone" }, { ...welcome(5000), id: 1_000_000 }, { type: "joined", id: 1e6, colour: "#fff", away: false }, { type: "place", place: "lab", epoch: 1, foods: [], spots: null }];
  for (const m of bad) sockets[0].say(m as ServerMessage);
  l.update(0.016);
  assert.equal(l.status, "connecting", "no welcome taken from a broken one");
  assert.equal(heard.length, 0);
  sockets[0].say(welcome(5000));
  l.update(0.016);
  assert.equal(l.status, "joined");
  assert.deepEqual(heard.map((m) => m.type), ["welcome"]);
});

test("an invitation is the page's address with the table's code, and the room server is the site's own /rooms", () => {
  const link = inviteLink("https://flies.example/?rooms=ws://x/rooms#top", "abcdefghjk");
  assert.equal(link, "https://flies.example/?table=abcdefghjk");
  assert.equal(invitedTo(link), "abcdefghjk");
  assert.equal(invitedTo("https://flies.example/?table=nope"), null);
  assert.equal(roomsUrl("https://flies.example/?table=abcdefghjk"), "wss://flies.example/rooms");
  assert.equal(roomsUrl("http://localhost:5173/"), "ws://localhost:5173/rooms");
  assert.equal(roomsUrl("http://localhost:5173/?rooms=ws://127.0.0.1:9/rooms"), "ws://127.0.0.1:9/rooms");
});

test("the apps aren't at a site: their room server and the links they hand on are Flies' own", () => {
  // Built without ROOMS_URL or FLY_SITE_URL (the defines are absent under Node).
  assert.equal(APP_SITE, "https://flies.isaacthoman.com/");
  assert.equal(APP_ROOMS, "wss://flies.isaacthoman.com/rooms");
  assert.equal(inApp(true, "http://fly.local/"), true, "the Apple TV's host");
  assert.equal(inApp(false, "fly://app/index.html"), true, "the iPhone and iPad app's web view");
  assert.equal(inApp(false, "https://flies.example/"), false);
  assert.equal(roomsUrl("http://fly.local/", true), APP_ROOMS);
  assert.equal(roomsUrl("fly://app/index.html?table=abcdefghjk", true), APP_ROOMS);
  // A room server for development, named in the page's address (the TV's launch config, the phone's launch argument).
  assert.equal(roomsUrl("http://fly.local/?rooms=ws://127.0.0.1:8787/rooms", true), "ws://127.0.0.1:8787/rooms");
  assert.equal(inviteLink("fly://app/index.html?table=zzzzzzzzzz&rooms=ws://x/rooms", "abcdefghjk", true), "https://flies.isaacthoman.com/?table=abcdefghjk");
  assert.equal(inviteLink("http://fly.local/", "abcdefghjk", true), "https://flies.isaacthoman.com/?table=abcdefghjk");
});

test("the table knows every place, light and weather the game does, by the same names", () => {
  assert.deepEqual(Object.keys(WORLDS).sort(), PLACES.map((p) => p.id).sort());
  assert.deepEqual([...TABLE_LIGHTS], TOOLS.find((t) => t.id === "light")!.variants.map((v) => v.id));
  assert.deepEqual([...TABLE_WEATHERS], TOOLS.find((t) => t.id === "weather")!.variants.map((v) => v.id));
});


test("a non-message JSON value is ignored while the line can still be welcomed", () => {
  const { line: l, sockets } = line();
  sockets[0].status = "open";
  l.update(0);
  sockets[0].say(null);
  assert.doesNotThrow(() => l.update(0));
  assert.equal(l.status, "connecting");
  sockets[0].say(welcome(5000));
  l.update(0);
  assert.equal(l.status, "joined");
  l.leave();
});


test("only a joined line sends tools and binary state; an empty bite report sends nothing", (t) => {
  let now = 1000;
  t.mock.method(performance, "now", () => now);
  const { line: l, sockets } = line();
  const socket = sockets[0];
  const fly = createFlyState();
  fly.x = 12;
  const send = () => {
    l.send({ type: "world", light: "night" });
    l.sendFly(TABLETOP_SCALE, fly);
    l.sendBites(42, [{ food: 7, amount: 0.25 }], 1);
  };
  send();
  assert.deepEqual(socket.sent, []);
  assert.deepEqual(socket.binary, []);
  socket.status = "open";
  l.update(0);
  for (let i = 0; i < 4; i++) l.update(0.1);
  assert.equal(socket.sent.length, 1, "exactly one hello while waiting");
  socket.say(welcome(5000));
  now += 10;
  l.update(0);
  socket.sent.length = 0;
  send();
  assert.deepEqual(socket.sent.map((text) => JSON.parse(text)), [{ type: "world", light: "night" }]);
  assert.equal(socket.binary.length, 2);
  const back = createFlyState();
  const view = (data: Uint8Array) => new DataView(data.buffer, data.byteOffset, data.byteLength);
  assert.equal(readState(view(socket.binary[0]), 1, TABLETOP_SCALE, back), 33);
  assert.equal(back.x, 12);
  const bites: [number, number][] = [];
  assert.equal(decodeBites(view(socket.binary[1]), (id, amount) => bites.push([id, amount])), 42);
  assert.deepEqual(bites, [[7, 0.25]]);
  l.sendBites(43, [], 0);
  assert.equal(socket.binary.length, 2);
  l.leave();
  assert.equal(l.refusal, "left");
  const sent = socket.sent.length;
  send();
  l.update(60);
  assert.equal(socket.sent.length, sent);
  assert.equal(socket.binary.length, 2);
  assert.equal(sockets.length, 1);
});

test("an unwelcomed connection times out after ten game seconds, closes, and retries", (t) => {
  t.mock.method(Math, "random", () => 0.5);
  t.mock.method(performance, "now", () => 1000);
  const { line: l, sockets } = line();
  sockets[0].status = "open";
  l.update(0);
  l.update(10);
  assert.equal(sockets[0].status, "open");
  l.update(0.001);
  assert.equal(sockets[0].status, "closed");
  l.update(0.5);
  assert.equal(sockets.length, 2);
  l.leave();
});

test("a welcome from a restarted room replaces every sample from the previous room clock", (t) => {
  let now = 1000;
  t.mock.method(performance, "now", () => now);
  const { line: l, sockets } = line();
  sockets[0].status = "open";
  l.update(0);
  sockets[0].say(welcome(50000));
  l.update(0);
  assert.equal(l.clock.now(now), 50000);
  sockets[0].drop(CLOSE.restart);
  l.hurry();
  l.update(0);
  l.update(0);
  sockets[1].status = "open";
  now = 2000;
  l.update(0);
  sockets[1].say(welcome(100));
  l.update(0);
  assert.equal(l.clock.now(now), 100);
  l.leave();
});


test("a malformed clock message cannot welcome a line or poison an established room clock", () => {
  const { line: l, sockets } = line();
  const socket = sockets[0];
  socket.status = "open";
  l.update(0);
  const messages: ServerMessage[] = [];
  l.onMessage = (message) => messages.push(message);
  for (const now of [undefined, null, "5000"]) {
    socket.raw(JSON.stringify({ type: "welcome", now }));
    l.update(0);
    assert.equal(l.status, "connecting");
    assert.equal(l.clock.synced, false);
  }
  assert.deepEqual(messages, []);
  socket.say(welcome(5000));
  l.update(0);
  for (const pong of [{ type: "pong", t: 1000 }, { type: "pong", t: null, now: 0 }, { type: "pong", t: 1000, now: "0" }]) {
    socket.raw(JSON.stringify(pong));
    l.update(0);
    assert.equal(l.clock.now(1000), 5000);
  }
  assert.equal(messages.length, 1, "only the valid welcome reached the game");
  l.leave();
});

test("a joined line samples the clock frequently at first, then keeps resynchronizing once a second", (t) => {
  let now = 1000;
  t.mock.method(performance, "now", () => now);
  const { line: l, sockets } = line();
  const socket = sockets[0];
  socket.status = "open";
  l.update(0);
  now = 1020;
  socket.say(welcome(5000));
  l.update(0);
  const pings = () => socket.sent.map((text) => JSON.parse(text) as ClientMessage).filter((m) => m.type === "ping");
  assert.deepEqual(pings().map((m) => m.t), [1020]);
  for (const at of [1170, 1320, 1470, 1620, 1770, 2770]) {
    const count = pings().length;
    now = at - 1;
    l.update(0);
    assert.equal(pings().length, count, "no ping before its interval");
    now = at;
    l.update(0);
    assert.equal(pings().length, count + 1);
  }
  assert.deepEqual(pings().map((m) => m.t), [1020, 1170, 1320, 1470, 1620, 1770, 2770]);
  now = 2780;
  socket.say({ type: "pong", t: 2770, now: 9000 });
  l.update(0);
  assert.equal(l.clock.rtt, 10);
  assert.equal(l.clock.now(now), 9005, "the quicker round trip replaces the welcome's clock sample");
  l.leave();
});
