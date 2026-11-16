// A table's line to its room on the Apple TV, whose runtime has no
// WebSocket: the host's (NativeSocketBridge, `globalThis.__native.socket`),
// polled once a frame. JavaScript there has no JIT and every object costs,
// so a binary message is copied by the host into one buffer kept here and
// handed on as one view of it: nothing is made per message or per frame.
// Only the room's rare JSON arrives as new strings.

import { NATIVE_SOCKET_CLOSED, NATIVE_SOCKET_OPEN } from "@fly/contracts";
import type { NativeSocketBridge, OpenTableSocket, TableSocket, TableSocketStatus } from "@fly/contracts";

/** The largest binary message taken: the room's are a few hundred bytes (eight flies' states), and it sends nothing over 4 KB. */
export const NATIVE_MESSAGE_BYTES = 64 * 1024;

export class NativeSocket implements TableSocket {
  status: TableSocketStatus = "connecting";
  closeCode = 0;
  closeReason = "";
  readonly #bridge: NativeSocketBridge;
  readonly #id: number;
  readonly #buffer: ArrayBuffer;
  /** Views of the buffer by length, so that handing one on makes nothing after the first of each. */
  readonly #views: Map<number, DataView>;
  /** The host has forgotten the line (closed by the game): nothing more is asked of it. */
  #released = false;

  constructor(bridge: NativeSocketBridge, url: string, buffer: ArrayBuffer, views: Map<number, DataView>) {
    this.#bridge = bridge;
    this.#buffer = buffer;
    this.#views = views;
    this.#id = bridge.open(url);
    this.#poll();
  }

  #poll() {
    if (this.status === "closed" || this.#released) return;
    const s = this.#bridge.status(this.#id);
    if (s === NATIVE_SOCKET_OPEN) this.status = "open";
    else if (s === NATIVE_SOCKET_CLOSED) {
      this.status = "closed";
      this.closeCode = this.#bridge.closeCode(this.#id);
      this.closeReason = this.#bridge.closeReason(this.#id);
    }
  }

  send(data: string | Uint8Array) {
    if (this.status !== "open") return;
    this.#bridge.send(this.#id, data);
  }

  drain(text: (message: string) => void, binary: (view: DataView) => void) {
    if (this.#released) return;
    const bridge = this.#bridge;
    // Everything that came before a close is still handed on, as a browser's line does.
    for (;;) {
      const m = bridge.next(this.#id, this.#buffer);
      if (m === 0) break;
      if (typeof m === "string") text(m);
      else binary(this.#view(m));
    }
    this.#poll();
  }

  #view(length: number): DataView {
    let view = this.#views.get(length);
    if (!view) this.#views.set(length, (view = new DataView(this.#buffer, 0, length)));
    return view;
  }

  close(code = 1000, reason = "") {
    if (this.#released) return;
    this.#poll();
    this.#released = true;
    this.#bridge.close(this.#id, code, reason);
    if (this.status === "closed") return;
    this.status = "closed";
    this.closeCode = code;
    this.closeReason = reason;
  }
}

/** Lines through the host's bridge, all sharing one buffer and its views: only one is open at a time. */
export function nativeSockets(bridge: NativeSocketBridge): OpenTableSocket {
  const buffer = new ArrayBuffer(NATIVE_MESSAGE_BYTES);
  const views = new Map<number, DataView>();
  return (url) => new NativeSocket(bridge, url, buffer, views);
}

/** The host's socket bridge, where there is one (the Apple TV). */
export function nativeSocketBridge(): NativeSocketBridge | null {
  return (globalThis as { __native?: { socket?: NativeSocketBridge } }).__native?.socket ?? null;
}
