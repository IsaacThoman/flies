// Plays at a table with others, each fly with its own real brain in its own
// (GPU-rendered, headless) Chromium tab, against a room server started here
// (keeping its tables in a temporary folder): two tabs sit at one table and
// see each other where each is; they share the food one drops, and agree on
// how much is left; a hidden tab's fly rests at the other's and lives again
// when shown; the room server restarts and both come back to it as they
// were; the starter takes the other's fly off and it is alone again; alone,
// nothing of tables happens at all; and a full table (one tab, seven fake
// flies from Node walking round its fly) keeps the frame to the Apple TV's
// budget on every screen shape, followed and close up.
//
//   node apps/web/e2e/tables.e2e.ts [--url http://localhost:5173/]
//
// Needs the connectome (npm run brain:fetch) and a Playwright Chromium.

import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import type { BrowserContextOptions, Page } from "playwright";
import { MAX_PLAYERS, tableCode } from "@fly/net";
import { startServer as startRooms } from "../../server/src/server.ts";
import type { RoomServer } from "../../server/src/server.ts";
import { chromiumPath, gpuFlags, readState, startServer, waitFor } from "../../../scripts/play.ts";
import { fakeFly } from "../../../scripts/tables.ts";
import type { FakeFly } from "../../../scripts/tables.ts";
import { frameFor } from "../src/display.ts";
import { SHAPES } from "../tests/shapes.ts";

/** The frame's budget on the Apple TV, as play.e2e.ts holds it to. */
const MAX_CALLS = 150;
const MAX_TRIANGLES = 500_000;
/** Where one tab draws the other's fly may be this far (mm) from where the other has it: about a tenth of a second behind, at a fly's walk. */
const DRAWN_WITHIN = 4;
/** How far behind (ms) one tab's food may be the other's, the room's word taking a round trip and its next telling. */
const FOOD_WITHIN = 2500;

const args = process.argv.slice(2);
let url = args.includes("--url") ? args[args.indexOf("--url") + 1] : "";
let vite: ChildProcess | null = null;
if (!url) {
  const started = await startServer();
  url = started.url;
  vite = started.server;
}
const dataDir = mkdtempSync(path.join(os.tmpdir(), "flies-tables-"));
const quiet = () => {};
let rooms: RoomServer = await startRooms({ port: 0, dataDir, log: quiet });
const port = rooms.port;
const roomsAt = `ws://127.0.0.1:${port}/rooms`;
const browser = await chromium.launch({ executablePath: chromiumPath(), args: gpuFlags() });

type Tab = { page: Page; errors: string[]; sockets: string[] };
const tabs: Tab[] = [];

/** A tab in a context of its own: storage of its own, so a device key of its own. */
async function open(options: BrowserContextOptions = { viewport: { width: 960, height: 540 } }): Promise<Tab> {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const tab: Tab = { page, errors: [], sockets: [] };
  page.on("pageerror", (error) => tab.errors.push(error.message));
  page.on("console", (message) => {
    // The browser says so each time it can't reach a room that is down (the restart below): the game tries again.
    if (message.type() === "error" && !/^WebSocket connection to .* failed/.test(message.text())) tab.errors.push(message.text());
  });
  page.on("websocket", (socket) => tab.sockets.push(socket.url()));
  tabs.push(tab);
  return tab;
}

type Other = { id: number; present: boolean; resting: boolean; near: boolean; x: number; z: number; delay: number };
/** The other flies as a tab draws them, from its `others`. */
const othersOf = (s: Record<string, string>): Other[] =>
  (s.others ?? "").split(";").filter(Boolean).map((entry) => {
    const [id, present, resting, near, at, delay] = entry.split(":");
    const [x, z] = at.split(",").map(Number);
    return { id: Number(id), present: present === "1", resting: resting === "1", near: near === "1", x, z, delay: Number(delay) };
  });
/** Its food at the table, by id, from its `tableFoods`. */
const foodsOf = (s: Record<string, string>) => new Map((s.tableFoods ?? "").split(";").filter(Boolean).map((f) => f.split(":").map(Number) as [number, number]));

/** Until a tab's state passes `check`. */
async function waitUntil(page: Page, what: string, check: (s: Record<string, string>) => boolean, timeout = 10_000) {
  const started = Date.now();
  for (;;) {
    const s = await readState(page);
    if (check(s)) return s;
    if (Date.now() - started > timeout) throw new Error(`Timed out waiting for ${what}: ${JSON.stringify(s)}`);
    await page.waitForTimeout(100);
  }
}
/** Until a tab draws the fly of player `id` there, resting or not. */
const seesFly = (page: Page, id: number, resting = false, timeout = 10_000) =>
  waitUntil(page, `fly ${id} there${resting ? ", resting" : ", living"}`, (s) => othersOf(s).some((o) => o.id === id && o.present && o.resting === resting), timeout);

