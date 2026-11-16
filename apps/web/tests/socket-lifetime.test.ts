import assert from "node:assert/strict";
import { test } from "node:test";
import { BrowserSocket, BUFFERED_BYTES, INBOX_MESSAGES } from "../src/online/socket.ts";
import { TableLine } from "../src/online/connection.ts";
import { PROTOCOL } from "@fly/net";

class Wire {
  static OPEN = 1;
  static readonly all: Wire[] = [];
  readyState = 0;
  bufferedAmount = 0;
  sent = 0;
  readonly closes: { code: number; reason: string }[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string | ArrayBuffer }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  constructor() { Wire.all.push(this); }
  open() { this.readyState = 1; this.onopen?.(); }
  message(data: string | ArrayBuffer) { this.onmessage?.({ data }); }
  send(data: string | Uint8Array) { this.sent++; this.bufferedAmount += typeof data === "string" ? data.length : data.byteLength; }
  close(code = 1000, reason = "") { this.closes.push({ code, reason }); this.readyState = 3; }
  ended(code: number, reason: string) { this.readyState = 3; this.onclose?.({ code, reason }); }
}
(globalThis as unknown as { WebSocket: unknown }).WebSocket = Wire;
function open() {
  const socket = new BrowserSocket("ws://local/rooms");
  const wire = Wire.all.at(-1)!;
  wire.open();
  return { socket, wire };
}

test("normal messages preserve order and each drain returns the inbox's capacity", () => {
  const { socket, wire } = open();
  const out: (string | number)[] = [];
  const data = new Uint8Array([2]).buffer;
  wire.message("first"); wire.message(data); wire.message("last");
  socket.drain((s) => out.push(s), (v) => out.push(v.getUint8(0)));
  assert.deepEqual(out, ["first", 2, "last"]);
  for (let i = 0; i < 1000; i++) { wire.message("x".repeat(4096)); socket.drain(() => {}, () => {}); }
  assert.equal(socket.status, "open");
  assert.equal(wire.closes.length, 0);
});

test("an hour of unread room frames closes once, drops stale traffic, and keeps no replay", () => {
  const { socket, wire } = open();
  for (let i = 0; i < INBOX_MESSAGES; i++) wire.message(new ArrayBuffer(340));
  assert.equal(socket.status, "open");
  for (let i = INBOX_MESSAGES; i < 72_000; i++) wire.message(new ArrayBuffer(340));
  assert.equal(socket.status, "closed");
  assert.equal(wire.closes.length, 1);
  let read = 0;
  socket.drain(() => read++, () => read++);
  assert.equal(read, 0);
});

for (const data of [new ArrayBuffer(BUFFERED_BYTES + 1), "x".repeat(BUFFERED_BYTES)]) {
  test(`an oversized ${typeof data === "string" ? "text" : "binary"} message cannot bypass the byte budget`, () => {
    const { socket, wire } = open();
    wire.message(data);
    assert.equal(socket.status, "closed");
    let read = 0;
    socket.drain(() => read++, () => read++);
    assert.equal(read, 0);
  });
}

test("a stalled writer stops adding traffic at its byte budget", () => {
  const { socket, wire } = open();
  for (let i = 0; i < 72_000; i++) socket.send(new Uint8Array(47));
  assert.ok(wire.bufferedAmount <= BUFFERED_BYTES);
  assert.equal(wire.closes.length, 1);
  assert.equal(socket.status, "closed");
});

test("a room's refusal queued before closing still reaches its reader", () => {
  const { socket, wire } = open();
  wire.message('{"type":"refused","reason":"removed"}');
  wire.ended(4001, "removed");
  const out: string[] = [];
  socket.drain((s) => out.push(s), () => {});
  assert.equal(JSON.parse(out[0]).reason, "removed");
  assert.equal(socket.closeCode, 4001);
});

test("overflow is a recoverable dropped line and a new welcome restores the table", () => {
  const line = new TableLine(() => new BrowserSocket("ws://local/rooms"), "ws://local/rooms", () => ({ type: "hello", v: PROTOCOL, table: "abcde23456", key: "device" }));
  const first = Wire.all.at(-1)!; first.open(); line.update(0);
  first.message('{"type":"welcome","now":0}'); line.update(0);
  assert.equal(line.status, "joined");
  for (let i = 0; i <= INBOX_MESSAGES; i++) first.message(new ArrayBuffer(340));
  line.update(0);
  assert.equal(line.status, "lost");
  line.hurry(); line.update(0);
  const second = Wire.all.at(-1)!;
  assert.notEqual(second, first);
  second.open(); line.update(0);
  second.message('{"type":"welcome","now":0}'); line.update(0);
  assert.equal(line.status, "joined");
  assert.equal(line.reconnects, 1);
  line.leave();
});
