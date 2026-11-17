// Hold the real connectome at the network boundary: exploration must work
// without a surrogate brain, then remain quiet after real use and a relaunch.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import { Fingers, canvasPoint, chromiumPath, contextFor, gameUp, gpuFlags, readState, screenOf, targetOf, waitFor, waitForGameTime } from "../../../scripts/play.ts";
import type { Game } from "../src/game.ts";
import { TOOLS } from "../src/tools/hands.ts";

const { values } = parseArgs({ options: { url: { type: "string" }, shots: { type: "string" } } });
if (!values.url) throw new Error("Pass --url for the game under test.");
const browser = await chromium.launch({ executablePath: chromiumPath(), args: gpuFlags() });
try {
  for (const device of ["mouse", "touch", "remote"] as const) {
    const context = await browser.newContext(contextFor({ url: values.url, ...(device === "touch" ? { device: "iPhone 15" } : {}) }));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    await context.route("**/brain/connectome.*", async (route) => { await gate; await route.continue(); });
    try {
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(values.url);
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
      if (device === "remote") await page.keyboard.press("Enter");
      else await press("explore");
      await waitFor(page, "screen=play,brain=loading,activity=waiting");
      assert.equal((await readState(page)).neurons, "0");
      await shot("exploring");
      release();
      await waitFor(page, "brain=running");
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
        await shot(`${id}-used`);
      }
      const completed = await learned();
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
      if (values.shots) await writeFile(path.join(values.shots, device, "result.json"), JSON.stringify({ completed, state: await readState(page), errors }, null, 2));
      console.log(`passed: ${device}, early exploration and all tool lessons persist`);
    } finally {
      release();
      await context.close();
    }
  }
} finally {
  await browser.close();
}
