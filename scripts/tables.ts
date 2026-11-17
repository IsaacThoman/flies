// Sits several flies down at one table and watches them for a while: starts
// a room server (in this process, keeping nothing) and the game, opens
// headless tabs that each run their own fly's brain, starts a table in the
// first and has the rest follow its link, adds fake flies from Node if asked,
// has each tab use a tool now and then, samples every tab's data-* state, and
// sums up what each saw.
//
//   npm run tables -- [--clients 2] [--seconds 60] [--fake 0] [--size 960x540] [--url http://localhost:5173/]
//
//   --clients N   headless tabs at the table (at least 1), each with its own brain and device key
//   --seconds S   how long they live together once all are there
//   --fake M      fake flies from Node besides (no brain, no browser): each walks a small circle,
//                 5 to 16 mm across, round the first tab's fly, sending its state 20 times a second
//   --size WxH    each tab's window
//   --url         a running game to open instead of starting Vite
//
// At most MAX_FLIES (128) flies sit at a table, the tabs and the fakes together.
//
// The summary, for each tab: every other fly it saw (how often it was there,
// resting, and drawn as the real model, and how far in the past it was drawn),
// the closest its fly came to another's, the food it ate by its own count and
// by the room's, how often its line came back, its frame's most draws and
// triangles, and the bytes it sent and received a second.

import { randomBytes } from "node:crypto";
import type { ChildProcess } from "node:child_process";
import { performance } from "node:perf_hooks";
import { chromium } from "playwright";
import { WebSocket } from "ws";
import type { Browser, Page } from "playwright";
import { FLY_LENGTH } from "@fly/body";
import { FLY_MAX, MAX_FLIES, PROTOCOL, TABLETOP_SCALE, createFlyState, decodeFlies, encodeFly, wireScale } from "@fly/net";
import type { FlyState, ServerMessage, Spot, TableStart, WireScale } from "@fly/net";
import { World, WORLDS } from "@fly/world";
import { startServer as startRooms } from "../apps/server/src/server.ts";
import { chromiumPath, gpuFlags, readState, startServer, waitFor } from "./play.ts";

/** How fast a fake fly walks its circle, mm/s: as a fly walks. */
const FAKE_PACE = 8;

export type FakeFly = {
  readonly id: number;
  /** Tests can drive its hand through the existing wire instead of implementing a second peer. */
  readonly state: FlyState;
  close(): void;
};

/**
 * A fly from Node with no brain and no browser, sitting at `table` (starting
 * it with `start`) with a key of its own. It walks a circle round the fly
 * with the lowest id that isn't in `fakes` (the ids of all the fakes, which
 * it adds its own to), sending its state as a device would; until it has
 * heard of one, round where the table set it down. `k` sets its circle,
 * and the address a proxy says it is at: a room server that trusts one
 * (`trustProxy`) counts each fake as somewhere else, so a full table of them
 * is within what one address may open.
 */
export function fakeFly(rooms: string, table: string, k: number, fakes: Set<number>, start?: TableStart): Promise<FakeFly> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(rooms, { headers: { "x-forwarded-for": `198.18.${(k >> 8) & 255}.${k & 255}` } });
    ws.binaryType = "arraybuffer";
    const state = createFlyState();
    const heard = createFlyState();
    const out = new DataView(new ArrayBuffer(FLY_MAX));
    let world: World | null = null;
    let scale: WireScale = TABLETOP_SCALE;
    let id = 0;
    let at: Spot = [0, 0, 0];
    let centre: { id: number; x: number; z: number } | null = null;
    let roomAt = 0;
    let localAt = 0;
    let seq = 0;
    let timer: ReturnType<typeof setInterval> | null = null;
    const radius = 5 + (k % 7) * (11 / 6);
    const turn = FAKE_PACE / radius;
    const phase = k * 2.1;
    const walk = () => {
      if (!world || ws.readyState !== ws.OPEN) return;
      const t = roomAt + performance.now() - localAt;
      const a = phase + (t / 1000) * turn;
      const cx = centre ? centre.x : at[0];
      const cz = centre ? centre.z : at[1];
      state.seq = ++seq & 0xffff;
      state.t = t;
      state.x = cx + Math.cos(a) * radius;
      state.z = cz + Math.sin(a) * radius;
      // On the surface it was set down on (the table, not the floor under it), or what it walks onto there.
      state.y = world.heightAt(state.x, state.z, (at[3] ?? Infinity) + 1);
      // Facing the way round it walks.
      state.yaw = Math.atan2(-Math.sin(a), Math.cos(a));
      state.vx = -Math.sin(a) * FAKE_PACE;
      state.vz = Math.cos(a) * FAKE_PACE;
      state.pose.speed = FAKE_PACE / FLY_LENGTH;
      state.pose.turn = turn;
      ws.send(new Uint8Array(out.buffer, 0, encodeFly(out, scale, state)));
    };
    ws.onopen = () => ws.send(JSON.stringify({ type: "hello", v: PROTOCOL, table, key: randomBytes(16).toString("hex"), ...(start ? { start } : {}) }));
    ws.onmessage = (event) => {
      if (typeof event.data !== "string") {
        decodeFlies(new DataView(event.data as ArrayBuffer), scale, heard, (s) => {
          if (s.epoch !== state.epoch || fakes.has(s.id) || (centre && s.id > centre.id)) return;
          centre = { id: s.id, x: s.x, z: s.z };
        });
        return;
      }
      const m = JSON.parse(event.data) as ServerMessage;
      if (m.type === "welcome") {
        state.id = m.id;
        id = m.id;
        fakes.add(id);
        state.epoch = m.epoch;
        roomAt = m.now;
        localAt = performance.now();
        world = new World(WORLDS[m.place]);
        scale = wireScale(world.place);
        at = m.at;
        timer ??= setInterval(walk, 50);
        resolve({ id: m.id, state, close: () => ws.close() });
      } else if (m.type === "place") {
        state.epoch = m.epoch;
        world = new World(WORLDS[m.place]);
        scale = wireScale(world.place);
        at = m.spots[id] ?? at;
        centre = null;
      } else if (m.type === "left" && centre?.id === m.id) centre = null;
      else if (m.type === "refused") reject(new Error(`a fake fly was refused: ${m.reason}`));
    };
    ws.onclose = () => {
      if (timer) clearInterval(timer);
    };
    ws.onerror = () => reject(new Error("a fake fly couldn't reach the room"));
  });
}

