// The store capture's fixed-clock room stays in Node, just like production.
import { Table } from "../apps/server/src/table.ts";
import type { Link, Seat } from "../apps/server/src/table.ts";
import type { ClientMessage, TableStart } from "@fly/net";
import type { StoreRoomRequest, StoreRoomReply, StoreWire } from "../apps/web/src/store-art.ts";

export function storeRoom() {
  let now = 0;
  const wall = Date.parse("2026-06-21T08:00:00Z");
  const clock = { now: () => now, wall: () => wall };
  let table: Table;
  const clients = new Map<string, { seat: Seat | null; link: Link; packets: StoreWire[]; closed?: { code: number; reason: string } }>();
  return (request: StoreRoomRequest): StoreRoomReply => {
    if (request.kind === "start") {
      const start: TableStart = { place: "picnic", light: "morning", weather: "clear", zone: "UTC", offset: 0 };
      table = new Table("abcd1234", start, "capture-0", 61, clock);
      const record = table.record();
      record.seats = request.seats.map((at, i) => ({ id: i + 1, key: `capture-${i}`, at, airborne: false, lastSeen: wall }));
      table = Table.restore(record, clock);
      return {};
    }
    now = request.now;
    for (const { key, data } of request.outgoing) {
      let client = clients.get(key);
      if (!client) {
        const packets: StoreWire[] = [];
        const link: Link = {
          send: data => packets.push(typeof data === "string" ? data : Array.from(data)),
          close: (code, reason) => { clients.get(key)!.closed = { code, reason }; },
        };
        client = { seat: null, link, packets };
        clients.set(key, client);
      }
      if (client.seat) table.receive(client.seat, typeof data === "string" ? data : new Uint8Array(data));
      else {
        const hello = JSON.parse(data as string) as Extract<ClientMessage, { type: "hello" }>;
        const seat = table.hello(client.link, key, hello);
        if (typeof seat === "string") throw new Error(seat);
        client.seat = seat;
      }
    }
    table.tick();
    return Object.fromEntries([...clients].map(([key, client]) => [key, { packets: client.packets.splice(0), closed: client.closed }]));
  };
}
