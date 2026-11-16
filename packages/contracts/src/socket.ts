// A table's line to its room server, as the game uses it: send, and once a
// frame take whatever has arrived. In a browser, and in the iPhone and iPad
// app's web view, it is a WebSocket (apps/web/src/online/socket.ts). The
// Apple TV's runtime has no WebSocket, so its host bridges a native one as
// `globalThis.__native.socket` (NativeSocketBridge, below), which the game
// polls each frame (apps/web/src/online/native-socket.ts).

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

/** NativeSocketBridge.status: as a WebSocket's readyState, with closing counted as closed. */
export const NATIVE_SOCKET_CONNECTING = 0;
export const NATIVE_SOCKET_OPEN = 1;
export const NATIVE_SOCKET_CLOSED = 2;

/**
 * `globalThis.__native.socket` in the Apple TV app: WebSockets kept by the
 * host, off the JavaScript thread, each named by a number. Every call
 * returns at once. What arrives waits in the host, in order, until the game
 * takes it with `next`; a binary message is copied into the game's own
 * buffer, so taking one makes nothing in JavaScript. The host keeps at most
 * as much as a browser's line does (apps/web/src/online/socket.ts) and
 * closes a line that falls further behind, with 1000 and "line fell behind".
 * A line that fails or drops closes with 1006 and no reason, as a
 * browser's does. The host closes every line with 1001 when the app goes
 * to the background; coming back, the game opens it again.
 */
export interface NativeSocketBridge {
  /** Opens a line to a ws:// or wss:// URL; its id, never 0. A URL it can't open gives a line that is already closed (1006). */
  open(url: string): number;
  /** NATIVE_SOCKET_CONNECTING, _OPEN or _CLOSED; closed for an id it doesn't know. */
  status(id: number): number;
  /** Once closed: the close code and its reason. */
  closeCode(id: number): number;
  closeReason(id: number): string;
  /** Sends a text, or the bytes of a view; nothing unless open. */
  send(id: number, data: string | ArrayBufferView): void;
  /**
   * Takes the next message to arrive, if any: a binary one is copied into
   * `into` and its length returned; a text is returned as a string; 0 when
   * nothing is waiting. A binary message longer than `into` closes the
   * line (1009) instead of being returned.
   */
  next(id: number, into: ArrayBuffer): number | string;
  /** Closes the line (if it isn't already) and forgets it once closed: the id is no use after. */
  close(id: number, code: number, reason: string): void;
}
