// A table's line to its room in a browser: a WebSocket, its messages kept
// until the game takes them at the start of its frame (the TableSocket
// contract), so that they are handled in step with everything else.

import type { TableSocket, TableSocketStatus } from "@fly/contracts";

export class BrowserSocket implements TableSocket {
  status: TableSocketStatus = "connecting";
  closeCode = 0;
  closeReason = "";
  readonly #socket: WebSocket;
  readonly #inbox: (string | ArrayBuffer)[] = [];

  constructor(url: string) {
    const socket = new WebSocket(url);
    socket.binaryType = "arraybuffer";
    socket.onopen = () => (this.status = "open");
    socket.onmessage = (event: MessageEvent<string | ArrayBuffer>) => this.#inbox.push(event.data);
    socket.onclose = (event) => {
      this.status = "closed";
      this.closeCode = event.code;
      this.closeReason = event.reason;
    };
    this.#socket = socket;
  }

  send(data: string | Uint8Array<ArrayBuffer>) {
    if (this.#socket.readyState === WebSocket.OPEN) this.#socket.send(data);
  }

  drain(text: (message: string) => void, binary: (view: DataView) => void) {
    const inbox = this.#inbox;
    for (let i = 0; i < inbox.length; i++) {
      const m = inbox[i];
      if (typeof m === "string") text(m);
      else binary(new DataView(m));
    }
    inbox.length = 0;
  }

  close(code = 1000, reason = "") {
    if (this.status === "closed") return;
    this.#socket.close(code, reason);
  }
}
