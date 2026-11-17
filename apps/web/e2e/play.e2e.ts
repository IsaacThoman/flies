// Plays the game in a real (GPU-rendered, headless) Chromium with the real
// brain: boots it, waits for the brain, walks the menus with the keys (stepping
// through where the fly lives carries it only where the choice rests), feeds
// the fly and checks its taste senses and feed command, throws the ball until the fly takes
// off, checks the wallpaper comes and goes with what it sees and its nervous
// system in a corner, that the X-ray comes where the fly is big enough,
// carries the fly to every place, leaving its footprints behind each time,
// feeds it the weather outside as the Apple TV would, reloads and finds the
// settings, the shelf and what the hints taught as it left them, and holds
// the frame to its draw budget throughout. It holds the light at midday and
// the weather clear, so that what the fly does answers what the test does; a
// browser has no weather outside but what the test feeds it.
//
//   npm run e2e            (starts its own Vite server)
//   npm run e2e -- --url http://localhost:5173/
//
// Needs the connectome (npm run brain:fetch) and a Playwright Chromium.

import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { openGame, readState, startServer, waitFor, waitForGameTime } from "../../../scripts/play.ts";
import { dropFood, feedHoney } from "./feeding.ts";
import { PLACES } from "../src/places/catalog.ts";
import type { Game } from "../src/game.ts";
import { disableScreensaver } from "./settings.ts";

/** The frame's budget on the Apple TV. */
const MAX_CALLS = 150;
const MAX_TRIANGLES = 500_000;

const args = process.argv.slice(2);
let url = args.includes("--url") ? args[args.indexOf("--url") + 1] : "";
let server: ChildProcess | null = null;
if (!url) {
  const started = await startServer();
  url = started.url;
  server = started.server;
}

const { browser, page, errors } = await openGame({ url });
await disableScreensaver(page);
let maxCalls = 0;
let maxTriangles = 0;
const watch = setInterval(() => {
  readState(page).then((s) => {
    maxCalls = Math.max(maxCalls, Number(s.calls) || 0);
    maxTriangles = Math.max(maxTriangles, Number(s.triangles) || 0);
  }, () => {});
}, 100);

const press = async (key: string, times = 1) => {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key);
    await waitForGameTime(page, 0.15);
  }
};
/** Steps along the shelf to a tool, however many tools there are, one step at a time as the game shows each. */
const toTool = async (id: string) => {
  for (let i = 0; i < 12; i++) {
    const at = (await readState(page)).tool;
    if (at === id) return;
    await page.keyboard.press("ArrowRight");
    await waitFor(page, `tool~^(?!${at}$)`);
  }
  await waitFor(page, `tool=${id}`);
};
let currentStep = "startup";
const step = (name: string) => { currentStep = name; console.log(`· ${name}`); };
let failed = false;

