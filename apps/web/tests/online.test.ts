// A device's line to its table comes back when it drops, and only the table
// turning it away ends it; the lists the table and the game share agree.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { TableSocket, TableSocketStatus } from "@fly/contracts";
import { CLOSE, PROTOCOL, TABLE_LIGHTS, TABLE_WEATHERS } from "@fly/net";
import type { ClientMessage, ServerMessage } from "@fly/net";
import { WORLDS } from "@fly/world";
import { TableLine } from "../src/online/connection.ts";
import { APP_ROOMS, APP_SITE, inApp, invitedTo, inviteLink, roomsUrl } from "../src/online/invite.ts";
import { PLACES } from "../src/places/catalog.ts";
import { TOOLS } from "../src/tools/hands.ts";

class FakeSocket implements TableSocket {
  status: TableSocketStatus = "connecting";
  closeCode = 0;
  closeReason = "";
  readonly sent: string[] = [];
  readonly #inbox: string[] = [];
  send(data: string | Uint8Array) {
    if (typeof data === "string") this.sent.push(data);
  }
  drain(text: (m: string) => void) {
    for (const m of this.#inbox.splice(0)) text(m);
  }
  close(code = 1000) {
    if (this.status === "closed") return;
    this.status = "closed";
    this.closeCode ||= code;
  }
  /** The room says something. */
  say(m: ServerMessage) {
    this.#inbox.push(JSON.stringify(m));
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
