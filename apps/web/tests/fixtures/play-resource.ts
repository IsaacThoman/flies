import http from "node:http";
import type { AddressInfo } from "node:net";
const server = http.createServer((_req, res) => res.end("fixture"));
server.listen(0, "127.0.0.1", () => {
  const port = (server.address() as AddressInfo).port;
  process.on("message", () => { if (!process.argv.includes("--silent")) console.log(`Local: http://127.0.0.1:${port}/`); });
  process.send?.({ pid: process.pid, port });
});
