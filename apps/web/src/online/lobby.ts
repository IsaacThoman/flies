// Browsing the rooms: a line to the room server that sits nowhere, only
// asks for the listed rooms and is told them again whenever they change,
// for as long as the list is on screen. Like a table's line it goes through
// a TableSocket, polled once a frame, and opens again when it drops.

import type { OpenTableSocket, TableSocket } from "@fly/contracts";
import { CLOSE, PROTOCOL, readServerMessage } from "@fly/net";
import type { RoomWire } from "@fly/net";

/** Seconds before opening the line again after it dropped: longer each time, up to the last. */
const RETRY = [0.5, 1, 2, 4, 8];

export type LobbyStatus = "connecting" | "open" | "lost" | "version";

export class Lobby {
  status: LobbyStatus = "connecting";
  /** The listed rooms, fullest first, or null before the room server has said. */
  rooms: RoomWire[] | null = null;
  /** Times the list has been heard, to tell when it has changed. */
  heard = 0;
  readonly #open: OpenTableSocket;
  readonly #url: string;
  #socket: TableSocket | null = null;
  #asked = false;
  #time = 0;
  #retryAt = 0;
  #tries = 0;
  readonly #text = (text: string) => {
    // Only rooms that are rooms, each named as a room may be.
    const m = readServerMessage(text);
    if (m?.type === "rooms") {
      this.rooms = m.rooms;
      this.heard++;
      this.status = "open";
      this.#tries = 0;
    }
  };
  readonly #binary = () => {};

  constructor(open: OpenTableSocket, url: string) {
    this.#open = open;
    this.#url = url;
    this.#socket = open(url);
  }

  /** Once a frame while the list is shown: what has arrived, and opening the line again when it has dropped. `dt` in seconds. */
  update(dt: number) {
    this.#time += dt;
    if (this.status === "version") return;
    const socket = this.#socket;
    if (!socket) {
      if (this.#time >= this.#retryAt) {
        this.#socket = this.#open(this.#url);
        this.#asked = false;
      }
      return;
    }
    socket.drain(this.#text, this.#binary);
    if (socket.status === "open" && !this.#asked) {
      this.#asked = true;
      socket.send(JSON.stringify({ type: "browse", v: PROTOCOL }));
    }
    if (socket.status !== "closed") return;
    socket.close();
    this.#socket = null;
    // A room server newer than this page: the game reloads into its own.
    if (socket.closeCode === CLOSE.version) {
      this.status = "version";
      return;
    }
    this.status = "lost";
    this.#retryAt = this.#time + RETRY[Math.min(this.#tries++, RETRY.length - 1)];
  }

  close() {
    this.#socket?.close(1000, "done");
    this.#socket = null;
  }
}
