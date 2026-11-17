// Browsing the rooms: a line to the room server that sits nowhere, only
// asks for the listed rooms and is told them again whenever they change,
// for as long as the list is on screen. Like a table's line it goes through
// a TableSocket, polled once a frame, and opens again when it drops.

import type { OpenTableSocket, TableSocket } from "@fly/contracts";
import { CLOSE, PROTOCOL, readServerMessage } from "@fly/net";
import type { RoomWire } from "@fly/net";

/** Seconds before opening the line again after it dropped: longer each time, up to the last. */
const RETRY = [0.5, 1, 2, 4, 8];

export type LobbyStatus = "connecting" | "open" | "lost" | "stale" | "version";

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
  #openedAt = 0;
  #heardAt = 0;
  #answered = false;
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
      this.#answered = true;
      this.#heardAt = this.#time;
    } else if (m?.type === "refused" && m.reason === "version") {
      this.status = "version";
      this.#socket?.close();
      this.#socket = null;
      this.#retryAt = this.#time + 8;
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
    const socket = this.#socket;
    if (!socket) {
      if (this.#time >= this.#retryAt) {
        this.#socket = this.#open(this.#url);
        this.#asked = false;
        this.#answered = false;
        this.#openedAt = this.#time;
      }
      return;
    }
    socket.drain(this.#text, this.#binary);
    if (this.#socket !== socket) return;
    if (socket.status === "open" && !this.#asked) {
      this.#asked = true;
      socket.send(JSON.stringify({ type: "browse", v: PROTOCOL }));
    }
    // Unchanged lists have no traffic. Reopen periodically to check both the
    // connection and the list without requiring a newer room server.
    if (this.#answered && this.#time - this.#heardAt >= 30) {
      socket.close();
      this.#socket = null;
      this.#retryAt = this.#time;
      return;
    }
    if (socket.status !== "closed" && (this.#answered || this.#time - this.#openedAt < 10)) return;
    socket.close();
    this.#socket = null;
    // A room server newer than this page: the game reloads into its own.
    if (socket.closeCode === CLOSE.version) {
      this.status = "version";
      this.#retryAt = this.#time + 8;
      return;
    }
    this.status = this.rooms ? "stale" : "lost";
    this.#retryAt = this.#time + RETRY[Math.min(this.#tries++, RETRY.length - 1)];
  }

  close() {
    this.#socket?.close(1000, "done");
    this.#socket = null;
  }
}