try {
  step("the first drawn frame lifts the native splash, once");
  assert.equal((await readState(page)).ready, "true", "the first published game state is ready");
  const startup = await browser.newPage();
  await startup.addInitScript(() => {
    let next: FrameRequestCallback;
    window.requestAnimationFrame = (callback) => { next = callback; return 1; };
    (globalThis as unknown as { __drawFrame: () => void }).__drawFrame = () => next(performance.now());
  });
  await startup.goto(url);
  await startup.waitForFunction(() => !!(globalThis as unknown as { __fly?: unknown }).__fly, null, { polling: 100 });
  const firstFrame = await startup.evaluate(async () => {
    const { __fly: game, __drawFrame: draw } = globalThis as unknown as { __fly: Game; __drawFrame: () => void };
    game.settings.wallpaperAfter = 0;
    const canvas = document.getElementById("game") as HTMLCanvasElement;
    const before = canvas.dataset.ready;
    let writes = 0, renders = 0, early = false;
    const observer = new MutationObserver((changes) => { writes += changes.length; });
    observer.observe(canvas, { attributes: true, attributeFilter: ["data-ready"] });
    const renderer = game.stage.renderer;
    const render = renderer.render;
    renderer.render = function (scene, camera) {
      renders++;
      early ||= canvas.dataset.ready === "true";
      render.call(this, scene, camera);
    };
    draw();
    renderer.render = render;
    const after = canvas.dataset.ready;
    await Promise.resolve();
    draw();
    await Promise.resolve();
    observer.disconnect();
    return { before, after, renders, early, writes };
  });
  assert.equal(firstFrame.before, undefined, "not ready before drawing");
  assert.ok(firstFrame.renders > 0 && !firstFrame.early, "not ready until rendering finishes");
  assert.equal(firstFrame.after, "true", "ready immediately after the first frame");
  assert.equal(firstFrame.writes, 1, "readiness is only published once");
  await startup.close();
  step("the brain wakes and the title appears");
  const awake = await waitFor(page, "brain=running,screen=title", 90_000);
  assert.equal(awake.neurons, "166700");
  assert.equal(awake.atRoot, "true");
  assert.equal(awake.focus, "play");
  assert.equal(awake.eyesInset, "hidden", "not over the title");

  step("the menus: the first arrow shows the focus, then Settings and its tabs, About, and back each time");
  // The page starts as a mouse's, with no focus showing: the first arrow only shows where it is.
  assert.equal(awake.ring, "false");
  await press("ArrowDown");
  await waitFor(page, "ring=true,focus=play");
  await press("ArrowDown", 3);
  await waitFor(page, "focus=settings");
  await press("ArrowDown", 2);
  await waitFor(page, "focus=online");
  await press("ArrowUp");
  await waitFor(page, "focus=settings");
  await press("Enter");
  await waitFor(page, "screen=settings,stack=title>settings,focus=page,tab=wallpaper,atRoot=false");
  await press("ArrowDown");
  await waitFor(page, "focus=wallpaperAfter");
  await press("ArrowDown", 2);
  await waitFor(page, "focus=place");
  // Where it lives: stepped through, the fly is carried only to the place it rests on, then (leaving the row) at once back.
  await page.evaluate(() => {
    const game = (globalThis as unknown as { __fly: Game; __carried: string[] }).__fly;
    const carried: string[] = ((globalThis as unknown as { __carried: string[] }).__carried = []);
    const moveTo = game.moveTo.bind(game);
    game.moveTo = (id, table) => {
      carried.push(id);
      moveTo(id, table);
    };
  });
  const carried = () => page.evaluate(() => (globalThis as unknown as { __carried: string[] }).__carried);
  // Each in turn, then the first three places, a step at a time, quicker than it settles.
  await press("ArrowRight", 3);
  assert.deepEqual(await carried(), [], "nowhere on the way");
  await waitFor(page, `place=${PLACES[2].id},moving=`, 30_000);
  assert.deepEqual(await carried(), [PLACES[2].id], "once, to where it rested");
  await press("ArrowLeft", 2);
  await press("ArrowUp");
  await waitFor(page, `place=${PLACES[0].id},moving=`, 30_000);
  assert.deepEqual(await carried(), [PLACES[2].id, PLACES[0].id], "leaving the row settles it");
  // Back to living in each in turn, which carries it nowhere.
  await press("ArrowDown");
  await press("ArrowLeft");
  await waitForGameTime(page, 1.5);
  assert.deepEqual(await carried(), [PLACES[2].id, PLACES[0].id]);
  assert.equal(await page.evaluate(() => (globalThis as unknown as { __fly: Game }).__fly.settings.place), "turns");
  await press("ArrowUp", 3);
  await waitFor(page, "focus=page");
  await press("ArrowRight");
  await waitFor(page, "tab=screen");
  await press("ArrowDown");
  await waitFor(page, "focus=eyesInset");
  await press("ArrowDown", 2);
  await waitFor(page, "focus=statsPanel");
  await press("ArrowUp", 3);
  await waitFor(page, "focus=page");
  await press("ArrowRight");
  await waitFor(page, "tab=picture,focus=page");
  await press("ArrowDown");
  await waitFor(page, "focus=pixels");
  await press("ArrowDown", 3);
  await waitFor(page, "focus=rumble");
  await press("ArrowLeft");
  assert.equal(await page.evaluate(() => (globalThis as unknown as { __fly: Game }).__fly.haptics.enabled), false);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("flies.settings")!).rumble), false);
  await press("ArrowDown");
  await waitFor(page, "focus=stats");
  await press("Escape");
  await waitFor(page, "screen=title,focus=settings");
  await press("ArrowUp");
  await press("Enter");
  await waitFor(page, "screen=about");
  await press("ArrowDown", 3);
  await press("Escape");
  await waitFor(page, "screen=title,focus=about");
  await press("ArrowUp", 2);
  await waitFor(page, "focus=play");

  step("play: the fly is on the table, and its brain is moving it");
  await press("Enter");
  await waitFor(page, "screen=play,stack=title>play,atRoot=false");

  step("clear weather and daylight: no rain must touch the fly, and the dark ball needs a bright background for it to see");
  await toTool("weather");
  await press("ArrowDown");
  await waitFor(page, "variant=clear");
  await waitFor(page, "weather=clear");
  await toTool("light");
  await press("ArrowDown", 2);
  await waitFor(page, "time=noon");
  // The light changing so much can make it jump (its brain's answer): let it come down and settle before the honey drops at its mouth.
  await waitForGameTime(page, 3);
  await waitFor(page, "mode~standing|walking");
  await toTool("feed");

  step("feeding: honey at its mouth reaches taste senses and the brain produces a feed command");
  await press("ArrowDown");
  await waitFor(page, "tool=feed,variant=honey");
  await feedHoney(page, () => dropFood(page, () => press("Enter")));
  // Whether it walks off the honey is the brain's choice; footprint generation is also checked with a deterministic walker.
  await waitForGameTime(page, 2);
  const printed = Number((await readState(page)).prints);
  console.log(printed > 0 ? `  walked off the honey, its feet printing (${printed} so far)` : "  no honey prints yet: walking is the brain's choice");

  step("startle: the ball dives at it until it takes off (its brain decides; it doesn't every time)");
  await press("ArrowRight");
  await waitFor(page, "tool=swoop");
  let tookOff = false;
  for (let throws = 1; throws <= 8 && !tookOff; throws++) {
    const before = Number((await readState(page)).takeoffs);
    await press("Enter");
    await waitForGameTime(page, 2.4);
    const after = await readState(page);
    tookOff = Number(after.takeoffs) > before;
    console.log(`  throw ${throws}: escape peak ${after.escapePeak}, ${tookOff ? "took off" : "stayed"}`);
  }
  assert.ok(tookOff, "the fly never took off");
  await waitFor(page, "mode~standing|walking");

  step("the menu with Play/Pause, and Play/Pause carries on; the same with Back");
  await press(" ");
  await waitFor(page, "screen=title,stack=title,focus=play,ring=true");
  await press(" ");
  await waitFor(page, "screen=play,stack=title>play");
  await press("Escape");
  await waitFor(page, "screen=title,focus=play");
  await press("Escape");
  await waitFor(page, "screen=play");

  step("the wallpaper comes when nobody touches the remote, and any press brings the controls back");
  await page.evaluate(() => {
    (globalThis as unknown as { __fly: { settings: { wallpaperAfter: number } } }).__fly.settings.wallpaperAfter = 2;
  });
  await waitFor(page, "wallpaper=true");
  const corner = await waitFor(page, "wallpaper=true,eyesInset~^(top|bottom)-(left|right)$,nerves~^(top|bottom)-(left|right)$");
  assert.equal(corner.nerves, corner.eyesInset, "its nervous system shares the corner with what it sees");
  assert.equal(corner.xray, "0.00", "no X-ray unless asked for");
  assert.equal(corner.statsPanel, "hidden", "no stats unless asked for");
  console.log(`  what it sees and its nervous system, in the ${corner.eyesInset} corner`);
  await waitForGameTime(page, 1.5);
  await press("ArrowRight");
  const back = await waitFor(page, "wallpaper=false");
  assert.equal(back.tool, "swoop", "the press that woke it did nothing else");
  assert.equal(back.screen, "play");

  step("what it sees: while playing by default, but never over the full picture or a menu; on Wallpaper it hides while playing");
  await page.evaluate(() => {
    (globalThis as unknown as { __fly: Game }).__fly.settings.wallpaperAfter = 0;
  });
  await waitFor(page, "screen=play,wallpaper=false,eyesInset=top-right");
  await press("Escape");
  await waitFor(page, "screen=title,eyesInset=hidden");
  await press("Enter");
  await waitFor(page, "screen=play,eyesInset=top-right");
  await toTool("view");
  await waitFor(page, "tool=view,view=follow");
  await press("ArrowDown", 4);
  await waitFor(page, "view=eyes,eyesInset=hidden");
  await press("ArrowUp", 4);
  await waitFor(page, "view=follow,eyesInset=top-right");
  await page.evaluate(() => {
    (globalThis as unknown as { __fly: Game }).__fly.settings.eyesInset = "wallpaper";
  });
  await waitFor(page, "wallpaper=false,eyesInset=hidden");
  await page.evaluate(() => {
    (globalThis as unknown as { __fly: Game }).__fly.settings.eyesInset = "always";
  });
  await waitFor(page, "eyesInset=top-right");

  step("its nervous system: in the corner with what it sees, the fly as glass where it is big enough to see inside, never over the full picture");
  await page.evaluate(() => {
    const settings = (globalThis as unknown as { __fly: { settings: { nerves: string; xray: string } } }).__fly.settings;
    settings.nerves = "always";
    settings.xray = "always";
  });
  const inside = await waitFor(page, "view=follow,eyesInset=top-right,nerves=top-right,xray>0.9");
  assert.ok(inside.glow.length > 0, "its brain's regions glow at rest");
  console.log(`  glowing: ${inside.glow.split(" ").slice(0, 4).join(" ")}`);
  await press("ArrowDown");
  await waitFor(page, "view=wide,xray<0.05");
  await press("ArrowUp");
  await waitFor(page, "view=follow,xray>0.9");
  await press("ArrowDown", 4);
  await waitFor(page, "view=eyes,nerves=hidden");
  // View → Inside it shows it however the setting is.
  await page.evaluate(() => {
    (globalThis as unknown as { __fly: { settings: { xray: string } } }).__fly.settings.xray = "off";
  });
  await press("ArrowDown");
  await waitFor(page, "view=inside,nerves=top-right,xray>0.9");
  await press("ArrowUp", 5);
  await waitFor(page, "view=follow,xray<0.05");
  // Kept for the reload at the end.
  await press("ArrowDown");
  await waitFor(page, "view=wide");

  step("its stats: on Always, across the screen from the others while playing, counting its day; in the wallpaper, moving round with them");
  await page.evaluate(() => {
    (globalThis as unknown as { __fly: { settings: { statsPanel: string } } }).__fly.settings.statsPanel = "always";
  });
  const stats = await waitFor(page, "statsPanel=top-left,eyesInset=top-right,nerves=top-right", 5000);
  const counted = /walked ([\d.]+) meals (\d+) takeoffs (\d+) flown ([\d.]+) groomed ([\d.]+)/.exec(stats.day);
  assert.ok(counted, `its day: ${stats.day}`);
  // A fresh browser: today is this run, counted once.
  assert.equal(counted[3], stats.takeoffs, "take-offs today, as the fly's life counted them");
  assert.equal(counted[2], stats.meals, "meals today, as the fly's life counted them");
  console.log(`  its day: ${stats.day}`);
  await page.evaluate(() => {
    const settings = (globalThis as unknown as { __fly: { settings: { statsPanel: string; wallpaperAfter: number } } }).__fly.settings;
    settings.statsPanel = "wallpaper";
    settings.wallpaperAfter = 2;
  });
  await waitFor(page, "statsPanel=hidden", 3000);
  const together = await waitFor(page, "wallpaper=true,statsPanel~^(top|bottom)-(left|right)$,eyesInset~^(top|bottom)-(left|right)$", 10_000);
  assert.equal(together.statsPanel.split("-")[0], together.eyesInset.split("-")[0], "at the same edge as the others");
  assert.notEqual(together.statsPanel, together.eyesInset, "across the screen from them");
  await page.evaluate(() => {
    const settings = (globalThis as unknown as { __fly: { settings: { statsPanel: string; wallpaperAfter: number } } }).__fly.settings;
    settings.statsPanel = "off";
    settings.wallpaperAfter = 0;
  });
  await press("ArrowLeft");
  await waitFor(page, "wallpaper=false,statsPanel=hidden,tool=view", 3000);

  step("carried to each place in turn with the Place tool, it lives there, and the frame keeps to its budget");
  await toTool("place");
  for (const place of PLACES.slice(1)) {
    await press("ArrowDown");
    await press("Enter");
    const arrived = await waitFor(page, `place=${place.id},moving=`, 30_000);
    assert.equal(arrived.prints, "0", "its prints are left behind where it was");
    await waitFor(page, "mode~standing|walking");
    await waitForGameTime(page, 3);
  }
  await press("ArrowUp", PLACES.length - 1);
  await press("Enter");
  await waitFor(page, `place=${PLACES[0].id},moving=`, 30_000);

  step("the weather outside: on Now it is what the Apple TV says, called Outside, and too old an answer goes back to the forecast");
  const before = await readState(page);
  assert.equal(before.outside, "none", "a browser can't tell the weather outside");
  await toTool("weather");
  await press("ArrowUp");
  await waitFor(page, "variant=now,weatherFrom=forecast");
  const fog = { cloudCover: 0.8, precipitation: 0, visibility: 300, wind: 1, condition: "foggy", daylight: true, sunrise: 7, sunset: 17, noon: 12 };
  await page.evaluate((c) => (globalThis as unknown as { __fly: { outside: { feed(c: unknown): void } } }).__fly.outside.feed({ ...c, observedAt: Date.now() - 60_000 }), fog);
  const foggy = await waitFor(page, "outside=fed,weatherFrom=outside,weather=mist,outsideAge<120");
  console.log(`  fog outside, ${foggy.outsideAge} s old: ${foggy.weather}`);
  await page.evaluate((c) => (globalThis as unknown as { __fly: { outside: { feed(c: unknown): void } } }).__fly.outside.feed({ ...c, observedAt: Date.now() - 3 * 3_600_000 }), fog);
  await waitFor(page, "weatherFrom=forecast");
  await page.evaluate(() => (globalThis as unknown as { __fly: { outside: { feed(c: null): void } } }).__fly.outside.feed(null));
  await waitFor(page, "outside=none,outsideAge=");
  // Clear again, kept for the reload at the end.
  await press("ArrowDown");
  await waitFor(page, "variant=clear,weatherFrom=chosen,weather=clear");

  step("Back to the menu, where (on the Apple TV) Back leaves the app");
  await press("Escape");
  await waitFor(page, "screen=title,atRoot=true,eyesInset=hidden,nerves=hidden");

  step("a reload: the settings, the view, the light and the weather as they were left, the shelf on Feed, and the hints for what was used gone");
  await page.reload();
  await disableScreensaver(page);
  await waitFor(page, "brain=running,screen=title", 90_000);
  assert.equal(await page.evaluate(() => (globalThis as unknown as { __fly: Game }).__fly.haptics.enabled), false, "rumble stays off after reloading");
  await press("Enter");
  const again = await waitFor(page, "screen=play");
  assert.deepEqual([again.tool, again.variant, again.view, again.time, again.weather], ["feed", "sugar", "wide", "noon", "clear"]);
  const learned = await page.evaluate(() => JSON.parse(localStorage.getItem("flies.learned") ?? "{}") as Record<string, true>);
  assert.deepEqual(Object.keys(learned).sort(), ["feed", "light", "place", "swoop", "tools", "view", "weather"], "the hints for what was used aren't taught again");

  step(`the frame's budget: at most ${maxCalls} draws and ${maxTriangles.toLocaleString("en-US")} triangles`);
  assert.ok(maxCalls > 0 && maxCalls < MAX_CALLS, `${maxCalls} draws`);
  assert.ok(maxTriangles < MAX_TRIANGLES, `${maxTriangles} triangles`);
  assert.deepEqual(errors, [], "page errors");
  console.log("passed");
} catch (error) {
  failed = true;
  console.error(`failed (${currentStep}):`, error instanceof Error ? error.message : error);
  console.error("state:", JSON.stringify(await readState(page).catch(() => ({}))));
  if (errors.length) console.error("page errors:\n" + errors.join("\n"));
} finally {
  clearInterval(watch);
  await browser.close();
  server?.kill();
}
process.exit(failed ? 1 : 0);
