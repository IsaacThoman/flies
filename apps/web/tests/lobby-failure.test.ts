import assert from "node:assert/strict";
import { test } from "node:test";
import type { TableSocket, TableSocketStatus } from "@fly/contracts";
import { Lobby } from "../src/online/lobby.ts";

class Socket implements TableSocket {
  status: TableSocketStatus = "connecting";
  closeCode = 0;
  closeReason = "";
  inbox: string[] = [];
  send() {}
  drain(text: (message: string) => void) { for (const m of this.inbox.splice(0)) text(m); }
  close() { this.status = "closed"; }
}

for (const state of ["connecting", "open"] as const) test(`a socket stuck ${state} fails within 10s and recovers`, () => {
  const sockets: Socket[] = [];
  const lobby = new Lobby(() => { const s = new Socket(); s.status = state; sockets.push(s); return s; }, "ws://test");
  for (let i = 0; i < 101; i++) lobby.update(0.1);
  assert.equal(lobby.status, "lost");
  for (let i = 0; i < 10; i++) lobby.update(0.1);
  const latest = sockets.at(-1)!;
  latest.status = "open";
  latest.inbox.push(JSON.stringify({ type: "rooms", rooms: [] }));
  lobby.update(0.01);
  assert.equal(lobby.status, "open");
  assert.deepEqual(lobby.rooms, []);
  lobby.close();
});

test("a stale room list is marked stale and a fresh response clears it", () => {
  const sockets: Socket[] = [];
  const lobby = new Lobby(() => { const s = new Socket(); sockets.push(s); return s; }, "ws://test");
  const s = sockets[0];
  s.status = "open";
  s.inbox.push(JSON.stringify({ type: "rooms", rooms: [] }));
  lobby.update(0.01);
  assert.equal(lobby.status, "open");
  for (let i = 0; i < 411; i++) lobby.update(0.1);
  assert.equal(lobby.status, "stale");
  lobby.update(1);
  sockets.at(-1)!.status = "open";
  sockets.at(-1)!.inbox.push(JSON.stringify({ type: "rooms", rooms: [] }));
  lobby.update(0.01);
  assert.equal(lobby.status, "open");
  lobby.close();
});

test("a version refusal is surfaced even before the close arrives", () => {
  const s = new Socket();
  s.status = "open";
  const lobby = new Lobby(() => s, "ws://test");
  s.inbox.push(JSON.stringify({ type: "refused", reason: "version" }));
  lobby.update(0.01);
  assert.equal(lobby.status, "version");
  assert.equal(s.status, "closed");
});