const fly = <T>(page: Page, js: string) => page.evaluate(`(() => { const g = globalThis.__fly; return ${js}; })()`) as Promise<T>;

/** Hides the page or shows it again, as switching tabs does. */
const hide = (page: Page, hidden: boolean) =>
  page.evaluate((h) => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (h ? "hidden" : "visible") });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);

/** Steps along the shelf to a tool, one step at a time as the game shows each. */
async function toTool(page: Page, id: string) {
  for (let i = 0; i < 12; i++) {
    const at = (await readState(page)).tool;
    if (at === id) return;
    await page.keyboard.press("ArrowRight");
    await waitFor(page, `tool~^(?!${at}$)`, 2000);
  }
  await waitFor(page, `tool=${id}`, 1000);
}

type Cost = { frames: number; calls: number; triangles: number; usual: number; eyeFrames: number; eyeCalls: number; eyesOwn: number };
/**
 * The cost of every frame drawn for `ms`, as the game counts it once it has
 * drawn the frame: the most draws and triangles, and the usual frame's draws.
 * Some frames also refresh what the eyes see (several more draws of the
 * world): those are counted apart, with what the eyes add.
 */
const frameCost = (page: Page, ms: number) =>
  page.evaluate(async (ms) => {
    const game = (globalThis as unknown as { __fly: { stage: { cost: { calls: number; triangles: number } }; eyes: { costCalls: number } } }).__fly;
    const calls: number[] = [];
    let triangles = 0;
    const end = performance.now() + ms;
    await new Promise<void>((done) => {
      const frame = () => {
        calls.push(game.stage.cost.calls);
        triangles = Math.max(triangles, game.stage.cost.triangles);
        if (performance.now() < end) requestAnimationFrame(frame);
        else done();
      };
      requestAnimationFrame(frame);
    });
    const usual = [...calls].sort((a, b) => a - b)[Math.floor(calls.length / 2)];
    const eyesOwn = game.eyes.costCalls;
    const eyes = calls.filter((c) => c > usual + eyesOwn / 2);
    return { frames: calls.length, calls: Math.max(...calls), triangles, usual, eyeFrames: eyes.length, eyeCalls: Math.max(0, ...eyes), eyesOwn };
  }, ms) as Promise<Cost>;

