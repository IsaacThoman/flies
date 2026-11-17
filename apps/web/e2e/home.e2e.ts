// The fly at home, under its sky: the Sky reaches every time of day and every
// weather from the remote (Up and Down the time, Select round the weather)
// and from a mouse (each label's arrows, a click on it, the wheel over it, a
// drag along it); and the fly goes round the places only in the screensaver,
// when chosen, and is carried home when play begins.
//
//   node apps/web/e2e/home.e2e.ts [--url http://localhost:5173/]
//
// Needs the connectome (npm run brain:fetch) and a Playwright Chromium.

import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { parseArgs } from "node:util";
import type { Page } from "playwright";
import { canvasPoint, openGame, readState, startServer, targetOf, waitFor, waitForGameTime } from "../../../scripts/play.ts";
import { LABEL_SWIPE } from "../src/controls.ts";
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
  const press = async (key: string, times = 1) => {
    for (let i = 0; i < times; i++) {
      await page.keyboard.press(key);
      await waitForGameTime(page, 0.12);
    }
  };

  step("the remote: along the shelf to the Sky, Up and Down through every time of day, Select round every weather");
  for (let i = 0; i < TOOLS.length && (await readState(page)).tool !== "sky"; i++) {
    const at = (await readState(page)).tool;
    await page.keyboard.press("ArrowRight");
    await waitFor(page, `tool~^(?!${at}$)`, 5000);
  }
  await waitFor(page, "tool=sky,sky=clock/now");
  await press("ArrowUp");
  assert.equal((await readState(page)).sky, "clock/now", "Up past the first time is refused");
  for (const time of TIMES.slice(1)) {
    await press("ArrowDown");
    await waitFor(page, `sky=${time}/now,time=${time},sunFrom=chosen`);
  }
  for (const weather of [...WEATHERS.slice(1), WEATHERS[0]]) {
    await press("Enter");
    await waitFor(page, `sky=night/${weather}`);
  }
  await waitFor(page, "weatherFrom=forecast");
  await press("ArrowUp", TIMES.length);
  await waitFor(page, "sky=clock/now,sunFrom=clock");
  assert.equal(await game<boolean>(page, "g.hands.fixed.size === 0 && JSON.parse(localStorage.getItem('flies.learned')).sky === true"), true, "the Sky's hint is learned");

  step("a mouse: each label's arrows either way, a click on it, the wheel over it and a drag along it, through every choice on each dial");
  const box = await canvasPoint(page, [0, 0]);
  // Moved as if meant, the mouse is in hand: the labels have arrows to press.
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4);
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 8 });
  await waitFor(page, "device=mouse");
  for (const [dial, kinds] of [[0, TIMES], [1, WEATHERS]] as const) {
    const at = (i: number) => kinds[((i % kinds.length) + kinds.length) % kinds.length];
    const shows = (i: number) => `sky~${dial === 0 ? `^${at(i)}/` : `/${at(i)}$`}`;
    const click = async (kind: string, dir?: number) => {
      const p = await canvasPoint(page, await targetOf(page, kind, dir, dial));
      await page.mouse.click(p.x, p.y);
    };
    // Round by the right arrow, back by the left.
    for (let i = 1; i <= kinds.length; i++) {
      await click("kind", 1);
      await waitFor(page, shows(i));
    }
    await click("kind", -1);
    await waitFor(page, shows(-1));
    await click("kind", 1);
    await waitFor(page, shows(0));
    // A click on the label steps on.
    await click("label");
    await waitFor(page, shows(1));
    // The wheel over it: a notch a step.
    const label = await canvasPoint(page, await targetOf(page, "label", undefined, dial));
    await page.mouse.move(label.x, label.y);
    await page.mouse.wheel(0, 100);
    await waitFor(page, shows(2));
    await page.mouse.wheel(0, -100);
    await waitFor(page, shows(1));
    // Dragged along it, the kinds go by as a carousel's would: to the left, the next.
    const along = ((LABEL_SWIPE * 1.5) / (await game<number>(page, "g.shape.design.width"))) * box.width;
    await page.mouse.move(label.x, label.y);
    await page.mouse.down();
    await page.mouse.move(label.x - along, label.y, { steps: 6 });
    await page.mouse.up();
    await waitFor(page, shows(2));
  }

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
