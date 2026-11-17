// The Apple TV's line to its room: the host's socket (NativeSocketBridge),
// polled once a frame, against a fake host that behaves as the contract says.

import assert from "node:assert/strict";
import { test } from "node:test";
import { NATIVE_SOCKET_CLOSED, NATIVE_SOCKET_CONNECTING, NATIVE_SOCKET_OPEN } from "@fly/contracts";
import type { NativeSocketBridge } from "@fly/contracts";
import { CLOSE, FLIES, FLIES_MAX, PROTOCOL } from "@fly/net";
import type { ServerMessage } from "@fly/net";
import { TableLine } from "../src/online/connection.ts";
import { NATIVE_MESSAGE_BYTES, nativeSockets } from "../src/online/native-socket.ts";

type Line = { url: string; status: number; code: number; reason: string; inbox: (string | Uint8Array)[]; sent: (string | Uint8Array)[]; forgotten: boolean };

class FakeHost implements NativeSocketBridge {
  readonly lines = new Map<number, Line>();
  calls = 0;
  #next = 1;
  open(url: string) {
    this.calls++;
    const id = this.#next++;
    this.lines.set(id, { url, status: NATIVE_SOCKET_CONNECTING, code: 0, reason: "", inbox: [], sent: [], forgotten: false });
    return id;
  }
  status(id: number) {
    this.calls++;
    return this.lines.get(id)?.status ?? NATIVE_SOCKET_CLOSED;
  }
  closeCode(id: number) { return this.lines.get(id)?.code ?? 1006; }
  closeReason(id: number) { return this.lines.get(id)?.reason ?? ""; }
  send(id: number, data: string | ArrayBufferView) {
    const line = this.lines.get(id)!;
    assert.equal(line.status, NATIVE_SOCKET_OPEN, "sent only while open");
    line.sent.push(typeof data === "string" ? data : new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice());
  }
  next(id: number, into: ArrayBuffer) {
    this.calls++;
    const m = this.lines.get(id)?.inbox.shift();
    if (m === undefined) return 0;
    if (typeof m === "string") return m;
    new Uint8Array(into).set(m);
    return m.byteLength;
  }
  close(id: number, code: number, reason: string) {
    const line = this.lines.get(id)!;
    if (line.status !== NATIVE_SOCKET_CLOSED) Object.assign(line, { status: NATIVE_SOCKET_CLOSED, code, reason });
    line.forgotten = true;
  }
  line(i: number) { return [...this.lines.values()][i]; }
}

const flies = (n: number) => new Uint8Array([FLIES, n, ...new Array(n * 33).fill(7)]);

test("messages arrive in order, binary ones as views of one buffer made once", () => {
  const host = new FakeHost();
  const open = nativeSockets(host);
  const socket = open("wss://flies.example/rooms");
  assert.equal(host.line(0).url, "wss://flies.example/rooms");
  assert.equal(socket.status, "connecting");
  host.line(0).status = NATIVE_SOCKET_OPEN;
  host.line(0).inbox.push("first", flies(1), "last");
  const seen: unknown[] = [];
  const views = new Set<ArrayBufferLike>();
  socket.drain((t) => seen.push(t), (v) => { seen.push([v.getUint8(0), v.byteLength]); views.add(v.buffer); });
  assert.deepEqual(seen, ["first", [FLIES, 35], "last"]);
  assert.equal(socket.status, "open");
  // A thousand frames of the same traffic: the same buffer, and as many views as lengths seen.
  const lengths = new Set<DataView>();
  for (let i = 0; i < 1000; i++) {
    host.line(0).inbox.push(flies(1 + (i % 7)));
    socket.drain(() => {}, (v) => { views.add(v.buffer); lengths.add(v); });
  }
  assert.equal(views.size, 1);
  assert.equal(lengths.size, 7);
  // A line opened again shares the buffer.
  const again = open("wss://flies.example/rooms");
  host.line(1).status = NATIVE_SOCKET_OPEN;
  host.line(1).inbox.push(flies(2));
  again.drain(() => {}, (v) => views.add(v.buffer));
  assert.equal(views.size, 1);
  assert.ok(NATIVE_MESSAGE_BYTES >= 4096);
});

test("a binary message longer than any batch the room sends is dropped, and no view is kept for its length", () => {
  const host = new FakeHost();
  const socket = nativeSockets(host)("ws://x/rooms");
  host.line(0).status = NATIVE_SOCKET_OPEN;
  const lengths = new Set<number>();
  for (let n = FLIES_MAX + 1; n < FLIES_MAX + 2000; n++) host.line(0).inbox.push(new Uint8Array(n).fill(FLIES));
  host.line(0).inbox.push(flies(1));
  socket.drain(() => {}, (v) => lengths.add(v.byteLength));
  assert.deepEqual([...lengths], [35]);
});

test("a frame with nothing new asks the host twice: one look at the inbox, one at the line", () => {
  const host = new FakeHost();
  const socket = nativeSockets(host)("ws://x/rooms");
  host.line(0).status = NATIVE_SOCKET_OPEN;
  socket.drain(() => {}, () => {});
  host.calls = 0;
  socket.drain(() => {}, () => {});
  assert.equal(host.calls, 2);
});

