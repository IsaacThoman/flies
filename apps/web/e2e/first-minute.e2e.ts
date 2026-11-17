// Hold the real connectome at the network boundary: exploration must work
// without a surrogate brain, then remain quiet after real use and a relaunch.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ChildProcess } from "node:child_process";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import { Fingers, canvasPoint, chromiumPath, contextFor, gameUp, gpuFlags, readState, screenOf, startServer, swipe, targetOf, waitFor, waitForGameTime } from "../../../scripts/play.ts";
import type { Game } from "../src/game.ts";
import { TOOLS } from "../src/tools/hands.ts";

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
      const lesson = (name: string) => page.waitForFunction((name) => JSON.parse(localStorage.getItem("flies.learned") ?? "{}")[name] === true, name);
      await shot("download");
      if (device === "remote") {
        await swipe(page, [0, 0], [0.05, 0.01]);
        await waitFor(page, "screen=loading,device=remote");
      }
      if (device === "remote") await page.keyboard.press("Enter");
      else await press("explore");
      await waitFor(page, "screen=play,brain=loading,activity=waiting");
      assert.equal((await readState(page)).neurons, "0");
      await shot("exploring");
      release();
      await waitFor(page, "brain=running");
      if (device === "remote") {
        await swipe(page, [0, 0], [0.01, 0]);
        await lesson("hand");
      }
      for (let i = 0; i < TOOLS.length; i++) {
        const id = TOOLS[i].id;
        if (i > 0) {
          if (device === "remote") await page.keyboard.press("ArrowRight");
          else await press("tool", i);
          await waitFor(page, `tool=${id}`);
        }
        await shot(`${id}-gesture`);
        if (id === "light" || id === "weather" || id === "view" || id === "place") {
          if (device === "remote") await page.keyboard.press("ArrowDown");
          else await press("kind", undefined);
          if (id === "place") {
            if (device === "remote") await page.keyboard.press("Enter");
            else await press("go");
          }
        } else if (device === "remote") {
          await page.keyboard.down("Enter");
          try {
            if (id === "feather" || id === "blow") await lesson(id);
            else await waitForGameTime(page, 0.1);
          } finally { await page.keyboard.up("Enter"); }
        } else {
          const point = await screenOf(page, "hand");
          if (device === "touch") await fingers.hold(point, async () => {
            if (id === "feather" || id === "blow") await lesson(id);
            else await waitForGameTime(page, 0.1);
          });
          else {
            const p = await canvasPoint(page, point);
            await page.mouse.move(p.x, p.y);
            await page.mouse.down();
            try {
              if (id === "feather" || id === "blow") await lesson(id);
              else await waitForGameTime(page, 0.1);
            } finally { await page.mouse.up(); }
          }
        }
        await lesson(id);
        if (id === "place") await page.waitForFunction(() => {
          const game = (globalThis as unknown as { __fly: Game }).__fly;
          if (game.here !== game.hands.place || document.getElementById("game")?.dataset.moving) return false;
          for (let i = 0; i < game.overlay.hits.count; i++) if (game.overlay.hits.get(i)?.kind === "go") return false;
          return true;
        });
        await shot(`${id}-used`);
      }
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
      for (const id of ["tools", ...TOOLS.map((tool) => tool.id)]) assert.equal(completed[id], true, `${device}: ${id}`);
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