type Seen = { samples: number; present: number; resting: number; near: number; delays: number[] };

type Tab = {
  i: number;
  page: Page;
  errors: string[];
  seen: Map<number, Seen>;
  closest: number;
  calls: number;
  triangles: number;
  last: Record<string, string>;
  firstNet: { at: number; netIn: number; netOut: number } | null;
};

const step = (message: string) => console.log(`[${((performance.now() - began) / 1000).toFixed(0)} s] ${message}`);
const began = performance.now();

/** Steps along the shelf to a tool, one step at a time as the game shows each. */
async function toTool(page: Page, id: string) {
  for (let n = 0; n < 12; n++) {
    const at = (await readState(page)).tool;
    if (at === id) return;
    await page.keyboard.press("ArrowRight");
    await waitFor(page, `tool~^(?!${at}$)`, 2000);
  }
}

/** One of the things a player does now and then, in turn: sugar at its fly's mouth, the ball, the feather, a puff. */
async function useTool(tab: Tab, turn: number) {
  const page = tab.page;
  const what = (["feed", "swoop", "feather", "blow"] as const)[turn % 4];
  await page.evaluate(() => (globalThis as unknown as { __fly: { hands: { release(): void } } }).__fly.hands.release());
  await toTool(page, what);
  if (what === "feather" || what === "blow") {
    await page.keyboard.down("Enter");
    await page.waitForTimeout(1500);
    await page.keyboard.up("Enter");
  } else await page.keyboard.press("Enter");
  step(`tab ${tab.i}: ${{ feed: "sugar dropped", swoop: "the ball thrown", feather: "tickled", blow: "blown on" }[what]}`);
}

/** Notes what a tab shows now. */
function sample(tab: Tab, s: Record<string, string>) {
  tab.last = s;
  tab.calls = Math.max(tab.calls, Number(s.calls) || 0);
  tab.triangles = Math.max(tab.triangles, Number(s.triangles) || 0);
  if (s.closest) tab.closest = Math.min(tab.closest, Number(s.closest));
  if (s.online === "joined" && !tab.firstNet) tab.firstNet = { at: performance.now(), netIn: Number(s.netIn), netOut: Number(s.netOut) };
  for (const entry of (s.others ?? "").split(";").filter(Boolean)) {
    const [id, present, resting, near, , delay] = entry.split(":");
    const seen = tab.seen.get(Number(id)) ?? { samples: 0, present: 0, resting: 0, near: 0, delays: [] };
    seen.samples++;
    if (present === "1") {
      seen.present++;
      seen.delays.push(Number(delay));
    }
    if (resting === "1") seen.resting++;
    if (near === "1") seen.near++;
    tab.seen.set(Number(id), seen);
  }
}

const percent = (n: number, of: number) => `${of ? Math.round((100 * n) / of) : 0}%`;
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : NaN);

