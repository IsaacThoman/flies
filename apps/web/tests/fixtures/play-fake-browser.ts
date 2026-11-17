#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
const server = http.createServer((_req, res) => res.end("pending browser launch"));
server.listen(0, "127.0.0.1", () => {
  writeFileSync(process.env.PLAY_RESOURCE_FILE!, JSON.stringify({ pid: process.pid, port: (server.address() as AddressInfo).port }));
});