test("what came before a close is handed on, then the close's code and reason", () => {
  const host = new FakeHost();
  const socket = nativeSockets(host)("ws://x/rooms");
  Object.assign(host.line(0), { status: NATIVE_SOCKET_CLOSED, code: CLOSE.removed, reason: "removed" });
  host.line(0).inbox.push(JSON.stringify({ type: "refused", reason: "removed" }));
  const texts: string[] = [];
  socket.drain((t) => texts.push(t), () => {});
  assert.equal(texts.length, 1);
  assert.equal(socket.status, "closed");
  assert.equal(socket.closeCode, CLOSE.removed);
  assert.equal(socket.closeReason, "removed");
  socket.close();
  assert.equal(host.line(0).forgotten, true);
  assert.equal(socket.closeCode, CLOSE.removed, "closing a closed line keeps why it closed");
  socket.drain(() => assert.fail("nothing after it is forgotten"), () => {});
});

test("sending waits for the line to open; the game's own close is its code and frees the host's line", () => {
  const host = new FakeHost();
  const socket = nativeSockets(host)("ws://x/rooms");
  socket.send("early");
  assert.equal(host.line(0).sent.length, 0);
  host.line(0).status = NATIVE_SOCKET_OPEN;
  socket.drain(() => {}, () => {});
  const bytes = new Uint8Array([1, 2, 3, 4]);
  socket.send("hello");
  socket.send(bytes.subarray(1, 3));
  assert.deepEqual(host.line(0).sent, ["hello", new Uint8Array([2, 3])]);
  socket.close(1000, "bye");
  assert.equal(socket.status, "closed");
  assert.equal(host.line(0).code, 1000);
  assert.equal(host.line(0).forgotten, true);
  socket.send("late");
  assert.equal(host.line(0).sent.length, 2);
});

test("a table's line over the host's socket: hello, welcome, a drop while the app was away, and back", () => {
  const host = new FakeHost();
  const line = new TableLine(nativeSockets(host), "wss://flies.example/rooms", () => ({ type: "hello", v: 2, table: "abcdefghjk", key: "k" }));
  host.line(0).status = NATIVE_SOCKET_OPEN;
  line.update(0.016);
  assert.equal(JSON.parse(host.line(0).sent[0] as string).type, "hello");
  const welcome: ServerMessage = { type: "welcome", v: PROTOCOL, id: 1, colour: "#fff", flies: [{ id: 1, colour: "#fff", at: [0, 0, 0, 0] }], starter: 1, seed: 1, now: 1000, wall: 0, offset: 0, place: "picnic", epoch: 0, world: { light: "clock", weather: "now" }, players: [], foods: [], balls: [], happenings: [], bubbles: [], at: [0, 0, 0, 0], room: { name: "Flies", listed: false, locked: false } };
  host.line(0).inbox.push(JSON.stringify(welcome), flies(2));
  let heard = 0;
  line.onFlies = () => heard++;
  line.update(0.016);
  assert.equal(line.status, "joined");
  assert.equal(heard, 1);
  // The app went to the background: the host closed every line with 1001.
  Object.assign(host.line(0), { status: NATIVE_SOCKET_CLOSED, code: 1001, reason: "" });
  line.update(0.016);
  assert.equal(line.status, "lost");
  assert.equal(host.line(0).forgotten, true);
  // Shown again: the page hurries the line back rather than waiting out its retry.
  line.hurry();
  line.update(0.016);
  assert.equal(host.lines.size, 2);
  host.line(1).status = NATIVE_SOCKET_OPEN;
  line.update(0.016);
  assert.equal(JSON.parse(host.line(1).sent[0] as string).type, "hello");
});

test("a host that can't open the URL gives a closed line, and the table tries again later", () => {
  const host = new FakeHost();
  const line = new TableLine(nativeSockets(host), "wss://nowhere.example/rooms", () => ({ type: "hello", v: 2, table: "abcdefghjk", key: "k" }));
  Object.assign(host.line(0), { status: NATIVE_SOCKET_CLOSED, code: 1006, reason: "" });
  line.update(0.016);
  assert.equal(line.status, "connecting");
  assert.equal(line.refusal, null);
  for (let i = 0; i < 10; i++) line.update(0.1);
  assert.equal(host.lines.size, 2);
});

test("shown again before the frame that sees the host's close: the line opens again at once, not after its retry", () => {
  const host = new FakeHost();
  const line = new TableLine(nativeSockets(host), "wss://flies.example/rooms", () => ({ type: "hello", v: 2, table: "abcdefghjk", key: "k" }));
  host.line(0).status = NATIVE_SOCKET_OPEN;
  line.update(0.016);
  // Closed in the background, with no frame since; the page is shown, then its first frame comes.
  Object.assign(host.line(0), { status: NATIVE_SOCKET_CLOSED, code: 1001, reason: "" });
  line.hurry();
  line.update(0.016);
  line.update(0.016);
  assert.equal(host.lines.size, 2, "a new line on the next frame");
  // Hurried once only: the next drop waits its turn.
  Object.assign(host.line(1), { status: NATIVE_SOCKET_CLOSED, code: 1006, reason: "" });
  line.update(0.016);
  line.update(0.016);
  assert.equal(host.lines.size, 2);
});
