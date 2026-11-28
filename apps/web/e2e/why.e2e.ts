// Why? with the real brain in a real (GPU-rendered, headless) Chromium: throws
// the ball until the fly takes off (its brain decides; it doesn't every time),
// chooses Why? from Look, and checks on the canvas's state that the replay plays
// back the take-off with the giant fiber (DNp01) and the flight motor neurons
// marked and a loom among the senses before it; that the remote's swipe, the
// keys and the mouse move through it; and that leaving it is immediate while
// the fly lives on.
//
//   node apps/web/e2e/why.e2e.ts [--url http://localhost:5173/] [--shot why.png]
//
// Needs the connectome (npm run brain:fetch) and a Playwright Chromium.

import assert from "node:assert/strict";
import { chooseFromTray } from "./tray.ts";
import type { ChildProcess } from "node:child_process";
import { mouseDrag, openGame, readState, startServer, swipe, waitFor, waitForGameTime } from "../../../scripts/play.ts";
import type { Game } from "../src/game.ts";

const args = process.argv.slice(2);
let url = args.includes("--url") ? args[args.indexOf("--url") + 1] : "";
const shot = args.includes("--shot") ? args[args.indexOf("--shot") + 1] : "";
let server: ChildProcess | null = null;
if (!url) {
  const started = await startServer();
  url = started.url;
  server = started.server;
}

const { browser, page, errors } = await openGame({ url, steady: true });
let failed = false;
const at = async () => Number((await readState(page)).whyAt);
const press = async (key: string) => {
  await page.keyboard.press(key);
  await waitForGameTime(page, 0.1);
};
try {
  await waitFor(page, "brain=running,screen=title", 120_000);
  await page.keyboard.press("Enter");
  await waitFor(page, "screen=play");
  await page.evaluate(() => { (globalThis as unknown as { __fly: Game }).__fly.settings.wallpaperAfter = 0; });
  // Past the brain's first seconds, whatever they did, so that what is kept is what follows.
  await waitForGameTime(page, 7);

  // As play.e2e.ts finds, bigger pixels hand a software GPU's eyes their pictures sooner, and the fly answers more often.
  await page.evaluate(() => {
    const game = (globalThis as unknown as { __fly: Game }).__fly;
    game.settings.pixels = "chunkier";
    game.applySettings();
  });
  /** Throws the ball until the fly takes off, at most 16 times: the brain decides. */
  const startle = async () => {
    await chooseFromTray(page, ["toys", "ball"]);
    await waitFor(page, "tool=swoop");
    for (let throws = 1; throws <= 16; throws++) {
      await page.keyboard.press("Enter");
      const took = await page.evaluate(() => new Promise<boolean>((resolve) => {
        const game = (globalThis as unknown as { __fly: Game }).__fly;
        const before = game.life.takeOffs, until = game.time + 2.5;
        const check = () => (game.life.takeOffs > before ? resolve(true) : game.time > until ? resolve(false) : requestAnimationFrame(check));
        check();
      }));
      console.log(`  throw ${throws}: ${took ? "took off" : "stayed"}`);
      if (took) return;
      await waitForGameTime(page, 1);
    }
    assert.fail("the fly never took off");
  };
  const ask = async () => {
    await chooseFromTray(page, ["look", "why"]);
    return waitFor(page, "view=why,why~.");
  };

  // What it saw is the brain's too: a ball can take it off with its eyes' regions rising less than the line, so up to three take-offs.
  let why: Record<string, string> = {};
  for (let tries = 1; tries <= 3; tries++) {
    console.log("· the ball until it takes off");
    await startle();
    console.log("· Look → Why? plays back the take-off");
    why = await ask();
    console.log(`  ${why.why}: neurons ${why.whyNeurons}, commands ${why.whyCommands}, senses before it ${why.whySenses || "none"}, regions ${why.whyRegions || "none"}`);
    assert.equal(why.why, "takeoff");
    assert.equal(why.whyNeurons, "DNp01,flight");
    assert.equal(why.whyCommands, "escape,wings");
    if (/loom|lamina|medulla|lobula|visual-projection|optic/.test(`${why.whySenses} ${why.whyRegions}`)) break;
    // Asked again later: off Why? first, so that coming back to it takes what is kept then.
    await press("Escape");
    await waitFor(page, "view=follow");
  }
  assert.match(`${why.whySenses} ${why.whyRegions}`, /loom|lamina|medulla|lobula|visual-projection|optic/, "what its eyes took in rose before it");
  assert.equal(why.nerves, "hidden", "the corner pictures make way");
  // Where it plays: from before the take-off, forward.
  const first = await at();
  assert.ok(first < 0, `it starts before the take-off (${first})`);
  await waitForGameTime(page, 1);
  assert.ok((await at()) > first, "it plays on");
  if (shot) {
    // Just after the giant fiber fired, held there.
    await page.evaluate(() => {
      const { why } = (globalThis as unknown as { __fly: Game }).__fly;
      const { from, to, onset } = why.why;
      why.scrub(-1);
      why.scrub((onset + 2 - from) / Math.max(1, to - 1 - from));
    });
    await waitForGameTime(page, 0.5);
    await page.locator("#game").screenshot({ path: shot });
  }

  console.log("· the keys, the remote's swipe and the mouse move through it");
  const fly = () => page.evaluate(() => (globalThis as unknown as { __fly: Game }).__fly.life.time);
  // Each way in turn, so that none starts against an end of what was kept.
  const hold = async (key: string) => {
    await page.keyboard.down(key);
    await waitForGameTime(page, 0.6);
    await page.keyboard.up(key);
  };
  let before = await at();
  await hold("e");
  assert.ok((await at()) > before + 0.2, "E goes on");
  before = await at();
  await hold("q");
  assert.ok((await at()) < before - 0.2, "Q goes back");
  before = await at();
  await mouseDrag(page, [0.2, 0.5], [0.8, 0.5]);
  assert.ok((await at()) > before + 0.2, "a drag to the right goes on");
  before = await at();
  await swipe(page, [0.6, 0], [-0.6, 0]);
  // This swipe moves it only a few tenths of a second (measured: 0.27 s), however far it travels, so the line is lower.
  assert.ok((await at()) < before - 0.05, "a swipe to the left goes back");
  const lived = await fly();
  await waitForGameTime(page, 0.5);
  assert.ok((await fly()) > lived + 0.4, "the fly lives on while it is watched");

  console.log("· leaving it is immediate");
  await page.keyboard.press("Escape");
  // Two frames: the press is taken in one, and the replay is gone in it.
  const gone = await page.evaluate(() => new Promise<{ view: string; shown: boolean }>((resolve) => {
    const game = (globalThis as unknown as { __fly: Game }).__fly;
    requestAnimationFrame(() => requestAnimationFrame(() => resolve({ view: game.hands.view, shown: game.why.mesh.visible || game.why.card.visible })));
  }));
  assert.deepEqual(gone, { view: "follow", shown: false });
  assert.equal((await waitFor(page, "view=follow")).why, "");
  assert.deepEqual(errors, [], "page errors");
  console.log("passed");
} catch (error) {
  failed = true;
  console.error("failed:", error instanceof Error ? error.message : error);
  console.error("state:", JSON.stringify(await readState(page).catch(() => ({}))));
} finally {
  await browser.close();
  server?.kill();
}
process.exit(failed ? 1 : 0);
