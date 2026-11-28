// Hold the real connectome at the network boundary: exploration must work
// without a surrogate brain, then remain quiet after real use and a relaunch.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ChildProcess } from "node:child_process";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import { Fingers, canvasPoint, chromiumPath, contextFor, gameUp, gpuFlags, readState, screenOf, startServer, swipe, targetOf, waitFor, waitForGameTime } from "../../../scripts/play.ts";
import type { Game } from "../src/game.ts";
import { chooseFromTray, waitForTray } from "./tray.ts";
import { startServer as startRooms } from "../../server/src/server.ts";

const { values } = parseArgs({ options: { url: { type: "string" }, shots: { type: "string" } } });
let url = values.url;
let server: ChildProcess | null = null;
if (!url) {
  const started = await startServer();
  url = started.url;
  server = started.server;
}
const browser = await chromium.launch({ executablePath: chromiumPath(), args: gpuFlags() });
const deadline = setTimeout(() => { void browser.close(); }, 8 * 60_000);
try {
  const recovery = await browser.newContext();
  try {
    let failEntry = true;
    await recovery.route((url) => /\/src\/main\.ts$|\/assets\/index-[^/]+\.js$/.test(url.pathname), async (route) => {
      if (failEntry) { failEntry = false; await route.abort("failed"); }
      else await route.continue();
    });
    const page = await recovery.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.getElementById("game")?.dataset.bootFailure === "true");
    if (values.shots) {
      await mkdir(values.shots, { recursive: true });
      await page.screenshot({ path: path.join(values.shots, "bootstrap-failure.png") });
    }
    await page.keyboard.press("Enter");
    await gameUp(page);
    await waitFor(page, "screen=title,brain=running");
    await page.evaluate(() => { (globalThis as unknown as { __fly: Game }).__fly.settings.wallpaperAfter = 1; });
    await waitForGameTime(page, 2);
    assert.equal((await readState(page)).wallpaper, "false", "first arrival stays interactive while being read");
    if (values.shots) await page.screenshot({ path: path.join(values.shots, "bootstrap-recovered.png") });
    const begin = await canvasPoint(page, await targetOf(page, "row", 0));
    await page.mouse.click(begin.x, begin.y);
    await waitFor(page, "screen=play");
    await waitForGameTime(page, 2);
    await waitFor(page, "wallpaper=true");
    console.log("passed: bootstrap script failure and keyboard retry");
  } finally { await recovery.close(); }
  const roomData = await mkdtemp(path.join(tmpdir(), "flies-first-minute-"));
  const rooms = await startRooms({ port: 0, dataDir: roomData, log: () => {} });
  const roomsAt = `ws://127.0.0.1:${rooms.port}/rooms`;
  try {
    // A fresh profile: at home, alone in the picnic, however long it lives, with the room server there to be found.
    const fresh = await browser.newContext();
    try {
      const page = await fresh.newPage();
      const sockets: string[] = [];
      page.on("websocket", (socket) => {
        if (new URL(socket.url()).pathname === "/rooms") sockets.push(socket.url());
      });
      const launch = new URL(url);
      launch.searchParams.set("rooms", roomsAt);
      await page.goto(launch.href);
      await gameUp(page);
      await waitFor(page, "screen=title,brain=running", 120_000);
      await page.keyboard.press("Enter");
      await waitFor(page, "screen=play");
      await waitForGameTime(page, 5);
      const home = await readState(page);
      assert.deepEqual([home.table, home.visit, home.home, home.place], ["", "-1", "picnic", "picnic"], "at home, alone, in the picnic");
      assert.deepEqual(sockets, [], "a fresh profile never joins a room by itself");
      console.log("passed: a fresh profile starts at home, alone");
    } finally { await fresh.close(); }

    // On a visit kept from an earlier launch: back to its room, but only once the real brain is awake.
    const arriving = await browser.newContext();
    let letBrainArrive!: () => void;
    const brainGate = new Promise<void>((resolve) => { letBrainArrive = resolve; });
    try {
      await arriving.addInitScript(() => localStorage.setItem("flies.settings", JSON.stringify({ visit: 0 })));
      await arriving.route("**/brain/connectome.*", async (route) => { await brainGate; await route.continue(); });
      const page = await arriving.newPage();
      const sockets: string[] = [];
      page.on("websocket", (socket) => {
        if (new URL(socket.url()).pathname === "/rooms") sockets.push(socket.url());
      });
      const launch = new URL(url);
      launch.searchParams.set("rooms", roomsAt);
      await page.goto(launch.href);
      await gameUp(page);
      await waitFor(page, "screen=loading,brain=loading,autoJoin=waiting,visit=0");
      await waitForGameTime(page, 0.5);
      assert.deepEqual(sockets, [], "the loading screen never joins before the real brain arrives");
      await page.keyboard.press("Enter");
      await waitFor(page, "screen=play,brain=loading,autoJoin=waiting");
      await waitForGameTime(page, 0.5);
      assert.deepEqual(sockets, [], "Explore keeps the brain gate on a visit's joining");
      letBrainArrive();
      await waitFor(page, "screen=play,brain=running,online=joined,everyone=yes");
      assert.equal(sockets.length, 1, "the real brain waking starts one room connection");
      if (values.shots) await page.screenshot({ path: path.join(values.shots, "explore-visit-joined.png") });
      console.log("passed: a kept visit waits for the real brain, including early Explore");
    } finally {
      letBrainArrive();
      await arriving.close();
    }
  } finally {
    await rooms.stop();
    await rm(roomData, { recursive: true, force: true });
  }
  for (const device of ["mouse", "touch", "remote"] as const) {
    const context = await browser.newContext(contextFor({ url, ...(device === "touch" ? { device: "iPhone 15" } : {}) }));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    await context.route("**/brain/connectome.*", async (route) => { await gate; await route.continue(); });
    try {
      // The native host uses the same DOM button events, but identifies them as
      // remote input. Its brain is still the actual worker brain in this harness.
      if (device === "remote") await context.addInitScript(() => { (globalThis as unknown as { __native: object }).__native = {}; });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(url);
      await gameUp(page);
      await page.evaluate(() => { (globalThis as unknown as { __fly: Game }).__fly.settings.wallpaperAfter = 0; });
      const fingers = await Fingers.on(page);
      const shot = async (name: string) => {
        if (!values.shots) return;
        await mkdir(path.join(values.shots, device), { recursive: true });
        await page.screenshot({ path: path.join(values.shots, device, `${name}.png`) });
      };
      const press = async (kind: string, index?: number) => {
        const point = await targetOf(page, kind, index);
        if (device === "touch") await fingers.tap(point);
        else { const p = await canvasPoint(page, point); await page.mouse.click(p.x, p.y); }
      };
      const learned = () => page.evaluate(() => JSON.parse(localStorage.getItem("flies.learned") ?? "{}") as Record<string, true>);
      const lesson = async (name: string) => {
        await page.waitForFunction((name) => JSON.parse(localStorage.getItem("flies.learned") ?? "{}")[name] === true, name)
          .catch((cause: unknown) => { throw new Error(`${device}: the ${name} lesson did not complete`, { cause }); });
      };
      await shot("download");
      if (device === "remote") {
        await swipe(page, [0, 0], [0.05, 0.01]);
        await waitFor(page, "screen=loading,device=remote");
      }
      if (device === "remote") await page.keyboard.press("Enter");
      else await press("explore");
      await waitFor(page, "screen=play,brain=loading,activity=waiting,tool=hand");
      assert.equal((await readState(page)).neurons, "0");
      await shot("exploring");
      await shot("hand-gesture");
      if (device === "remote") {
        await swipe(page, [0, 0], [0.01, 0]);
        await lesson("hand");
      }
      const choose = (path: readonly string[]) => chooseFromTray(page, path, device === "remote" ? undefined : press);
      type Target = "fly" | "hand" | [number, number];
      const use = async (point: Target, during: () => Promise<unknown>) => {
        if (device === "remote") {
          await page.keyboard.down("Enter");
          try { await during(); } finally { await page.keyboard.up("Enter"); }
          return;
        }
        const at = typeof point === "string" ? await screenOf(page, point) : point;
        if (device === "touch") {
          await fingers.hold(at, during);
        } else {
          const p = await canvasPoint(page, at);
          await page.mouse.move(p.x, p.y);
          await page.mouse.down();
          try { await during(); } finally { await page.mouse.up(); }
        }
      };
      if (device === "remote") {
        await page.keyboard.press("ArrowRight");
        await lesson("camera");
      } else {
        await use("fly", () => lesson("hand"));
      }
      await shot("hand-used");
      for (const [id, path] of [
        ["feed", ["food", "sugar"]],
        ["finger", ["finger"]],
        ["feather", ["toys", "feather"]],
        ["blow", ["toys", "gentle"]],
        ["swoop", ["toys", "ball"]],
        ["build", ["build", "tile-blue"]],
        ["photo", ["photo"]],
      ] as const) {
        await choose(path);
        await waitFor(page, `tool=${id}`);
        const held = id === "feather" || id === "blow";
        let point: Target = held || id === "photo" ? "fly" : "hand";
        // Putting the kit away restores the previous framing before the photo's tap.
        if (id === "photo") await waitForGameTime(page, 0.7);
        if (id === "build") {
          // The sugar and fingertip were used near the arrival spot. Build on open table.
          await page.evaluate(() => {
            const { hands, life } = (globalThis as unknown as { __fly: Game }).__fly;
            life.setDown(-40, -190, 0);
            hands.release();
          });
          await waitFor(page, "buildAim~^tile-blue ok");
          await waitForGameTime(page, 0.5);
          // When following the fly, the preview can slide past its body. Tap the actual preview.
          if (device !== "remote") point = await page.evaluate((): [number, number] => {
            const { builder, director } = (globalThis as unknown as { __fly: Game }).__fly;
            const { x, y, z } = builder.aim.piece;
            const p = director.camera.position.clone().set(x, y, z).project(director.camera);
            return [(p.x + 1) / 2, (1 - p.y) / 2];
          });
        }
        await shot(`${id}-gesture`);
        // Held tools teach during the press. The others act on a pointer release.
        await use(point, () => held ? lesson(id) : waitForGameTime(page, 0.1));
        await lesson(id);
        await shot(`${id}-used`);
      }
      for (const [id, path, state] of [
        ["sky", ["world", "time", "morning"], "time=morning"],
        ["view", ["look", "wide"], "view=wide"],
        ["place", ["world", "place", "kitchen"], "place=kitchen,moving="],
      ] as const) {
        await choose(path.slice(0, -1));
        await shot(`${id}-gesture`);
        if (device === "remote") await page.keyboard.press("Space");
        else await press("held");
        await waitForTray(page, null);
        await choose(path);
        await lesson(id);
        await waitFor(page, state);
        await shot(`${id}-used`);
      }
      // Exercise gestures before the brain arrives so a spontaneous takeoff
      // cannot turn a held feather into a test of the fly landing by chance.
      // The actual brain handoff and persistence are checked immediately after.
      release();
      await waitFor(page, "brain=running");
      if (device === "remote") assert.equal((await readState(page)).device, "remote");
      const completed = await learned();
      const redrawProbe = await page.evaluate(async () => {
        const game = (globalThis as unknown as { __fly: Game }).__fly;
        const overlay = game.overlay;
        const original = overlay.redraw.bind(overlay);
        const callbacks = new Set<unknown>();
        let calls = 0;
        overlay.redraw = (...args: Parameters<typeof overlay.redraw>) => {
          if (args[1] === "play") { calls++; callbacks.add(args[2]); }
          return original(...args);
        };
        const at = overlay.redraws;
        const began = game.time;
        try {
          await new Promise<void>((resolve) => {
            const observe = () => game.time - began >= 2 ? resolve() : requestAnimationFrame(observe);
            requestAnimationFrame(observe);
          });
          return { frames: calls, distinctCallbacks: callbacks.size, redraws: overlay.redraws - at };
        } finally { overlay.redraw = original; }
      });
      assert.equal(redrawProbe.distinctCallbacks, 1, "play reuses its draw callback on every frame");
      for (const id of ["tray", "hand", "feed", "finger", "feather", "blow", "swoop", "build", "photo", "sky", "view", "place", ...(device === "remote" ? ["camera"] : [])]) assert.equal(completed[id], true, `${device}: ${id}`);
      // Switching hints off and on must not erase a player's history.
      await page.evaluate(() => {
        const game = (globalThis as unknown as { __fly: Game }).__fly;
        game.settings.hints = false; game.applySettings();
        game.settings.hints = true; game.applySettings();
      });
      assert.deepEqual(await learned(), completed);
      await page.reload();
      await gameUp(page);
      await waitFor(page, "brain=running,screen=title");
      assert.deepEqual(await learned(), completed);
      if (device === "remote") await page.keyboard.press("Enter");
      else await press("row", 0);
      await waitFor(page, "screen=play");
      await shot("returning");
      assert.deepEqual(errors, []);
      if (values.shots) await writeFile(path.join(values.shots, device, "result.json"), JSON.stringify({ completed, redrawProbe, input: device === "remote" ? "native-host DOM events in Chromium; not physical hardware" : device, state: await readState(page), errors }, null, 2));
      console.log(`passed: ${device}, early exploration and all tool lessons persist`);
    } catch (error) {
      const page = context.pages()[0];
      console.error(await readState(page));
      console.error(await page?.evaluate(() => (globalThis as unknown as { __fly: Game }).__fly.brain.error));
      throw error;
    } finally {
      release();
      await context.close();
    }
  }
} finally {
  clearTimeout(deadline);
  await browser.close();
  server?.kill();
}
