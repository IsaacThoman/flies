// Plays at a table with others, each fly with its own real brain in its own
// (GPU-rendered, headless) Chromium tab, against a room server started here
// (keeping its tables in a temporary folder): two tabs sit at one table and
// see each other where each is; they share the food one drops, and agree on
// how much is left; a hidden tab's fly rests at the other's and lives again
// when shown; the room server restarts and both come back to it as they
// were; the starter carries the table to the restaurant, where both are set
// down on the window table and see each other at a room's scale; the
// starter takes the other's fly off and it is alone again; a named, locked
// room is made from the menus and joined from Online's list with its
// password, and its link alone leads only to its door; two tabs that open
// the game are at home, alone, until each takes its fly to visit Everyone
// from Online's list, where they find each other; one goes to the lab with
// the Place tool and is in the lab's own room, the other follows it there
// from the list and they see each other again, one goes home from Online and
// stays there, and one on a visit whose room server can't be reached plays
// alone without a word; at home, nothing of tables happens at all; and a
// full table (one tab, MAX_FLIES - 1 fake
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
import { createServer } from "node:net";
import { EVERYONE, MAX_FLIES, seriesCode, seriesFor, tableCode } from "@fly/net";
import { startServer as startRooms } from "../../server/src/server.ts";
import type { RoomServer } from "../../server/src/server.ts";
import { chromiumPath, gameUp, gpuFlags, holdSteady, readState, startServer, waitFor, waitForGameTime } from "../../../scripts/play.ts";
import { fakeFly } from "../../../scripts/tables.ts";
import type { FakeFly } from "../../../scripts/tables.ts";
import { frameFor } from "../src/display.ts";
import { LEVELS } from "../src/quality.ts";
import { SHAPES } from "../tests/shapes.ts";
import { chooseFlies, companyAwake, disableScreensaver } from "./settings.ts";

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
// Trusting a proxy, so that each fake fly is at an address of its own (scripts/tables.ts) and a full table of them is let in.
let rooms: RoomServer = await startRooms({ port: 0, dataDir, trustProxy: true, log: quiet });
const port = rooms.port;
const roomsAt = `ws://127.0.0.1:${port}/rooms`;
const browser = await chromium.launch({ executablePath: chromiumPath(), args: gpuFlags() });

type Tab = { page: Page; errors: string[]; sockets: string[] };
const tabs: Tab[] = [];

