// The device's line to its table: a TableSocket (a WebSocket in a browser),
// the hello that sits it down, the room's clock kept by asking the time now
// and then, and coming back when the line drops. A deploy restarting the
// server, a phone going through a tunnel, a laptop waking: the line is
// opened again, a little later each time it fails, and the hello says where
// the fly is so that it carries on where it was. Only the room turning it
// away (removed from the table, the table gone, the protocol changed) ends it.

import type { OpenTableSocket, TableSocket } from "@fly/contracts";
import { CLOSE, FLIES, FLY_MAX, MAX_BITES, RoomClock, bitesLength, encodeBites, encodeFly } from "@fly/net";
import type { Bite, ClientMessage, FlyState, Refusal, ServerMessage, WireScale } from "@fly/net";

/** The clock is asked often at first, to settle quickly, then once a second. */
const FIRST_PINGS = 6;
const PING_FIRST_EVERY = 150;
const PING_EVERY = 1000;
/** Seconds before opening the line again after it dropped: longer each time, up to the last. */
const RETRY = [0.5, 1, 2, 4, 8, 15];
/** After a deploy restarted the server, each device comes back within this many seconds, spread out. */
const RESTART_SPREAD = [0.3, 1.5] as const;
/** A line that opens but isn't welcomed within this long (s) is given up and opened again. */
const WELCOME_WITHIN = 10;

const REFUSED: ReadonlyMap<number, Refusal | "left"> = new Map(Object.entries(CLOSE).filter(([k]) => k !== "restart").map(([k, v]) => [v, k as Refusal | "left"]));

export type LineStatus = "connecting" | "joined" | "lost" | "refused";

export class TableLine {
  readonly clock = new RoomClock();
  status: LineStatus = "connecting";
  /** Why the room turned this device away, once it has. */
  refusal: Refusal | "left" | null = null;
  /** A locked room's name, as it said turning this device away for want of its password. */
  lockedName: string | null = null;
  /** Times the line has been opened again. */
  reconnects = 0;
  /** What has gone each way, bytes. */
  bytesIn = 0;
  bytesOut = 0;
  onMessage: (message: ServerMessage) => void = () => {};
  onFlies: (view: DataView) => void = () => {};
  readonly #open: OpenTableSocket;
  readonly #url: string;
  readonly #hello: () => Extract<ClientMessage, { type: "hello" }>;
  #socket: TableSocket | null = null;
  readonly #fly = new DataView<ArrayBuffer>(new ArrayBuffer(FLY_MAX));
  /** One view per length a fly's state can be, so sending one makes nothing new. */
  readonly #flyViews = new Map<number, Uint8Array<ArrayBuffer>>();
  readonly #bites = new DataView<ArrayBuffer>(new ArrayBuffer(bitesLength(MAX_BITES)));
  #pings = 0;
  #pingAt = -Infinity;
  #helloAt = 0;
  /** When the hello went (performance.now()), for the first reading of the clock. */
  #helloSent = 0;
  #saidHello = false;
  /** When to open the line again (s, by `update`'s clock), and how many tries since it last worked. */
  #retryAt = 0;
  #tries = 0;
  /** Shown again while the line may have closed unseen (a host closes it in the background): if it has, open it again at once. */
  #hurried = false;
  #time = 0;
  readonly #text = (m: string) => this.#receiveText(m);
  readonly #binary = (view: DataView) => this.#receiveBinary(view);

  /** `hello` makes the hello each time the line opens: where the fly is then. */
  constructor(open: OpenTableSocket, url: string, hello: () => Extract<ClientMessage, { type: "hello" }>) {
    this.#open = open;
    this.#url = url;
    this.#hello = hello;
    this.#connect();
  }

  get joined() {
    return this.status === "joined";
  }

