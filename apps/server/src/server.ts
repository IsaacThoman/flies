// The room server: tables of people's flies, over WebSockets at /rooms, and
// a health check at /health. One Node process; it runs no brains and draws
// nothing. A connection either sits at one table (its first message is a
// hello) or browses the listed rooms (a browse), and is told of them as
// they change. Behind the site's web server in production (docs/online.md), on
// its own for development:
//
//   npm run rooms          ws://localhost:8787/rooms (the dev server proxies /rooms to it)
//
// Set by the environment:
//   PORT          where it listens (8787)
//   HOST          the address it listens on (0.0.0.0)
//   DATA_DIR      where the tables are kept across restarts (none: they last as long as the process)
//   TRUST_PROXY   1 behind a proxy that sets X-Forwarded-For (the site's web server), for counting connections by address:
//                 believed only from a loopback or private address, the proxy's own
//
// A deploy stops it with SIGTERM: it keeps the tables, tells every device it
// is restarting (close code 1012), and the devices come back to their tables
// when it is up again.

import { createHash, randomInt } from "node:crypto";
import http from "node:http";
import type { IncomingMessage } from "node:http";
import { isIP } from "node:net";
import type { Duplex } from "node:stream";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import { CLOSE, PROTOCOL, ROOMS_PATH, ROOM_LIMITS, Rate, SEND_EVERY, isPassword, isTableCode, roomName } from "@fly/net";
import type { ClientMessage, Refusal, ServerMessage, TableStart } from "@fly/net";
import { lock, opens } from "./lock.ts";
import type { Lock } from "./lock.ts";
import { log } from "./log.ts";
import type { Log } from "./log.ts";
import type { Link, Seat, Table } from "./table.ts";
import { Tables } from "./tables.ts";

/** The largest message a device may send, bytes: a hello is the largest, and well under this. */
const MAX_MESSAGE = 4096;
/** A device has this long (ms) to say hello. */
const HELLO_WITHIN = 10_000;
/** Each connection is pinged this often (ms), and dropped if the last ping wasn't answered: a device that vanished without closing. */
const HEARTBEAT = 15_000;
/** The tables are written down this often (ms), as well as when the server stops. */
const SAVE_EVERY = 30_000;
/** Browsing connections are told the listed rooms this often (ms), if they have changed. */
const LIST_EVERY = 2_000;
/** What an address has done is remembered this long (ms) after its last connection closes, so that closing and opening again doesn't start its counts afresh. */
const ADDRESS_KEPT = 3_600_000;
/** At most this many addresses remembered: past it, those with nothing open are forgotten first. */
const ADDRESSES_MAX = 50_000;
/** At most this many sockets open at once, from everyone: each is a file descriptor and some memory. */
const SOCKETS_MAX = 4096;
/** A request's headers must have come within this long (ms), and be no bigger than this (bytes): a WebSocket's are a few hundred. */
const HEADERS_WITHIN = 10_000;
const HEADERS_MAX = 8192;
/** A device that has this much (bytes) the server has sent and it hasn't taken is dropped: about a minute of its table's batches. */
const BACKLOG_MAX = 256 * 1024;
/** At most this many passwords worked out at once (about 16 MB each); past it, a hello that needs one is refused as busy. */
const HASHING_MAX = 8;

type Address = { connections: number; opens: Rate; starts: Rate; knocks: Rate; closedAt: number };

export type ServerOptions = {
  port: number;
  host?: string;
  /** Where to keep the tables; null for nowhere. */
  dataDir: string | null;
  trustProxy?: boolean;
  log?: Log;
  /** How often (ms) browsing connections are told the listed rooms: LIST_EVERY, unless a test can't wait that long. */
  listEvery?: number;
};

export type RoomServer = {
  readonly port: number;
  readonly tables: Tables;
  /** Stops it as a deploy does: the tables kept, every device told to come back. */
  stop(): Promise<void>;
};

/** A device's key as the server keeps it: hashed, so the file of tables holds nothing that would let anyone sit as someone else. */
export const hashKey = (key: string) => createHash("sha256").update(`fly-table-key:${key}`).digest("base64url").slice(0, 32);

/** Private, loopback and link-local addresses: where a proxy in front of the server is. */
const PRIVATE = /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|::1$|f[cd][0-9a-f]{2}:|fe[89ab][0-9a-f]:)/i;