/** A tab in a context of its own: storage of its own, so a device key of its own. */
/** `visit`: on a visit to that series of rooms open to everyone from its first launch; otherwise at home, as a launch is. */
async function open(options: BrowserContextOptions = { viewport: { width: 960, height: 540 } }, visit: number | null = null): Promise<Tab> {
  const context = await browser.newContext(options);
  // What is shared at a table, not how it looks: the cheapest picture, so that two tabs drawing on a
  // software GPU (and building the restaurant, a part a frame) keep their frames short.
  await holdSteady(context, LEVELS.length - 1, { visit });
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

type Other = { id: number; present: boolean; resting: boolean; near: boolean; x: number; z: number; delay: number; of: number };
/** The other flies as a tab draws them, from its `others`. */
const othersOf = (s: Record<string, string>): Other[] =>
  (s.others ?? "").split(";").filter(Boolean).map((entry) => {
    const [id, present, resting, near, at, delay, of] = entry.split(":");
    const [x, z] = at.split(",").map(Number);
    return { id: Number(id), present: present === "1", resting: resting === "1", near: near === "1", x, z, delay: Number(delay), of: Number(of) };
  });
/** The flies this device has been seated, in line, with their enamel. */
const mineOf = (s: Record<string, string>) => (s.mine ?? "").split(";").filter(Boolean).map((f) => {
  const [id, colour] = f.split(":");
  return { id: Number(id), colour };
});

/** Its food at the table, by id, from its `tableFoods`. */
const foodsOf = (s: Record<string, string>) => new Map((s.tableFoods ?? "").split(";").filter(Boolean).map((f) => f.split(":").map(Number) as [number, number]));

/**
 * Until a tab's state passes `check`, within `timeout` ms of that tab's own game time: what a table
 * shares comes at the pace of its tabs' frames, a few a second on a software GPU. Never past five
 * minutes on the clock, for a tab whose time has stopped.
 */
async function waitUntil(page: Page, what: string, check: (s: Record<string, string>) => boolean, timeout = 10_000) {
  const time = () => page.evaluate(() => (globalThis as unknown as { __fly: { time: number } }).__fly.time * 1000);
  const until = (await time()) + timeout;
  const started = Date.now();
  for (;;) {
    const s = await readState(page);
    if (check(s)) return s;
    if ((await time()) > until || Date.now() - started > 300_000) throw new Error(`Timed out waiting for ${what}: ${JSON.stringify(s)}`);
    await page.waitForTimeout(100);
  }
}
/** Until a tab draws the fly of player `id` there, resting or not. */
const seesFly = (page: Page, id: number, resting = false, timeout = 10_000) =>
  waitUntil(page, `fly ${id} there${resting ? ", resting" : ", living"}`, (s) => othersOf(s).some((o) => o.id === id && o.present && o.resting === resting), timeout);

const fly = <T>(page: Page, js: string) => page.evaluate(`(() => { const g = globalThis.__fly; return ${js}; })()`) as Promise<T>;

/** How near `seer` draws player `id`'s fly to where its own tab (`own`) has it, mm: each is drawn a moment in the past, so the nearest of a few looks. */
async function drawnApart(seer: Page, own: Page, id: number) {
  let apart = Infinity;
  // On its feet: a fly in flight (a second or two at a quarter of a metre a second, if something startled it) is drawn
  // the network's delay behind, tens of millimetres. Six looks at it standing or walking, over at most 20 s.
  for (let looked = 0, i = 0; looked < 6 && i < 80; i++) {
    const [seen, at] = await Promise.all([readState(seer), fly<{ x: number; z: number; flying: boolean }>(own, "({ x: g.life.body.position.x, z: g.life.body.position.z, flying: !g.life.body.onFeet })")]);
    const o = othersOf(seen).find((o) => o.id === id)!;
    if (!at.flying) {
      apart = Math.min(apart, Math.hypot(o.x - at.x, o.z - at.z));
      looked++;
    }
    await waitForGameTime(seer, 0.25);
  }
  return apart;
}

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

/** Moves the focus with `key` until it is on `id`, one step at a time as the game shows each (a first arrow may only show where the focus is). */
async function keyTo(page: Page, id: string, key: "ArrowUp" | "ArrowDown") {
  for (let i = 0; i < 16; i++) {
    const at = (await readState(page)).focus;
    if (at === id) return;
    await page.keyboard.press(key);
    await waitFor(page, `focus~^(?!${at.replace(/[^\w]/g, ".")}$)`, 1000).catch(() => {});
  }
  await waitFor(page, `focus=${id}`, 1000);
}

/** Types into the focused field as a player would: Select, the words (after rubbing out what was there), Return. */
async function typeInto(page: Page, id: string, words: string, clear = false) {
  if ((await readState(page)).typing !== id) await page.keyboard.press("Enter");
  await waitFor(page, `typing=${id}`, 2000);
  if (clear) for (let i = 0; i < 30; i++) await page.keyboard.press("Backspace");
  await page.keyboard.type(words);
  await page.keyboard.press("Enter");
  await waitFor(page, "typing=", 2000);
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
      return await startRooms({ port, dataDir, trustProxy: true, log: quiet });
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
  await fly(a.page, "g.startRoom({ name: 'Two tabs', listed: false, password: '', place: g.here })");
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
  const apart = await drawnApart(a.page, b.page, 2);
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
  await waitUntil(a.page, "tab 0's fly eating the sugar", (s) => (foodsOf(s).get(sugar) ?? 1) < 0.97, 30_000)
    .catch(() => {});
  for (let i = 0; i < 3; i++) {
    const left = foodsOf(await readState(a.page)).get(sugar) ?? 0;
    const since = Date.now();
    await waitUntil(b.page, `tab 1 down to tab 0's ${left.toFixed(3)} of the sugar`, (s) => (foodsOf(s).get(sugar) ?? 0) <= left + 0.005, FOOD_WITHIN);
    console.log(`  ${left.toFixed(3)} of the sugar left on tab 0, on tab 1 within ${Date.now() - since} ms`);
    await waitForGameTime(a.page, 0.7);
  }
  const pages = [a.page, b.page];
  const states = await Promise.all(pages.map(readState));
  const eater = states.findIndex((s) => Number(s.predicted) > 0);
  if (eater >= 0) {
    const fed = await waitFor(pages[eater], "granted>0", 5000);
    console.log(`  tab ${eater}'s fly ate: ${fed.predicted} by its own count, ${fed.granted} by the room's`);
  } else {
    const fed = states[0];
    console.log(`  its fly didn't eat (its brain's choice), so nothing changed: ${fed.predicted} by its own count, ${fed.granted} by the room's`);
  }

  step("a hidden tab's fly rests at the other's table, and lives again when the tab is shown");
  await hide(b.page, true);
  await waitFor(b.page, "hidden=true", 3000);
  await seesFly(a.page, 2, true, 8000);
  await waitForGameTime(a.page, 2);
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

  step("the starter carries the table to the restaurant: both flies are set down on the window table, and each sees the other where it is");
  await fly(a.page, "g.online.choosePlace('restaurant')");
  // Built a part a frame behind the veil, fifty frames or so: a minute or more on a software GPU drawing two tabs.
  for (const t of [a, b]) await waitFor(t.page, "place=restaurant,moving=,epoch=1", 240_000);
  await seesFly(a.page, 2, false, 10_000);
  await seesFly(b.page, 1, false, 10_000);
  const heights = await Promise.all([a, b].map((t) => fly<number>(t.page, "g.life.body.position.y")));
  // On the window table's top, 760 mm up: past a tabletop's wire, so only a room's scale carries them.
  for (const y of heights) assert.ok(y > 700, `set down ${y.toFixed(1)} mm up, on the table`);
  const roomApart = await drawnApart(a.page, b.page, 2);
  console.log(`  in the restaurant tab 0 draws tab 1's fly within ${roomApart.toFixed(2)} mm of where it is`);
  assert.ok(roomApart < DRAWN_WITHIN, `in the restaurant tab 0 draws tab 1's fly ${roomApart.toFixed(2)} mm from where it is`);

  step("the starter takes the other's fly off the table: that tab is alone again, and the fly gone from the starter's");
  await fly(a.page, "g.removeFly(2)");
  const alone = await waitUntil(b.page, "tab 1 alone", (s) => s.table === "" && !("online" in s), 10_000);
  assert.equal(alone.brain, "running", "its fly lives on, alone");
  assert.equal(await fly(b.page, "g.tableEnded"), "removed");
  await waitUntil(a.page, "fly 2 gone from tab 0", (s) => !othersOf(s).some((o) => o.id === 2), 5000);
  await a.page.context().close();
  await b.page.context().close();

  step("devices bring three and two flies: every fly is seen under its device, with distinct enamel and room-list pips");
  const many = await open();
  const pair = await open();
  for (const tab of [many, pair]) {
    await tab.page.goto(`${url}?rooms=${roomsAt}`);
    await disableScreensaver(tab.page);
    await waitFor(tab.page, "brain=running,screen=title", 120_000);
  }
  await chooseFlies(many.page, 3);
  await chooseFlies(pair.page, 2);
  await companyAwake(many.page, 3);
  await companyAwake(pair.page, 2);
  await fly(many.page, "g.startRoom({ name: 'Five flies', listed: true, password: '', place: g.here })");
  await waitFor(many.page, "online=joined,flies=3");
  const multiCode = await fly<string>(many.page, "g.online.code");
  const multiLink = await fly<string>(many.page, "g.tableLink");
  await pair.page.goto(`${multiLink}&rooms=${roomsAt}`);
  await disableScreensaver(pair.page);
  await waitFor(pair.page, "online=joined,brain=running,flies=2", 120_000);
  const ownMany = mineOf(await readState(many.page));
  const ownPair = mineOf(await readState(pair.page));
  assert.equal(ownMany.length, 3);
  assert.equal(ownPair.length, 2);
  assert.equal(new Set([...ownMany, ...ownPair].map((f) => f.colour)).size, 5);
  const seesDevice = async (page: Page, own: typeof ownMany) => {
    await waitUntil(page, `all flies of device ${own[0].id}`, (s) => {
      const others = othersOf(s).filter((o) => o.of === own[0].id);
      return others.length === own.length && own.every((f) => others.some((o) => o.id === f.id && o.present));
    }, 20_000);
  };
  await seesDevice(many.page, ownPair);
  await seesDevice(pair.page, ownMany);
  assert.equal(othersOf(await readState(many.page)).length, 2);
  assert.equal(othersOf(await readState(pair.page)).length, 3);
  const listing = await open();
  await listing.page.goto(`${url}?rooms=${roomsAt}`);
  await disableScreensaver(listing.page);
  await fly(listing.page, "g.open('online')");
  await waitFor(listing.page, `rooms~${multiCode}:Five flies:picnic:5:0`, 20_000);
  await listing.page.context().close();

  step("a seated device drops to one and grows back, capped by the remaining seats; peers see every join and leave");
  await chooseFlies(many.page, 1);
  await waitFor(many.page, "flies=1,company=,asked=1");
  await waitUntil(pair.page, "only the followed fly of the starter remains", (s) => {
    const others = othersOf(s);
    return others.length === 1 && others[0].id === ownMany[0].id;
  });
  // More devices fill all but two seats, all the starter's request of four can have.
  const fillers: FakeFly[] = [];
  const multiFakes = new Set<number>();
  for (let i = 0; i < MAX_FLIES - 5; i++) {
    const filler = await fakeFly(roomsAt, multiCode, i, multiFakes);
    fillers.push(filler);
    fakeFlies.push(filler);
  }
  await chooseFlies(many.page, 4);
  const capped = await waitFor(many.page, "flies=3,asked=4", 20_000);
  assert.equal(mineOf(capped).length, 3);
  assert.equal(mineOf(capped)[0].id, ownMany[0].id, "the followed fly keeps its seat");
  await companyAwake(many.page, 3);
  await seesDevice(pair.page, mineOf(capped));
  await waitUntil(pair.page, `${MAX_FLIES - 2} other flies fill the table`, (s) => othersOf(s).length === MAX_FLIES - 2);

  step("reloading the two-fly device preserves every fly id and colour; removing either fly removes the whole device");
  await pair.page.reload();
  await disableScreensaver(pair.page);
  const backPair = await waitFor(pair.page, "online=joined,brain=running,flies=2", 120_000);
  assert.deepEqual(mineOf(backPair), ownPair);
  await companyAwake(pair.page, 2);
  await seesDevice(many.page, ownPair);
  await fly(many.page, `g.removeFly(${ownPair[1].id})`);
  await waitUntil(pair.page, "the whole two-fly device removed", (s) => s.table === "" && !("online" in s));
  assert.equal(await fly(pair.page, "g.tableEnded"), "removed");
  await waitUntil(many.page, "both removed flies gone", (s) => othersOf(s).every((o) => o.of !== ownPair[0].id && !ownPair.some((f) => f.id === o.id)));
  for (const filler of fillers) filler.close();
  for (const tab of [many, pair]) await tab.page.context().close();

  step(`${MAX_FLIES - 2} fake flies leave two seats: a new device asking for four lives only the two it is seated`);
  const limitedCode = tableCode((bytes) => crypto.getRandomValues(bytes));
  const limitedFakes: FakeFly[] = [];
  const limitedIds = new Set<number>();
  for (let i = 0; i < MAX_FLIES - 2; i++) {
    const filler = await fakeFly(roomsAt, limitedCode, i, limitedIds, i === 0 ? { place: "picnic", light: "noon", weather: "clear", zone: "UTC", offset: 0 } : undefined);
    limitedFakes.push(filler);
    fakeFlies.push(filler);
  }
  const limited = await open();
  await limited.page.addInitScript(() => localStorage.setItem("flies.settings", JSON.stringify({ flies: 4, wallpaperAfter: 0 })));
  await limited.page.goto(`${url}?table=${limitedCode}&rooms=${roomsAt}`);
  await disableScreensaver(limited.page);
  const twoSeats = await waitFor(limited.page, "online=joined,brain=running,flies=2,asked=4", 120_000);
  assert.equal(mineOf(twoSeats).length, 2);
  await companyAwake(limited.page, 2);
  await waitUntil(limited.page, `${MAX_FLIES - 2} other flies present`, (s) => othersOf(s).length === MAX_FLIES - 2 && othersOf(s).every((o) => o.present));
  await limited.page.context().close();
  for (const filler of limitedFakes) filler.close();

  step("a named, locked room made from the menus with the keys; another tab finds it in Online's list, is told a wrong password is wrong, and gets in with the right one; its link alone opens only its door");
  const maker = await open();
  await maker.page.goto(`${url}?rooms=${roomsAt}`);
  await waitFor(maker.page, "brain=running,screen=title", 120_000);
  await fly(maker.page, "g.open('online')");
  // Disconnected, Go online comes first.
  await waitFor(maker.page, "screen=online,onlineView=rooms,focus=online");
  await keyTo(maker.page, "new", "ArrowDown");
  await maker.page.keyboard.press("Enter");
  await waitFor(maker.page, "onlineView=new,focus=create");
  await keyTo(maker.page, "name", "ArrowUp");
  await typeInto(maker.page, "name", "Locked Lab", true);
  await keyTo(maker.page, "password", "ArrowDown");
  await typeInto(maker.page, "password", "fly paper");
  await keyTo(maker.page, "create", "ArrowDown");
  await maker.page.keyboard.press("Enter");
  const made = await waitFor(maker.page, "online=joined,onlineView=room,roomName=Locked Lab", 20_000);
  assert.equal(made.player, "1");
  const lockedCode = await fly<string>(maker.page, "g.online.code");

  const guest = await open();
  await guest.page.goto(`${url}?rooms=${roomsAt}`);
  await waitFor(guest.page, "brain=running,screen=title", 120_000);
  await fly(guest.page, "g.open('online')");
  const listed = await waitFor(guest.page, `screen=online,rooms~${lockedCode}:Locked Lab:picnic:1:1`, 10_000);
  const unlisted = new URL(link).searchParams.get("table")!;
  assert.ok(listed.rooms.split(";").every((r) => !r.startsWith(unlisted)), "the first two tabs' unlisted table isn't listed");
  await keyTo(guest.page, `room:${lockedCode}`, "ArrowDown");
  await guest.page.keyboard.press("Enter");
  // With the keys in hand, the door's password is typed at once.
  await waitFor(guest.page, "onlineView=door,typing=password");
  await guest.page.keyboard.type("fly trap");
  await guest.page.keyboard.press("Enter");
  await waitFor(guest.page, "onlineView=door,note=wrong,table=", 10_000);
  await typeInto(guest.page, "password", "fly paper");
  const inside = await waitFor(guest.page, "online=joined,onlineView=room,roomName=Locked Lab", 20_000);
  assert.equal(inside.player, "2");
  await seesFly(maker.page, 2);
  await seesFly(guest.page, 1);

  const linked = await open();
  await linked.page.goto(`${url}?table=${lockedCode}&rooms=${roomsAt}`);
  const door = await waitFor(linked.page, "screen=online,onlineView=door,table=", 60_000);
  assert.ok(!("online" in door), "not at the room");
  for (const tab of [maker, guest, linked]) await tab.page.context().close();

  step("at home by default: two tabs that just open the game stay alone, until each takes its fly to visit Everyone from Online's list, nobody its starter, and they see each other");
  const [one, two] = [await open(), await open()];
  for (const tab of [one, two]) await tab.page.goto(`${url}?rooms=${roomsAt}`);
  for (const tab of [one, two]) {
    await waitFor(tab.page, "brain=running,screen=title", 120_000);
    await waitForGameTime(tab.page, 3);
    const home = await readState(tab.page);
    assert.deepEqual([home.table, home.visit], ["", "-1"], "at home, alone");
    assert.ok(!tab.sockets.some((u) => new URL(u).pathname === "/rooms"), "no line to a room");
  }
  for (const tab of [one, two]) {
    await fly(tab.page, "g.open('online')");
    await waitFor(tab.page, `screen=online,onlineView=rooms,rooms~^${EVERYONE}:Everyone:`, 10_000);
    assert.deepEqual((await fly(tab.page, "g.screens.online.menu.items.map((i) => i.id)") as string[]).slice(0, 2), ["new", "code"], "no Go home at home");
    await keyTo(tab.page, `room:${EVERYONE}`, "ArrowDown");
    await tab.page.keyboard.press("Enter");
  }
  const sat = await Promise.all([one, two].map((tab) => waitFor(tab.page, "brain=running,online=joined,everyone=yes,roomName=Everyone,visit=0", 60_000)));
  for (const tab of [one, two]) {
    await tab.page.keyboard.press("Escape");
    await waitFor(tab.page, "screen=title");
  }
  assert.deepEqual(sat.map((s) => s.starter), ["0", "0"], "nobody started it");
  assert.equal(await fly(one.page, "g.online.code"), EVERYONE);
  await seesFly(one.page, Number(sat[1].player));
  await seesFly(two.page, Number(sat[0].player));
  // Online says where it is, and lets it browse the rooms without leaving: Everyone's first, then each place's own.
  await fly(one.page, "g.open('online')");
  await waitFor(one.page, "screen=online,onlineView=room");
  assert.deepEqual(await fly(one.page, "g.screens.online.menu.items.map((i) => i.id)"), ["share", "rooms", "home"]);
  await keyTo(one.page, "rooms", "ArrowDown");
  await one.page.keyboard.press("Enter");
  // Somewhere Everyone's room isn't now, by the clock.
  const [to, toName] = (await readState(one.page)).place === "lab" ? ["kitchen", "Kitchen counter"] : ["lab", "Lab bench"];
  const lab = seriesCode(seriesFor(to));
  await waitFor(one.page, `onlineView=rooms,rooms~^${EVERYONE}:Everyone:[a-z]+:2:0;.*${lab}:${toName}:${to}:0:0,online=joined`, 10_000);
  await one.page.keyboard.press("Escape");
  await waitFor(one.page, "onlineView=room,online=joined");
  await one.page.keyboard.press("Escape");
  await waitFor(one.page, "screen=title");

  step("the Place tool goes to another place, and to that place's own room, its home left as it was: the other tab no longer sees it, until it follows from the list");
  await one.page.keyboard.press("Enter");
  await waitFor(one.page, "screen=play");
  await toTool(one.page, "place");
  await fly(one.page, `g.hands.variants[g.hands.tool] = g.hands.current.variants.findIndex((v) => v.id === '${to}')`);
  await one.page.keyboard.press("Enter");
  const inLab = await waitFor(one.page, `online=joined,everyone=yes,roomName=${toName},place=${to},moving=`, 240_000);
  assert.equal(await fly(one.page, "g.online.code"), lab);
  assert.equal(await fly(one.page, "g.settings.visit"), seriesFor(to), "it visits there now");
  assert.equal(await fly(one.page, "g.settings.place"), "picnic", "its home is where it was");
  await waitUntil(two.page, "tab 0's fly gone from Everyone", (s) => !othersOf(s).some((o) => o.id === Number(sat[0].player)), 10_000);
  await fly(two.page, `g.joinRoom('${lab}')`);
  const followed = await waitFor(two.page, `online=joined,everyone=yes,roomName=${toName},place=${to},moving=`, 240_000);
  await seesFly(one.page, Number(followed.player), false, 10_000);
  await seesFly(two.page, Number(inLab.player), false, 10_000);

  step("going home from Online: alone again, carried home, and not sat with anyone again, this launch or the next, until it visits");
  // Back to the menu, as Back does from play, and Online from there.
  await fly(one.page, "g.back()");
  await waitFor(one.page, "screen=title");
  await fly(one.page, "g.open('online')");
  await waitFor(one.page, "screen=online,onlineView=room");
  await keyTo(one.page, "home", "ArrowDown");
  await one.page.keyboard.press("Enter");
  await waitUntil(one.page, "tab 0 alone", (s) => s.table === "" && !("online" in s), 5000);
  await waitUntil(two.page, "tab 0's fly gone from tab 1", (s) => !othersOf(s).some((o) => o.id === Number(inLab.player)), 5000);
  assert.equal(await fly(one.page, "g.settings.visit"), -1, "kept for the next launch");
  await waitFor(one.page, "onlineView=rooms,focus=new");
  await waitFor(one.page, "place=picnic,moving=", 240_000);
  await one.page.waitForTimeout(3000);
  assert.equal((await readState(one.page)).table, "", "still alone");
  await one.page.reload();
  await gameUp(one.page);
  await waitFor(one.page, "brain=running,screen=title", 120_000);
  await waitForGameTime(one.page, 3);
  assert.deepEqual([(await readState(one.page)).table, (await readState(one.page)).place], ["", "picnic"], "home after a reload too");
  for (const tab of [one, two]) await tab.page.context().close();

  step("on a visit, a room server that can't be reached: the fly plays alone, with nothing said, and the game tries again later");
  const closed = await new Promise<number>((resolve) => {
    const probe = createServer().listen(0, "127.0.0.1", () => {
      const at = (probe.address() as { port: number }).port;
      probe.close(() => resolve(at));
    });
  });
  const cut = await open(undefined, 0);
  await cut.page.goto(`${url}?rooms=ws://127.0.0.1:${closed}/rooms`);
  await waitFor(cut.page, "brain=running,screen=title", 120_000);
  await waitUntil(cut.page, "a try made and given up", (s) => cut.sockets.length > 0 && s.autoJoin === "waiting" && s.table === "", 20_000);
  assert.equal(await fly(cut.page, "g.tableEnded"), null, "nothing to say about it");
  await fly(cut.page, "g.open('online')");
  const quiet = await waitFor(cut.page, "screen=online,onlineView=rooms");
  assert.equal(quiet.note, "", "no note on Online either");
  await cut.page.context().close();

  step("at home, nothing changes: no table, no line to a room, and the frame in its budget");
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

  step(`a full table on every screen: one tab and ${MAX_FLIES - 1} fake flies walking round its fly, followed and close up, the frame in its budget`);
  // A fake starts it, at midday in clear weather, so that each tab can take and give back a seat.
  const code = tableCode((bytes) => crypto.getRandomValues(bytes));
  const start = { place: "picnic", light: "noon", weather: "clear", zone: "UTC", offset: 0 };
  for (let k = 0; k < MAX_FLIES - 1; k++) fakeFlies.push(await fakeFly(roomsAt, code, k, fakes, k === 0 ? start : undefined));
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
    await waitUntil(page, `${MAX_FLIES - 1} other flies there`, (s) => othersOf(s).filter((o) => o.present && !o.resting).length === MAX_FLIES - 1, 15_000);
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
        await waitForGameTime(page, 1.5);
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
