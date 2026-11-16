// Plays the game in a real (GPU-rendered, headless) Chromium with the real
// brain: boots it, waits for the brain, walks the menus with the keys, feeds
// the fly and checks it tasted and ate, throws the ball until the fly takes
// off, checks the wallpaper comes and goes with what it sees in a corner,
// carries the fly to every place, reloads and finds the settings, the shelf
// and what the hints taught as it left them, and holds the frame to its draw
// budget throughout. It holds the light at midday and the weather clear, so
// that what the fly does answers what the test does.
//
//   npm run e2e            (starts its own Vite server)
//   npm run e2e -- --url http://localhost:5173/
//
// Needs the connectome (npm run brain:fetch) and a Playwright Chromium.

import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { gameUp, openGame, readState, startServer, waitFor } from "../../../scripts/play.ts";
import { PLACES } from "../src/places/catalog.ts";

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
    await page.waitForTimeout(150);
  }
};
/** Steps along the shelf to a tool, however many tools there are, one step at a time as the game shows each. */
const toTool = async (id: string) => {
  for (let i = 0; i < 12; i++) {
    const at = (await readState(page)).tool;
    if (at === id) return;
    await page.keyboard.press("ArrowRight");
    await waitFor(page, `tool~^(?!${at}$)`, 2000);
  }
  await waitFor(page, `tool=${id}`, 1000);
};
const step = (name: string) => console.log(`· ${name}`);
let failed = false;

