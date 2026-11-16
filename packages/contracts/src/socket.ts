// A table's line to its room server, as the game uses it: send, and once a
// frame take whatever has arrived. In a browser it is a WebSocket
// (apps/web/src/online/socket.ts). A host that wraps the web build and has
// no WebSocket of its own (the Apple TV's runtime) can bridge a native one as
// `globalThis.__native.socket`: the game asks for a line by URL and polls it
// each frame, so nothing is made per message on the game's side.

export type TableSocketStatus = "connecting" | "open" | "closed";

export interface TableSocket {
  readonly status: TableSocketStatus;
  /** Once closed: the close code and reason (1006 if the line simply dropped). */
  readonly closeCode: number;
  readonly closeReason: string;
  /** Sends a text or a binary message; nothing if the line isn't open. */
  send(data: string | Uint8Array): void;
  /**
   * Hands everything that has arrived since the last call, in order: each
   * text to `text`, each binary message to `binary` (its bytes are only
   * good during the call).
   */
  drain(text: (message: string) => void, binary: (view: DataView) => void): void;
  close(code?: number, reason?: string): void;
}

/** Opens a line to a room server's URL (wss://…/rooms). */
export type OpenTableSocket = (url: string) => TableSocket;