/** The room server again, on the same port and keeping the same folder: the port may take a moment to come free. */
async function restartRooms(): Promise<RoomServer> {
  for (let tries = 0; ; tries++) {
    try {
      return await startRooms({ port, dataDir, log: quiet });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE" || tries >= 40) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

const step = (name: string) => console.log(`· ${name}`);
const started = Date.now();
let failed = false;
const fakes = new Set<number>();
const fakeFlies: FakeFly[] = [];

try {
  step("two tabs at one table: each its own player, the first its starter, and each sees the other's fly where it is");
  const [a, b] = [await open(), await open()];
  await a.page.goto(`${url}?rooms=${roomsAt}`);
  await waitFor(a.page, "brain=running,screen=title", 120_000);
  await fly(a.page, "g.startTable()");
  const first = await waitFor(a.page, "online=joined,table=yes", 20_000);
  assert.equal(first.player, "1");
  assert.equal(first.starter, "1", "who starts the table is its starter");
  const link = await fly<string>(a.page, "g.tableLink");
  assert.match(link, /\?table=[2-9a-z]{10}$/);
  await b.page.goto(`${link}&rooms=${roomsAt}`);
  const second = await waitFor(b.page, "online=joined,brain=running", 120_000);
  assert.equal(second.player, "2", "a player of its own");
  assert.equal(second.starter, "1");
  await seesFly(a.page, 2);
  await seesFly(b.page, 1);
  // Each drawn a moment in the past: compare where one tab draws the other with where the other has it, a few times.
  let apart = Infinity;
  for (let i = 0; i < 6; i++) {
    const [seen, own] = await Promise.all([readState(a.page), fly<{ x: number; z: number }>(b.page, "({ x: g.life.body.position.x, z: g.life.body.position.z })")]);
    const o = othersOf(seen).find((o) => o.id === 2)!;
    apart = Math.min(apart, Math.hypot(o.x - own.x, o.z - own.z));
    await a.page.waitForTimeout(250);
  }
  console.log(`  tab 0 draws tab 1's fly within ${apart.toFixed(2)} mm of where it is, ${othersOf(await readState(a.page))[0].delay} ms behind`);
  assert.ok(apart < DRAWN_WITHIN, `tab 0 draws tab 1's fly ${apart.toFixed(2)} mm from where it is`);

  step("they share the food: sugar the first drops is on both tables by its one name, and what is left of it agrees within a moment");
  await a.page.keyboard.press("Enter");
  await waitFor(a.page, "screen=play");
  await toTool(a.page, "feed");
  await waitFor(a.page, "variant=sugar");
  await a.page.keyboard.press("Enter");
  // The first food player 1 drops (DROP_ID × the player, plus its count).
  const sugar = 1_000_001;
  const has = (s: Record<string, string>) => foodsOf(s).has(sugar);
  await waitUntil(a.page, "the sugar on tab 0's table", has, 5000);
  await waitUntil(b.page, "the sugar on tab 1's table", has, 5000);
  const eating = await waitUntil(a.page, "tab 0's fly eating the sugar", (s) => (foodsOf(s).get(sugar) ?? 1) < 0.97, 30_000)
    .then(() => true, () => false);
  for (let i = 0; i < 3; i++) {
    const left = foodsOf(await readState(a.page)).get(sugar) ?? 0;
    const since = Date.now();
    await waitUntil(b.page, `tab 1 down to tab 0's ${left.toFixed(3)} of the sugar`, (s) => (foodsOf(s).get(sugar) ?? 0) <= left + 0.005, FOOD_WITHIN);
    console.log(`  ${left.toFixed(3)} of the sugar left on tab 0, on tab 1 within ${Date.now() - since} ms`);
    await a.page.waitForTimeout(700);
  }
  if (eating) await waitFor(a.page, "granted>0", 5000);
  const fed = await readState(a.page);
  console.log(`  ${eating ? "its fly ate" : "its fly didn't eat (its brain's choice), so nothing changed"}: ${fed.predicted} by its own count, ${fed.granted} by the room's`);

  step("a hidden tab's fly rests at the other's table, and lives again when the tab is shown");
  await hide(b.page, true);
  await waitFor(b.page, "hidden=true", 3000);
  await seesFly(a.page, 2, true, 8000);
  await b.page.waitForTimeout(2000);
  await hide(b.page, false);
  await seesFly(a.page, 2, false, 8000);

  step("the room server restarts: both lose the table, come back to it as the same players, and see each other again");
  const players = [first.player, second.player];
  await rooms.stop();
  await Promise.all([a, b].map((t) => waitFor(t.page, "online=lost", 10_000)));
  rooms = await restartRooms();
  for (const [i, t] of [a, b].entries()) {
    const back = await waitFor(t.page, "online=joined,reconnects>0", 30_000);
    assert.equal(back.player, players[i], `tab ${i} is the same player`);
    assert.equal(back.starter, "1");
  }
  await seesFly(a.page, 2, false, 10_000);
  await seesFly(b.page, 1, false, 10_000);
  console.log(`  back after ${(await readState(a.page)).reconnects} and ${(await readState(b.page)).reconnects} tries`);

  step("the starter takes the other's fly off the table: that tab is alone again, and the fly gone from the starter's");
  await fly(a.page, "g.removeFly(2)");
  const alone = await waitUntil(b.page, "tab 1 alone", (s) => s.table === "" && !("online" in s), 10_000);
  assert.equal(alone.brain, "running", "its fly lives on, alone");
  assert.equal(await fly(b.page, "g.tableEnded"), "removed");
  await waitUntil(a.page, "fly 2 gone from tab 0", (s) => !othersOf(s).some((o) => o.id === 2), 5000);
  await a.page.context().close();
  await b.page.context().close();

  step("alone, nothing changes: no table, no line to a room, and the frame in its budget");
  const solo = await open();
  await solo.page.goto(url);
  await waitFor(solo.page, "brain=running,screen=title", 120_000);
  await solo.page.keyboard.press("Enter");
  await waitFor(solo.page, "screen=play");
  const soloCost = await frameCost(solo.page, 3000);
  const s = await readState(solo.page);
  assert.equal(s.table, "", "not at a table");
  assert.ok(!("online" in s) && !("player" in s) && !("others" in s), "nothing of a table's published");
  // Vite's own line for reloading the page is the only one there may be.
  const lines = solo.sockets.filter((u) => !/[?&]token=/.test(u));
  assert.deepEqual(lines, [], "no line to a room");
  console.log(`  ${soloCost.frames} frames: at most ${soloCost.calls} draws (usually ${soloCost.usual}) and ${soloCost.triangles.toLocaleString("en-US")} triangles`);
  assert.ok(soloCost.calls < MAX_CALLS && soloCost.triangles < MAX_TRIANGLES, "the frame's budget alone");
  await solo.page.context().close();

  step(`a full table on every screen: one tab and ${MAX_PLAYERS - 1} fake flies walking round its fly, followed and close up, the frame in its budget`);
  // A fake starts it, at midday in clear weather, so that each tab can take and give back a seat.
  const code = tableCode((bytes) => crypto.getRandomValues(bytes));
  const start = { place: "picnic", light: "noon", weather: "clear", zone: "UTC", offset: 0 };
  for (let k = 0; k < MAX_PLAYERS - 1; k++) fakeFlies.push(await fakeFly(roomsAt, code, k, fakes, k === 0 ? start : undefined));
  const worst = { calls: 0, triangles: 0, eyes: 0 };
  // The windows, then the phones and tablets: what follows the screen's shape (and the size of what is pressed) is read once, from the pointer.
  const kinds: [boolean, BrowserContextOptions][] = [
    [false, { viewport: { width: 1280, height: 720 } }],
    [true, { viewport: { width: 852, height: 393 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }],
  ];
  for (const [coarse, options] of kinds) {
    const tab = await open(options);
    const page = tab.page;
    await page.goto(`${url}?table=${code}&rooms=${roomsAt}`);
    await waitFor(page, "brain=running,screen=title,online=joined", 120_000);
    await waitUntil(page, `${MAX_PLAYERS - 1} other flies there`, (s) => othersOf(s).filter((o) => o.present && !o.resting).length === MAX_PLAYERS - 1, 15_000);
    await page.keyboard.press("Enter");
    await waitFor(page, "screen=play");
    await toTool(page, "view");
    await waitFor(page, "view=follow");
    for (const [name, shape] of Object.entries(SHAPES).filter(([, shape]) => shape.coarse === coarse)) {
      await page.setViewportSize({ width: shape.width, height: shape.height });
      // What a native host says its notch and home indicator cover.
      await page.evaluate((safe) => {
        (window as unknown as Record<string, unknown>).__flySafeArea = safe;
        window.dispatchEvent(new Event("resize"));
      }, shape.safe);
      const frame = frameFor(shape.width, shape.height, shape.safe, shape.coarse);
      await waitFor(page, `frame=${frame.width}x${frame.height}`, 5000);
      const line: string[] = [];
      for (const [view, key] of [["follow", ""], ["close", "ArrowUp"]] as const) {
        if (key) await page.keyboard.press(key);
        await waitFor(page, `view=${view}`, 3000);
        // The camera comes round to its new view.
        await page.waitForTimeout(1500);
        const cost = await frameCost(page, 2000);
        const near = othersOf(await readState(page)).filter((o) => o.near).length;
        const most = cost.eyeFrames ? `${cost.eyeCalls} refreshing the eyes (${cost.eyesOwn} of them the eyes')` : `at most ${cost.calls}`;
        line.push(`${view}: ${cost.usual} draws, ${most}; ${cost.triangles.toLocaleString("en-US")} triangles at most; ${near} of the flies as the model`);
        worst.calls = Math.max(worst.calls, cost.calls);
        worst.triangles = Math.max(worst.triangles, cost.triangles);
        worst.eyes = Math.max(worst.eyes, cost.eyeCalls);
        assert.ok(cost.calls < MAX_CALLS, `${name}, ${view}: ${cost.calls} draws`);
        assert.ok(cost.triangles < MAX_TRIANGLES, `${name}, ${view}: ${cost.triangles} triangles`);
      }
      console.log(`  ${name} (${frame.width}x${frame.height}): ${line.join("; ")}`);
      await page.keyboard.press("ArrowDown");
      await waitFor(page, "view=follow", 3000);
    }
    // Gives its seat back for the next.
    await fly(page, "g.leaveTable()");
    await waitUntil(page, "alone again", (s) => s.table === "", 5000);
    await page.context().close();
  }
  console.log(`  at most ${worst.calls} draws and ${worst.triangles.toLocaleString("en-US")} triangles a frame (${worst.eyes} in a frame that refreshes the eyes)`);

  for (const [i, t] of tabs.entries()) assert.deepEqual(t.errors, [], `page errors in tab ${i}`);
  console.log(`passed in ${((Date.now() - started) / 1000).toFixed(0)} s`);
} catch (error) {
  failed = true;
  console.error("failed:", error instanceof Error ? error.message : error);
  for (const [i, t] of tabs.entries()) {
    if (!t.page.isClosed()) console.error(`tab ${i} state:`, JSON.stringify(await readState(t.page).catch(() => ({}))));
    if (t.errors.length) console.error(`tab ${i} page errors:\n` + t.errors.join("\n"));
  }
} finally {
  for (const f of fakeFlies) f.close();
  await browser.close();
  await rooms.stop();
  vite?.kill();
  rmSync(dataDir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