try {
  step("the brain wakes and the title appears");
  const awake = await waitFor(page, "brain=running,screen=title", 90_000);
  assert.equal(awake.neurons, "166700");
  assert.equal(awake.atRoot, "true");
  assert.equal(awake.focus, "play");
  assert.equal(awake.eyesInset, "hidden", "not over the title");

  step("the menus: settings and each of its pages, about, inside its brain, and back each time");
  await press("ArrowDown", 4);
  await waitFor(page, "focus=settings");
  await press("ArrowDown");
  await waitFor(page, "focus=settings");
  await press("Enter");
  await waitFor(page, "screen=settings,focus=wallpaper,atRoot=false");
  await press("Enter");
  await waitFor(page, "screen=wallpaper,stack=title>settings>wallpaper,focus=wallpaperAfter");
  await press("ArrowDown", 3);
  await waitFor(page, "focus=eyesInset");
  await press("Escape");
  await waitFor(page, "screen=settings,focus=wallpaper");
  await press("ArrowDown");
  await press("Enter");
  await waitFor(page, "screen=sound,focus=effects");
  // Kept for the reload at the end.
  await press("ArrowLeft");
  await press("Escape");
  await waitFor(page, "screen=settings,focus=sound");
  await press("ArrowDown");
  await press("Enter");
  await waitFor(page, "screen=picture,focus=pixels");
  await press("ArrowDown", 3);
  await waitFor(page, "focus=stats");
  await press("Escape");
  await press("Escape");
  await waitFor(page, "screen=title,focus=settings");
  await press("ArrowUp");
  await press("Enter");
  await waitFor(page, "screen=about");
  await press("ArrowDown", 3);
  await press("Escape");
  await waitFor(page, "screen=title");
  await press("ArrowUp");
  await press("Enter");
  await waitFor(page, "screen=brain");
  await page.waitForTimeout(500);
  await press("Escape");
  await waitFor(page, "screen=title,focus=brain");
  await press("ArrowUp", 2);
  await waitFor(page, "focus=play");

  step("play: the fly is on the table, and its brain is moving it");
  await press("Enter");
  await waitFor(page, "screen=play,stack=title>play,atRoot=false");

  step("clear weather and daylight: no rain must touch the fly, and the dark ball needs a bright background for it to see");
  await toTool("weather");
  await press("ArrowDown");
  await waitFor(page, "variant=clear");
  await waitFor(page, "weather=clear", 10_000);
  await toTool("light");
  await press("ArrowDown", 2);
  await waitFor(page, "time=noon");
  // The light changing so much can make it jump (its brain's answer): let it come down and settle before the honey drops at its mouth.
  await page.waitForTimeout(3000);
  await waitFor(page, "mode~standing|walking", 10_000);
  await toTool("feed");

  step("feeding: honey at its mouth, tasted, eaten");
  await press("ArrowDown");
  await waitFor(page, "tool=feed,variant=honey");
  await press("Enter");
  await waitFor(page, "food>0", 5000);
  await waitFor(page, "sweet>0", 10_000);
  await waitFor(page, "eaten>0.05", 20_000);
  const fed = await readState(page);
  console.log(`  tasted (sweet ${fed.sweet}), feed command ${fed.feed}, ate ${fed.eaten}`);

  step("startle: the ball dives at it until it takes off (its brain decides; it doesn't every time)");
  await press("ArrowRight");
  await waitFor(page, "tool=swoop");
  let tookOff = false;
  for (let throws = 1; throws <= 8 && !tookOff; throws++) {
    const before = Number((await readState(page)).takeoffs);
    await press("Enter");
    await page.waitForTimeout(2400);
    const after = await readState(page);
    tookOff = Number(after.takeoffs) > before;
    console.log(`  throw ${throws}: escape peak ${after.escapePeak}, ${tookOff ? "took off" : "stayed"}`);
  }
  assert.ok(tookOff, "the fly never took off");
  await waitFor(page, "mode~standing|walking", 10_000);

  step("pause with Play/Pause, carry on with Play/Pause");
  await press(" ");
  await waitFor(page, "screen=pause,focus=resume");
  await press(" ");
  await waitFor(page, "screen=play");

  step("the wallpaper comes when nobody touches the remote, and any press brings the controls back");
  await page.evaluate(() => {
    (globalThis as unknown as { __fly: { settings: { wallpaperAfter: number } } }).__fly.settings.wallpaperAfter = 2;
  });
  await waitFor(page, "wallpaper=true", 10_000);
  const corner = await waitFor(page, "wallpaper=true,eyesInset~^(top|bottom)-(left|right)$", 5000);
  console.log(`  what it sees, in the ${corner.eyesInset} corner`);
  await page.waitForTimeout(1500);
  await press("ArrowRight");
  const back = await waitFor(page, "wallpaper=false", 3000);
  assert.equal(back.tool, "swoop", "the press that woke it did nothing else");
  assert.equal(back.screen, "play");

  step("what it sees: only in the wallpaper by default; on Always while playing too, but never over the full picture or a menu");
  await waitFor(page, "eyesInset=hidden", 3000);
  await page.evaluate(() => {
    const settings = (globalThis as unknown as { __fly: { settings: { wallpaperAfter: number; eyesInset: string } } }).__fly.settings;
    settings.wallpaperAfter = 60;
    settings.eyesInset = "always";
  });
  await waitFor(page, "eyesInset=top-right", 5000);
  await toTool("view");
  await waitFor(page, "tool=view,view=follow");
  await press("ArrowDown", 4);
  await waitFor(page, "view=eyes,eyesInset=hidden", 3000);
  await press("ArrowUp", 4);
  await waitFor(page, "view=follow,eyesInset=top-right", 5000);
  // Kept for the reload at the end.
  await press("ArrowDown");
  await waitFor(page, "view=wide");

  step("carried to each place in turn with the Place tool, it lives there, and the frame keeps to its budget");
  await toTool("place");
  for (const place of PLACES.slice(1)) {
    await press("ArrowDown");
    await press("Enter");
    await waitFor(page, `place=${place.id},moving=`, 30_000);
    await waitFor(page, "mode~standing|walking", 10_000);
    await page.waitForTimeout(3000);
  }
  await press("ArrowUp", PLACES.length - 1);
  await press("Enter");
  await waitFor(page, `place=${PLACES[0].id},moving=`, 30_000);

  step("back to the title through the pause menu, where Back leaves the app");
  await press("Escape");
  await waitFor(page, "screen=pause,eyesInset=hidden");
  await press("ArrowDown", 4);
  await waitFor(page, "focus=title");
  await press("Enter");
  await waitFor(page, "screen=title,atRoot=true");

  step("a reload: the settings, the view, the light and the weather as they were left, the shelf on Feed, and the hints for what was used gone");
  await page.reload();
  await gameUp(page);
  await waitFor(page, "brain=running,screen=title", 90_000);
  await press("Enter");
  const again = await waitFor(page, "screen=play");
  assert.deepEqual([again.tool, again.variant, again.view, again.time, again.weather], ["feed", "sugar", "wide", "noon", "clear"]);
  const effects = await page.evaluate(() => (globalThis as unknown as { __fly: { settings: { effects: number } } }).__fly.settings.effects);
  assert.equal(effects, 6, "the sounds turned down");
  const learned = await page.evaluate(() => JSON.parse(localStorage.getItem("apple-tv-fly.learned") ?? "{}") as Record<string, true>);
  assert.deepEqual(Object.keys(learned).sort(), ["feed", "place", "swoop", "tools"], "the hints for what was used aren't taught again");

  step(`the frame's budget: at most ${maxCalls} draws and ${maxTriangles.toLocaleString("en-US")} triangles`);
  assert.ok(maxCalls > 0 && maxCalls < MAX_CALLS, `${maxCalls} draws`);
  assert.ok(maxTriangles < MAX_TRIANGLES, `${maxTriangles} triangles`);
  assert.deepEqual(errors, [], "page errors");
  console.log("passed");
} catch (error) {
  failed = true;
  console.error("failed:", error instanceof Error ? error.message : error);
  console.error("state:", JSON.stringify(await readState(page).catch(() => ({}))));
  if (errors.length) console.error("page errors:\n" + errors.join("\n"));
} finally {
  clearInterval(watch);
  await browser.close();
  server?.kill();
}
process.exit(failed ? 1 : 0);
