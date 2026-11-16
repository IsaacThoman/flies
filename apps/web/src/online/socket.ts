// A table's line to its room in a browser: a WebSocket, its messages kept
// until the game takes them at the start of its frame (the TableSocket
// contract), so that they are handled in step with everything else.

import type { TableSocket, TableSocketStatus } from "@fly/contracts";

// Three bytes per UTF-16 unit bounds UTF-8 and string storage without encoding allocations.
export const INBOX_MESSAGES = 256;
export const BUFFERED_BYTES = 256 * 1024;

export class BrowserSocket implements TableSocket {
  status: TableSocketStatus = "connecting";
  closeCode = 0;
  closeReason = "";
  readonly #socket: WebSocket;
  readonly #inbox: (string | ArrayBuffer)[] = [];
  #inboxBytes = 0;

  constructor(url: string) {
    const socket = new WebSocket(url);
    socket.binaryType = "arraybuffer";
    socket.onopen = () => (this.status = "open");
    socket.onmessage = (event: MessageEvent<string | ArrayBuffer>) => {
      if (this.status === "closed") return;
      const data = event.data;
      const bytes = typeof data === "string" ? data.length * 3 : data.byteLength;
      if (this.#inbox.length >= INBOX_MESSAGES || this.#inboxBytes + bytes > BUFFERED_BYTES) {
        this.#fallBehind();
        return;
      }
      this.#inbox.push(data);
      this.#inboxBytes += bytes;
    };
    socket.onclose = (event) => {
      this.status = "closed";
      this.closeCode = event.code;
      this.closeReason = event.reason;
    };
    this.#socket = socket;
  }

  #fallBehind() {
    // Reconnecting gives a current snapshot; replaying an unbounded backlog would grow memory and work.
    this.#inbox.length = 0;
    this.#inboxBytes = 0;
    this.status = "closed";
    this.closeCode = 1000;
    this.closeReason = "line fell behind";
    this.#socket.close(this.closeCode, this.closeReason);
  }

  send(data: string | Uint8Array<ArrayBuffer>) {
    if (this.status === "closed" || this.#socket.readyState !== WebSocket.OPEN) return;
    const bytes = typeof data === "string" ? data.length * 3 : data.byteLength;
    if (this.#socket.bufferedAmount + bytes > BUFFERED_BYTES) { this.#fallBehind(); return; }
    this.#socket.send(data);
  }

  drain(text: (message: string) => void, binary: (view: DataView) => void) {
    const inbox = this.#inbox;
    for (let i = 0; i < inbox.length; i++) {
      const m = inbox[i];
      if (typeof m === "string") text(m);
      else binary(new DataView(m));
    }
    inbox.length = 0;
    this.#inboxBytes = 0;
  }

  close(code = 1000, reason = "") {
    if (this.status === "closed") return;
    this.#socket.close(code, reason);
  }
}
