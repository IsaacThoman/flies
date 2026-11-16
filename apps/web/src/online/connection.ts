// The device's line to its room: a WebSocket, the room's clock kept by
// asking the time now and then, and the messages in packages/net/protocol.ts.

import { FLIES, FLY_MAX, MAX_BITES, PROTOCOL, RoomClock, bitesLength, encodeBites, encodeFly } from "@fly/net";
import type { Bite, ClientMessage, FlyState, ServerMessage } from "@fly/net";

/** The clock is asked often at first, to settle quickly, then once a second. */
const FIRST_PINGS = 6;
const PING_FIRST_EVERY = 150;
const PING_EVERY = 1000;

export type ConnectionStatus = "connecting" | "joined" | "refused" | "closed";

export class RoomConnection {
  readonly clock = new RoomClock();
  status: ConnectionStatus = "connecting";
  reason = "";
  /** What has gone each way, bytes and messages. */
  bytesIn = 0;
  bytesOut = 0;
  messagesIn = 0;
  messagesOut = 0;
  onMessage: (message: ServerMessage) => void = () => {};
  onFlies: (view: DataView) => void = () => {};
  readonly #socket: WebSocket;
  readonly #fly = new DataView<ArrayBuffer>(new ArrayBuffer(FLY_MAX));
  /** One view per length a fly's state can be, so sending one makes nothing new. */
  readonly #flyViews = new Map<number, Uint8Array<ArrayBuffer>>();
  readonly #bites = new DataView<ArrayBuffer>(new ArrayBuffer(bitesLength(MAX_BITES)));
  #pings = 0;
  #pingAt = -Infinity;
  #helloAt = 0;

  constructor(url: string) {
    const socket = new WebSocket(url);
    socket.binaryType = "arraybuffer";
    socket.onopen = () => {
      this.#helloAt = performance.now();
      this.send({ type: "hello", v: PROTOCOL });
    };
    socket.onmessage = (event: MessageEvent<string | ArrayBuffer>) => this.#receive(event.data);
    socket.onclose = (event) => {
      if (this.status !== "refused") this.status = "closed";
      this.reason ||= event.reason;
    };
    this.#socket = socket;
  }

  get open() {
    return this.#socket.readyState === WebSocket.OPEN;
  }

  #receive(data: string | ArrayBuffer) {
    this.messagesIn++;
    if (typeof data !== "string") {
      this.bytesIn += data.byteLength;
      const view = new DataView(data);
      if (view.byteLength > 0 && view.getUint8(0) === FLIES) this.onFlies(view);
      return;
    }
    this.bytesIn += data.length;
    const message = JSON.parse(data) as ServerMessage;
    if (message.type === "pong") this.clock.sample(message.t, message.now, performance.now());
    else if (message.type === "welcome") {
      // The welcome answers the hello: a first reading of the room's clock.
      this.status = "joined";
      this.clock.sample(this.#helloAt, message.now, performance.now());
    }
    else if (message.type === "refused") {
      this.status = "refused";
      this.reason = message.reason;
    }
    this.onMessage(message);
  }

  send(message: ClientMessage) {
    if (!this.open) return;
    const text = JSON.stringify(message);
    this.bytesOut += text.length;
    this.messagesOut++;
    this.#socket.send(text);
  }

  sendFly(state: FlyState) {
    if (!this.open) return;
    const n = encodeFly(this.#fly, state);
    let view = this.#flyViews.get(n);
    if (!view) this.#flyViews.set(n, (view = new Uint8Array(this.#fly.buffer, 0, n)));
    this.bytesOut += n;
    this.messagesOut++;
    this.#socket.send(view);
  }

  sendBites(seq: number, bites: readonly Bite[], count: number) {
    if (!this.open || count === 0) return;
    const n = encodeBites(this.#bites, seq, bites, count);
    this.bytesOut += n;
    this.messagesOut++;
    this.#socket.send(new Uint8Array(this.#bites.buffer, 0, n));
  }

  /** Asks the room the time when due; eases the clock. Call each frame. */
  update(dt: number, now: number) {
    this.clock.update(dt);
    if (!this.open) return;
    const every = this.#pings < FIRST_PINGS ? PING_FIRST_EVERY : PING_EVERY;
    if (now - this.#pingAt < every) return;
    this.#pingAt = now;
    this.#pings++;
    this.send({ type: "ping", t: now });
  }

  close() {
    this.#socket.close();
  }
}
