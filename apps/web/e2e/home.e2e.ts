// At home, choose every time and weather through the tray with keys and
// with a mouse, then check when the screensaver tours the places.
//
//   node apps/web/e2e/home.e2e.ts [--url http://localhost:5173/]
//
// Needs the connectome (npm run brain:fetch) and a Playwright Chromium.

import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { parseArgs } from "node:util";
import type { Page } from "playwright";
import { canvasPoint, openGame, readState, startServer, swipe, targetOf, waitFor, waitForGameTime } from "../../../scripts/play.ts";
import { chooseFromTray, waitForTray } from "./tray.ts";
import type { Game } from "../src/game.ts";
import { PLACES } from "../src/places/catalog.ts";
import { TOOLS } from "../src/tools/hands.ts";

const { values } = parseArgs({ options: { url: { type: "string" } } });
let url = values.url;
let server: ChildProcess | null = null;
if (!url) {
  const started = await startServer();
  url = started.url;
  server = started.server;
}
const sky = TOOLS.find((t) => t.id === "sky")!;
const TIMES = sky.variants.map((v) => v.id);
const WEATHERS = sky.second!.map((v) => v.id);
const step = (what: string) => console.log(`- ${what}`);
const game = <T>(page: Page, js: string) => page.evaluate((js) => new Function("g", `return (${js});`)((globalThis as unknown as { __fly: Game }).__fly) as T, js);

let opened: Awaited<ReturnType<typeof openGame>> | undefined;
try {
  opened = await openGame({ url, width: 1280, height: 720, steady: true });
  const { page, errors } = opened;
  await waitFor(page, "brain=running,screen=title", 120_000);
  await page.keyboard.press("Enter");
  await waitFor(page, "screen=play,home=picnic,place=picnic,visit=-1,table=");
  step("remote: a swipe focuses World, and Back goes up a ring before closing the tray");
  await page.keyboard.press("Space");
  await waitForTray(page, "root", 0);
  await swipe(page, [0, 0], [-0.6, 0.6]);
  await waitForTray(page, "root", 7);
  await page.keyboard.press("Enter");
  await waitForTray(page, "world");
  await page.keyboard.press("Escape");
  await waitForTray(page, "root", 7);
  await page.keyboard.press("Escape");
  await waitForTray(page, null);
  await waitFor(page, "screen=play,tool=hand");
  // The remote ignores arrow presses briefly after a swipe.
  await waitForGameTime(page, 0.4);

  step("remote and mouse: every time and weather is chosen without taking anything into the hand");
  const click = async (kind: string, index?: number) => {
    const p = await canvasPoint(page, await targetOf(page, kind, index));
    await page.mouse.click(p.x, p.y);
  };
  const mouse = async () => {
    const start = await canvasPoint(page, [0.4, 0.4]);
    const end = await canvasPoint(page, [0.5, 0.5]);
    await page.mouse.move(start.x, start.y);
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await waitFor(page, "device=mouse");
  };
  for (const tap of [undefined, click]) {
    if (tap) await mouse();
    for (const time of [...TIMES.slice(1), TIMES[0]]) {
      await chooseFromTray(page, ["world", "time", time], tap);
      await waitFor(page, time === "clock" ? "sky=clock/now,sunFrom=clock" : `sky=${time}/now,time=${time},sunFrom=chosen`);
    }
    for (const weather of [...WEATHERS.slice(1), WEATHERS[0]]) {
      await chooseFromTray(page, ["world", "weather", weather], tap);
      await waitFor(page, `sky=clock/${weather},tool=hand`);
    }
    await waitFor(page, "weatherFrom=forecast");
  }
  assert.equal(await game<boolean>(page, "g.hands.fixed.size === 0 && JSON.parse(localStorage.getItem('flies.learned')).sky === true"), true, "the Sky's hint is learned");

  await chooseFromTray(page, ["world", "weather"], click);
  await click("trayBack");
  await waitForTray(page, "world");
  await click("trayBack");
  await waitForTray(page, "root");
  await click("held");
  await waitForTray(page, null);

  step("the places go round only in the screensaver, and play is at home");
  await game(page, "(g.settings.wallpaperPlaces = 'turns', g.tour.turn = 2, g.applySettings())");
  await waitForGameTime(page, 5);
  assert.equal((await readState(page)).place, "picnic", "playing, it stays home");
  await game(page, "g.settings.wallpaperAfter = 1");
  await waitFor(page, "wallpaper=true");
  const away = await waitFor(page, `place=${PLACES[1].id},moving=`, 240_000);
  assert.equal(away.home, "picnic", "home stays where it is");
  await game(page, "(g.tour.turn = 1e9, g.settings.wallpaperAfter = 0)");
  await page.keyboard.press("ArrowLeft");
  await waitFor(page, "wallpaper=false");
  await waitFor(page, "place=picnic,moving=", 240_000);
  // Staying home: watched as long, it goes nowhere.
  await game(page, "(g.settings.wallpaperPlaces = 'home', g.applySettings(), g.watch())");
  await waitFor(page, "wallpaper=true");
  await waitForGameTime(page, 6);
  assert.deepEqual([(await readState(page)).place, (await readState(page)).moving], ["picnic", ""], "staying home, it goes nowhere");

  assert.deepEqual(errors, []);
  console.log("home e2e passed");
} finally {
  await opened?.browser.close();
  server?.kill();
}