function summary(tabs: Tab[], fakes: Set<number>) {
  console.log("\nwhat each tab saw:");
  for (const tab of tabs) {
    const s = tab.last;
    const seconds = tab.firstNet ? (performance.now() - tab.firstNet.at) / 1000 : 0;
    const rate = (key: "netIn" | "netOut") => (tab.firstNet && seconds > 0 ? ((Number(s[key]) - tab.firstNet[key]) / seconds).toFixed(0) : "?");
    console.log(`  tab ${tab.i} (player ${s.player}${s.player === s.starter ? ", started it" : ""}), ${s.online}:`);
    for (const [id, seen] of [...tab.seen].sort((a, b) => a[0] - b[0])) {
      const delays = seen.delays;
      console.log(
        `    fly ${id}${fakes.has(id) ? " (fake)" : ""}: there ${percent(seen.present, seen.samples)}, resting ${percent(seen.resting, seen.samples)}, the real model ${percent(seen.near, seen.samples)}, ` +
          `drawn ${median(delays).toFixed(0)} ms behind (most ${delays.length ? Math.max(...delays).toFixed(0) : "?"})`,
      );
    }
    console.log(`    closest to another fly: ${Number.isFinite(tab.closest) ? `${tab.closest.toFixed(2)} mm` : "never near"}`);
    console.log(`    food eaten: ${s.predicted} by its own count, ${s.granted} by the room's`);
    console.log(`    the line came back ${s.reconnects} times; round trip ${s.rtt} ms`);
    console.log(`    the frame at most ${tab.calls} draws and ${tab.triangles.toLocaleString("en-US")} triangles`);
    console.log(`    ${rate("netIn")} bytes a second in, ${rate("netOut")} out`);
    if (tab.errors.length) console.log(`    page errors:\n      ${tab.errors.join("\n      ")}`);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const option = (name: string, fallback: string) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : fallback);
  const clients = Math.max(1, Number(option("clients", "2")));
  const seconds = Number(option("seconds", "60"));
  const fakeCount = Number(option("fake", "0"));
  const [width, height] = option("size", "960x540").split("x").map(Number);
  if (clients + fakeCount > MAX_FLIES) throw new Error(`At most ${MAX_FLIES} flies sit at a table`);

  const rooms = await startRooms({ port: 0, dataDir: null, trustProxy: true, log: () => {} });
  const roomsUrl = `ws://127.0.0.1:${rooms.port}/rooms`;
  let vite: ChildProcess | null = null;
  let url = option("url", "");
  if (!url) {
    const started = await startServer();
    url = started.url;
    vite = started.server;
  }
  const browser: Browser = await chromium.launch({ executablePath: chromiumPath(), args: gpuFlags() });
  const tabs: Tab[] = [];
  const fakes = new Set<number>();
  const fakeFlies: FakeFly[] = [];
  let sampling: ReturnType<typeof setInterval> | null = null;
  try {
    for (let i = 0; i < clients; i++) {
      // A context each: storage of its own, so a device key of its own.
      const context = await browser.newContext({ viewport: { width, height } });
      const page = await context.newPage();
      const tab: Tab = { i, page, errors: [], seen: new Map(), closest: Infinity, calls: 0, triangles: 0, last: {}, firstNet: null };
      page.on("pageerror", (error) => tab.errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") tab.errors.push(message.text());
      });
      tabs.push(tab);
    }
    const first = tabs[0].page;
    await first.goto(`${url}?rooms=${roomsUrl}`);
    await waitFor(first, "brain=running", 120_000);
    await first.evaluate(() => {
      const g = (globalThis as unknown as { __fly: { here: string; startRoom(room: { name: string; listed: boolean; password: string; place: string }): void } }).__fly;
      g.startRoom({ name: "Tables", listed: false, password: "", place: g.here });
    });
    await waitFor(first, "online=joined", 20_000);
    const link = await first.evaluate(() => (globalThis as unknown as { __fly: { tableLink: string } }).__fly.tableLink);
    const code = new URL(link).searchParams.get("table")!;
    step(`tab 0 started table ${code}`);
    await Promise.all(tabs.slice(1).map((tab) => tab.page.goto(`${link}&rooms=${roomsUrl}`)));
    await Promise.all(tabs.map((tab) => waitFor(tab.page, "online=joined,brain=running,screen=title", 120_000)));
    step(`${clients} tabs at the table`);
    for (let k = 0; k < fakeCount; k++) fakeFlies.push(await fakeFly(roomsUrl, code, k, fakes));
    if (fakeCount) step(`${fakeCount} fake flies at the table`);
    // Everyone plays: their hands are out, and their flies are walking about.
    for (const tab of tabs) await tab.page.keyboard.press("Enter");
    await Promise.all(tabs.map((tab) => waitFor(tab.page, "screen=play", 10_000)));

    sampling = setInterval(() => {
      for (const tab of tabs) readState(tab.page).then((s) => sample(tab, s), () => {});
    }, 100);
    const until = performance.now() + seconds * 1000;
    for (let turn = 0; performance.now() < until; turn++) {
      await tabs[turn % tabs.length].page.waitForTimeout(Math.min(8000, Math.max(0, until - performance.now())));
      if (performance.now() >= until) break;
      // Each tab goes through the tools in turn, each starting at a different one.
      await useTool(tabs[turn % tabs.length], Math.floor(turn / tabs.length) + (turn % tabs.length)).catch((error: Error) => step(`a tool went wrong: ${error.message}`));
    }
    clearInterval(sampling);
    sampling = null;
    for (const tab of tabs) sample(tab, await readState(tab.page));
    summary(tabs, fakes);
    const health = await (await fetch(`http://127.0.0.1:${rooms.port}/health`)).json();
    console.log(`\nthe room: ${JSON.stringify(health)}`);
  } finally {
    if (sampling) clearInterval(sampling);
    for (const fake of fakeFlies) fake.close();
    await browser.close();
    await rooms.stop();
    vite?.kill();
  }
}

if (import.meta.main) {
  await main();
  process.exit(0);
}
