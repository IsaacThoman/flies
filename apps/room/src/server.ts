// The room server, for trying flies together on one machine: one picnic
// table, over WebSockets, with a little HTTP beside it for watching it and
// for spoiling the network on purpose.
//
//   npm run room [-- --port 8787 --rtt 150 --jitter 20 --loss 0.05 --stall 0.01 --immediate --seed 7 --light noon --weather clear]
//
//   --rtt, --jitter  ms added to every round trip (half each way), and spread at random over it
//   --loss           share of fly states dropped (as an unreliable channel would); everything else still arrives
//   --stall          share of messages held up 200 ms with all behind them (TCP retransmitting a lost packet)
//   --immediate      pass each fly's state on as it comes rather than in a batch every 50 ms
//
//   GET  /stats                 who is here, bytes and messages each way, what was refused, the food
//   POST /net?rtt=&jitter=&loss=&stall=   change the network's spoiling on the fly
//   POST /happen?kind=butterfly  a visitor now (gust, gull, leaf, butterfly, ladybird, juice, boat)
//   POST /world?light=noon&weather=clear
//
// A spike: nothing here is hardened for the open internet.

import http from "node:http";
import { performance } from "node:perf_hooks";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import { SEND_EVERY } from "@fly/net";
import { createPicnic } from "@fly/world";
import { HAPPENINGS } from "../../web/src/places/picnic/pace.ts";
import type { Happening } from "../../web/src/places/picnic/pace.ts";
import { forecastHours } from "../../web/src/scene/weather.ts";
import { Room } from "./room.ts";

export type Network = { rtt: number; jitter: number; loss: number; stall: number };

/** A lost TCP packet is resent after about this long, ms, and everything behind it waits. */
const RETRANSMIT = 200;

/** One direction of a connection, as a spoiled network carries it: late, uneven, now and then held up, and (for what may be lost) sometimes not at all. */
class Lane {
  #last = 0;
  #held = 0;
  readonly net: Network;
  readonly deliver: (data: string | Uint8Array) => void;
  constructor(net: Network, deliver: (data: string | Uint8Array) => void) {
    this.net = net;
    this.deliver = deliver;
  }

  carry(data: string | Uint8Array, reliable: boolean) {
    const net = this.net;
    if (!reliable && Math.random() < net.loss) return;
    const now = performance.now();
    if (Math.random() < net.stall) this.#held = Math.max(this.#held, now + RETRANSMIT);
    const delay = net.rtt / 2 + Math.random() * net.jitter;
    // A stream: nothing overtakes what was sent before it.
    const at = Math.max(this.#last, this.#held, now + delay);
    this.#last = at;
    if (at <= now + 0.5) {
      this.deliver(data);
      return;
    }
    // A copy: the room reuses its batch buffer.
    const copy = typeof data === "string" ? data : data.slice();
    setTimeout(() => this.deliver(copy), at - now);
  }
}

export function startRoom(options: { port: number; net: Network; seed: number; immediate: boolean; light?: string; weather?: string }) {
  const started = performance.now();
  const room = new Room({
    world: createPicnic(),
    seed: options.seed,
    now: () => performance.now() - started,
    hours: () => forecastHours(new Date()),
    immediate: options.immediate,
  });
  room.setWorld(options.light, options.weather);
  const net = options.net;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const reply = (body: unknown, status = 200) => {
      res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify(body));
    };
    if (url.pathname === "/stats") return reply({ now: room.now, net, ...room.stats() });
    if (url.pathname === "/net" && req.method === "POST") {
      for (const key of ["rtt", "jitter", "loss", "stall"] as const) {
        const v = url.searchParams.get(key);
        if (v !== null && Number.isFinite(Number(v))) net[key] = Number(v);
      }
      return reply(net);
    }
    if (url.pathname === "/happen" && req.method === "POST") {
      const kind = url.searchParams.get("kind") as Happening;
      if (!HAPPENINGS.includes(kind)) return reply({ error: "no such happening" }, 400);
      return reply(room.happen(kind));
    }
    if (url.pathname === "/world" && req.method === "POST") {
      room.setWorld(url.searchParams.get("light") ?? undefined, url.searchParams.get("weather") ?? undefined);
      return reply(room.world);
    }
    reply({ error: "not found" }, 404);
  });

  const wss = new WebSocketServer({ server });
  wss.on("connection", (socket: WebSocket) => {
    const out = new Lane(net, (data) => {
      if (socket.readyState === socket.OPEN) socket.send(data);
    });
    const player = room.join((data, reliable) => out.carry(data, reliable));
    if (!player) {
      socket.close(1013, "table full");
      return;
    }
    const inbound = new Lane(net, (data) => room.receive(player, data));
    socket.on("message", (data: Buffer, binary: boolean) => {
      // Fly states (binary, type 1) are what an unreliable channel would carry; bites (type 3) and JSON must arrive.
      if (binary) inbound.carry(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), data[0] !== 1);
      else inbound.carry(data.toString("utf8"), true);
    });
    socket.on("close", () => room.leave(player));
    socket.on("error", () => room.leave(player));
  });
  const tick = setInterval(() => room.tick(), SEND_EVERY);
  server.listen(options.port);
  return {
    room,
    server,
    close() {
      clearInterval(tick);
      for (const client of wss.clients) client.terminate();
      wss.close();
      server.close();
    },
  };
}

function arg(name: string, fallback: string) {
  const args = process.argv.slice(2);
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
}

if (import.meta.main) {
  const port = Number(arg("port", "8787"));
  const net: Network = { rtt: Number(arg("rtt", "0")), jitter: Number(arg("jitter", "0")), loss: Number(arg("loss", "0")), stall: Number(arg("stall", "0")) };
  const seed = Number(arg("seed", String((Math.random() * 0xffffffff) >>> 0)));
  const light = arg("light", "");
  const weather = arg("weather", "");
  startRoom({ port, net, seed, immediate: process.argv.includes("--immediate"), light: light || undefined, weather: weather || undefined });
  console.log(`room on ws://localhost:${port} (seed ${seed}; rtt ${net.rtt} ms, jitter ${net.jitter} ms, loss ${net.loss}, stall ${net.stall})`);
}
