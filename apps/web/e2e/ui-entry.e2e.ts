// A code entered on a phone can be submitted from the control drawn beside
// it, without discovering a keyboard shortcut or adding another menu row.

import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { tableCode } from "@fly/net";
import { startServer as startRooms } from "../../server/src/server.ts";
import { Fingers, openGame, startServer, targetOf, waitFor, waitForGameTime } from "../../../scripts/play.ts";
import { fakeFly } from "../../../scripts/tables.ts";
import type { FakeFly } from "../../../scripts/tables.ts";

const rooms = await startRooms({ port: 0, dataDir: null, log() {} });
const endpoint = `ws://127.0.0.1:${rooms.port}/rooms`;
const code = tableCode((bytes) => crypto.getRandomValues(bytes));
let peer: FakeFly | null = null;
let vite: ChildProcess | null = null;
let opened: Awaited<ReturnType<typeof openGame>> | null = null;
try {
  peer = await fakeFly(endpoint, code, 0, new Set(), { place: "picnic", light: "clock", weather: "now", zone: "UTC", offset: 0, name: "Input table", listed: true });
  const served = await startServer();
  vite = served.server;
  // Manual entry has its own room; automatic joining and adaptive quality are checked separately.
  opened = await openGame({ url: `${served.url}?alone&rooms=${encodeURIComponent(endpoint)}`, device: "iPhone 13", steady: true });
  const { page, errors } = opened;
  await waitFor(page, "screen=title");
  const fingers = await Fingers.on(page);
  await fingers.tap(await targetOf(page, "row", 3));
  await waitFor(page, "onlineView=rooms,rooms~Input");
  // Past Go online and New room, to Code.
  await fingers.tap(await targetOf(page, "row", 2));
  await waitFor(page, "typing=code");
  await page.keyboard.type(code.toUpperCase());
  await waitForGameTime(page, 0.2);
  await fingers.tap(await targetOf(page, "submit"));
  await waitFor(page, "online=joined,onlineView=room,roomName=Input table,ring=false");
  assert.deepEqual(errors, [], "no page errors while typing and joining");
  console.log("✓ touch code entry joins through the in-engine submit control");
} finally {
  await opened?.browser.close();
  peer?.close();
  await rooms.stop();
  if (vite && vite.exitCode === null) {
    const exited = new Promise<void>((resolve) => vite!.once("exit", () => resolve()));
    vite.kill();
    await exited;
  }
}