/** An IPv6 address's first 64 bits, written out: one machine has a whole /64 to pick from, so that is what rates count. */
function prefix64(ip: string): string {
  const [head, tail = ""] = ip.toLowerCase().split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = ip.includes("::") ? [...left, ...Array<string>(8 - left.length - right.length).fill("0"), ...right] : left;
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

/**
 * Who a connection is from, as the per-address limits count it. Behind a
 * proxy (`trustProxy`), X-Forwarded-For names the visitor, but only when
 * the connection comes from the proxy itself (a private or loopback
 * address): anyone who reaches the server directly could write the header
 * themselves. Of a list, the last address is the one the nearest proxy
 * added. An IPv4 address in IPv6 is the IPv4 address; any other IPv6 one
 * counts by its /64.
 */
export function clientAddress(peer: string | undefined, forwarded: string | string[] | undefined, trustProxy: boolean): string {
  const plain = (ip: string) => (ip.toLowerCase().startsWith("::ffff:") && isIP(ip.slice(7)) === 4 ? ip.slice(7) : ip);
  let ip = plain(peer ?? "");
  if (trustProxy && PRIVATE.test(ip) && forwarded !== undefined) {
    const named = (Array.isArray(forwarded) ? forwarded.join(",") : forwarded).split(",").map((a) => plain(a.trim())).filter((a) => isIP(a) !== 0);
    if (named.length) ip = named[named.length - 1];
  }
  if (!isIP(ip)) return "unknown";
  return isIP(ip) === 6 ? prefix64(ip) : ip;
}

/** A request's path, or null if its target can't be read as one. */
function pathOf(req: IncomingMessage): string | null {
  try {
    return new URL(req.url ?? "/", "http://localhost").pathname;
  } catch {
    return null;
  }
}

/** Turns an upgrade away before it is a WebSocket. */
function turnAway(socket: Duplex, status: number, reason: string) {
  if (!socket.writable) return socket.destroy();
  // Closed once the answer has gone, not before.
  socket.once("finish", () => socket.destroy());
  socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

/** Sends, unless the device has stopped taking what it is sent (`max` bytes are waiting for it): then it is dropped, rather than its backlog kept in memory without end. */
export function post(ws: Pick<WebSocket, "readyState" | "OPEN" | "bufferedAmount" | "send" | "terminate">, data: string | Uint8Array, max = BACKLOG_MAX) {
  if (ws.readyState !== ws.OPEN) return;
  if (ws.bufferedAmount > max) {
    ws.terminate();
    return;
  }
  ws.send(data);
}

const isStart = (v: unknown): v is TableStart => {
  const s = v as TableStart;
  return (
    !!s && typeof s === "object" && typeof s.place === "string" && typeof s.light === "string" && typeof s.weather === "string" && typeof s.zone === "string" &&
    typeof s.offset === "number" && (s.name === undefined || roomName(s.name) !== null) && (s.listed === undefined || typeof s.listed === "boolean")
  );
};

/** Whether a hello is one the server answers: a table's code, a device's key, and a start and password that are each one, if given. */
export const isHello = (hello: Extract<ClientMessage, { type: "hello" }>) =>
  isTableCode(hello.table) && typeof hello.key === "string" && hello.key.length >= 16 && hello.key.length <= 64 && (hello.start === undefined || isStart(hello.start)) &&
  (hello.password === undefined || isPassword(hello.password));

export async function startServer(options: ServerOptions): Promise<RoomServer> {
  const write = options.log ?? log;
  const started = performance.now();
  const tables = new Tables({ now: () => performance.now() - started, wall: () => Date.now(), log: (event, fields) => write("info", event, fields) });
  const file = options.dataDir ? path.join(options.dataDir, "tables.json") : null;
  if (file) {
    const kept = await tables.load(file);
    write("info", "loaded", { tables: kept });
  }
  const addresses = new Map<string, Address>();
  /** Connections browsing the listed rooms, and what they were last told. */
  const browsing = new Set<WebSocket>();
  let listing = "";
  const address = (req: IncomingMessage) => clientAddress(req.socket.remoteAddress, req.headers["x-forwarded-for"], !!options.trustProxy);
  /** What an address has done, remembered: a new one forgets the longest-closed of those with nothing open, when there are too many. */
  const addressOf = (from: string): Address | null => {
    const seen = addresses.get(from);
    if (seen) return seen;
    if (addresses.size >= ADDRESSES_MAX) {
      for (const [other, them] of addresses) {
        if (them.connections <= 0) addresses.delete(other);
        if (addresses.size < ADDRESSES_MAX * 0.9) break;
      }
      if (addresses.size >= ADDRESSES_MAX) return null;
    }
    const fresh: Address = { connections: 0, opens: new Rate(...ROOM_LIMITS.opens), starts: new Rate(...ROOM_LIMITS.starts), knocks: new Rate(...ROOM_LIMITS.knocks), closedAt: 0 };
    addresses.set(from, fresh);
    return fresh;
  };
  let hashing = 0;
  /** Works out a password, if no more than HASHING_MAX are being worked out already; null if too many are. */
  const hashed = async <T>(work: () => Promise<T>): Promise<T | null> => {
    if (hashing >= HASHING_MAX) return null;
    hashing++;
    try {
      return await work();
    } finally {
      hashing--;
    }
  };

  const server = http.createServer({ maxHeaderSize: HEADERS_MAX, headersTimeout: HEADERS_WITHIN, requestTimeout: HEADERS_WITHIN, connectionsCheckingInterval: 1000 }, (req, res) => {
    if (pathOf(req) === "/health") {
      let devices = 0;
      let flies = 0;
      for (const t of tables.values()) {
        devices += t.connected;
        flies += t.present;
      }
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ ok: true, protocol: PROTOCOL, tables: tables.size, devices, flies, browsing: browsing.size, uptime: Math.round((performance.now() - started) / 1000) }));
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found\n");
  });

  server.maxConnections = SOCKETS_MAX;
  // A socket's error (a reset mid-handshake) is the socket's, not the server's.
  server.on("clientError", (_error, socket) => socket.destroy());

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE, perMessageDeflate: false });
  server.on("upgrade", (req, socket, head) => {
    socket.on("error", () => socket.destroy());
    if (pathOf(req) !== ROOMS_PATH) return turnAway(socket, 404, "Not Found");
    const seen = addressOf(address(req));
    if (!seen || seen.connections >= ROOM_LIMITS.connections || !seen.opens.take(Date.now())) return turnAway(socket, 429, "Too Many Requests");
    wss.handleUpgrade(req, socket, head, (ws) => {
      seen.connections++;
      ws.once("close", () => {
        seen.connections--;
        seen.closedAt = Date.now();
      });
      connect(ws, seen);
    });
  });

  /** The listed rooms, as told to a browsing connection. */
  const rooms = () => JSON.stringify({ type: "rooms", rooms: tables.listed() } satisfies ServerMessage);

  /** A device's connection, from its hello (or its browse) to its close. */
  function connect(ws: WebSocket, from: Address) {
    let table: Table | null = null;
    let seat: Seat | null = null;
    /** Its first message has come: anything more before it is seated (a password being checked, or browsing) is not listened to. */
    let greeted = false;
    let alive = true;
    const link: Link = {
      send(data) {
        post(ws, data);
      },
      close(code, reason) {
        ws.close(code, reason);
      },
    };
    const refuse = (reason: Refusal, name?: string) => {
      if (ws.readyState !== ws.OPEN) return;
      ws.send(JSON.stringify({ type: "refused", reason, ...(name === undefined ? {} : { name }) } satisfies ServerMessage));
      ws.close(CLOSE[reason], reason);
    };
    const helloTimer = setTimeout(() => ws.terminate(), HELLO_WITHIN);
    ws.on("pong", () => (alive = true));
    (ws as WebSocket & { heartbeat?: () => void }).heartbeat = () => {
      if (!alive) return ws.terminate();
      alive = false;
      ws.ping();
    };
    ws.on("message", (data: Buffer, binary: boolean) => {
      if (table && seat) {
        try {
          table.receive(seat, binary ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : data.toString("utf8"));
        } catch (error) {
          // A message the table couldn't take costs its sender the line, never the server everyone else's tables.
          write("error", "message", { table: table.code, error: (error as Error).message });
          ws.close(CLOSE.malformed, "malformed");
        }
        return;
      }
      if (greeted) return;
      greeted = true;
      // The first message is the hello, or a browse.
      clearTimeout(helloTimer);
      let first: ClientMessage;
      try {
        first = JSON.parse(data.toString("utf8")) as ClientMessage;
      } catch {
        return refuse("malformed");
      }
      if (!first || (first.type !== "hello" && first.type !== "browse")) return refuse("malformed");
      if (first.v !== PROTOCOL) return refuse("version");
      if (first.type === "browse") {
        browsing.add(ws);
        post(ws, rooms());
        return;
      }
      sit(first).catch((error: Error) => {
        write("error", "hello", { error: error.message });
        refuse("busy");
      });
    });
    ws.on("close", () => {
      clearTimeout(helloTimer);
      browsing.delete(ws);
      if (table && seat) table.disconnected(seat, link);
    });

    /**
     * Sits the device down, starting the table if the hello says to: with a
     * lock, if it gives a password. At a locked table this device has never
     * sat at, only the password lets it in, its code alone does not; and the
     * tries at it are counted, from this address and at that table.
     */
    async function sit(hello: Extract<ClientMessage, { type: "hello" }>) {
      if (!isHello(hello)) return refuse("malformed");
      const key = hashKey(hello.key);
      const known = tables.get(hello.table);
      let made: Lock | null = null;
      if (!known && hello.start) {
        if (!from.starts.take(Date.now())) return refuse("busy");
        if (hello.password) {
          made = await hashed(() => lock(hello.password!));
          if (!made) return refuse("busy");
        }
      } else if (known?.lock && !known.knows(key) && !known.removed.has(key)) {
        if (!hello.password) return refuse("locked", known.name);
        const now = Date.now();
        if (!from.knocks.take(now) || !known.knocks.take(now)) return refuse("busy");
        const right = await hashed(() => opens(hello.password!, known.lock!));
        if (right === null) return refuse("busy");
        if (!right) {
          write("info", "refused", { table: known.code, reason: "password" });
          return refuse("locked", known.name);
        }
      }
      // Gone while the password was worked on.
      if (ws.readyState !== ws.OPEN) return;
      const opened = tables.open(key, hello, randomInt(2 ** 31), made);
      if (typeof opened === "string") return refuse(opened);
      // Started by someone else with the same code meanwhile, locked, and this device hasn't given its password.
      if (opened.lock && opened !== known && opened.lock !== made && !opened.knows(key)) return refuse("locked", opened.name);
      const sat = opened.hello(link, key, hello);
      if (typeof sat === "string") return refuse(sat);
      table = opened;
      seat = sat;
    }
    ws.on("error", (error) => write("warn", "socket", { error: error.message }));
  }

  // Listening first: a port that can't be had leaves nothing running.
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host ?? "0.0.0.0", () => resolve());
  });
  const beat = setInterval(() => tables.tick(), SEND_EVERY);
  const lister = setInterval(() => {
    const now = Date.now();
    for (const [from, seen] of addresses) if (seen.connections <= 0 && now - seen.closedAt > ADDRESS_KEPT) addresses.delete(from);
    if (!browsing.size) return;
    const next = rooms();
    if (next === listing) return;
    listing = next;
    for (const ws of browsing) post(ws, next);
  }, options.listEvery ?? LIST_EVERY);
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) (ws as WebSocket & { heartbeat?: () => void }).heartbeat?.();
  }, HEARTBEAT);
  let saving: Promise<void> = Promise.resolve();
  const save = (force = false) => {
    if (!file) return saving;
    saving = saving.then(() => tables.save(file, force)).catch((error: Error) => write("error", "save", { error: error.message }));
    return saving;
  };
  const saver = setInterval(() => void save(), SAVE_EVERY);
  const port = (server.address() as { port: number }).port;
  write("info", "listening", { port, path: ROOMS_PATH, kept: file ?? "nowhere" });

  let stopping: Promise<void> | null = null;
  return {
    port,
    tables,
    stop() {
      stopping ??= (async () => {
        clearInterval(beat);
        clearInterval(lister);
        clearInterval(heartbeat);
        clearInterval(saver);
        await save(true);
        tables.close(CLOSE.restart, "restart");
        for (const ws of wss.clients) ws.close(CLOSE.restart, "restart");
        wss.close();
        await new Promise<void>((resolve) => {
          server.close(() => resolve());
          // Sockets that won't finish closing are cut.
          setTimeout(() => {
            for (const ws of wss.clients) ws.terminate();
            server.closeAllConnections();
          }, 2000).unref();
        });
        write("info", "stopped", {});
      })();
      return stopping;
    },
  };
}

if (import.meta.main) {
  const env = process.env;
  const server = await startServer({
    port: Number(env.PORT ?? 8787),
    host: env.HOST ?? "0.0.0.0",
    dataDir: env.DATA_DIR || null,
    trustProxy: env.TRUST_PROXY === "1",
  });
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      log("info", "stopping", { signal });
      void server.stop().then(() => process.exit(0));
    });
  }
}