  #connect() {
    this.#socket = this.#open(this.#url);
    this.#saidHello = false;
    this.#pings = 0;
    this.#helloAt = this.#time;
  }

  #receiveText(text: string) {
    this.bytesIn += text.length;
    let message: ServerMessage;
    try {
      message = JSON.parse(text) as ServerMessage;
    } catch {
      return;
    }
    if (message.type === "pong") this.clock.sample(message.t, message.now, performance.now());
    else if (message.type === "welcome") {
      this.status = "joined";
      this.#tries = 0;
      // A first reading of the room's clock, which may be a restarted room's.
      this.clock.reset();
      this.clock.sample(this.#helloSent, message.now, performance.now());
    } else if (message.type === "refused") {
      this.status = "refused";
      this.refusal = message.reason;
      if (message.reason === "locked" && typeof message.name === "string") this.lockedName = message.name;
    }
    this.onMessage(message);
  }

  #receiveBinary(view: DataView) {
    this.bytesIn += view.byteLength;
    if (this.status === "joined" && view.byteLength > 0 && view.getUint8(0) === FLIES) this.onFlies(view);
  }

  send(message: ClientMessage) {
    if (this.status !== "joined") return;
    const text = JSON.stringify(message);
    this.bytesOut += text.length;
    this.#socket?.send(text);
  }

  /** Sends this device's fly, at the scale of the place it is in. */
  sendFly(scale: WireScale, state: FlyState) {
    if (this.status !== "joined" || !this.#socket) return;
    const n = encodeFly(this.#fly, scale, state);
    let view = this.#flyViews.get(n);
    if (!view) this.#flyViews.set(n, (view = new Uint8Array(this.#fly.buffer, 0, n)));
    this.bytesOut += n;
    this.#socket.send(view);
  }

  sendBites(seq: number, bites: readonly Bite[], count: number) {
    if (this.status !== "joined" || !this.#socket || count === 0) return;
    const n = encodeBites(this.#bites, seq, bites, count);
    this.bytesOut += n;
    this.#socket.send(new Uint8Array(this.#bites.buffer, 0, n));
  }

  /** Once a frame: what has arrived, the hello when the line opens, the clock, and opening it again when it has dropped. `dt` in seconds. */
  update(dt: number) {
    this.#time += dt;
    this.clock.update(dt);
    if (this.status === "refused") return;
    const socket = this.#socket;
    if (!socket) {
      if (this.#time >= this.#retryAt) {
        this.reconnects++;
        this.#connect();
      }
      return;
    }
    socket.drain(this.#text, this.#binary);
    if (socket.status === "open" && !this.#saidHello) {
      this.#saidHello = true;
      this.#helloSent = performance.now();
      const hello = JSON.stringify(this.#hello());
      this.bytesOut += hello.length;
      socket.send(hello);
    }
    if (socket.status === "closed" || (this.status !== "joined" && this.#time - this.#helloAt > WELCOME_WITHIN)) {
      this.#dropped(socket);
      return;
    }
    this.#hurried = false;
    if (this.status !== "joined") return;
    const now = performance.now();
    const every = this.#pings < FIRST_PINGS ? PING_FIRST_EVERY : PING_EVERY;
    if (now - this.#pingAt < every) return;
    this.#pingAt = now;
    this.#pings++;
    this.send({ type: "ping", t: now });
  }

  #dropped(socket: TableSocket) {
    socket.close();
    this.#socket = null;
    const refused = REFUSED.get(socket.closeCode);
    if (refused) {
      this.status = "refused";
      this.refusal ??= refused;
      return;
    }
    if (this.status === "joined") this.status = "lost";
    const wait = this.#hurried ? 0 : socket.closeCode === CLOSE.restart ? RESTART_SPREAD[0] + Math.random() * (RESTART_SPREAD[1] - RESTART_SPREAD[0]) : RETRY[Math.min(this.#tries, RETRY.length - 1)] * (0.8 + Math.random() * 0.4);
    this.#hurried = false;
    this.#tries++;
    this.#retryAt = this.#time + wait;
  }

  /** Comes back now rather than when the next try is due: the page has just been shown again, or the network is back. */
  hurry() {
    if (this.status === "refused") return;
    if (this.#socket) this.#hurried = true;
    else this.#retryAt = this.#time;
  }

  /** Leaves the table: says so, and closes the line for good. */
  leave() {
    this.send({ type: "bye" });
    this.#socket?.close(1000, "bye");
    this.#socket = null;
    this.status = "refused";
    this.refusal = "left";
  }
}
