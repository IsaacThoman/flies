// Plays the game with fingers and with a mouse, as play.e2e.ts plays it with
// the remote's keys, with the real brain in a real (GPU-rendered, headless)
// Chromium.
//
// With fingers, on a phone held upright with a notch and a home indicator:
// the menus are tapped, the tools picked from the shelf and their kinds from
// the label's arrows, honey is dropped by tapping the table in front of the
// fly and is tasted and eaten, the feather strokes it while a finger is held
// on it, a puff blows while a finger is held by it, a pinch brings the camera
// in and takes it out, a drag across the air turns it, the phone is turned on
// its side without the world being built again, a tap wakes the wallpaper
// and does nothing else, and Settings are changed by tapping.
//
// With a mouse, in a desktop window: the hand is under the cursor, a click
// drops food there, the wheel steps the camera's views, a right-drag turns
// it, the number keys pick tools, and a nudge of the desk doesn't wake the
// wallpaper while a mouse moved as if meant does.
//
//   node apps/web/e2e/pointer.e2e.ts [--url http://localhost:5173/]

import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import type { Page } from "playwright";
import { Fingers, canvasPoint, openGame, readState, screenOf, startServer, targetOf, waitFor } from "../../../scripts/play.ts";

/** How long a camera turned by hand may take to ease back, ms: it holds 0.8 s, then its spring takes about 5 s of the game's time, which a loaded machine (frames over 100 ms are cut short) stretches. */
const EASE_BACK = 20_000;
/** The frame's budget on the Apple TV, as play.e2e.ts holds it to. */
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

const step = (name: string) => console.log(`· ${name}`);
let failed = false;

/** The game's own object in the page, for reading what isn't on the canvas's data-*. */
const game = <T>(page: Page, js: string) => page.evaluate(`(() => { const g = globalThis.__fly; return ${js}; })()`) as Promise<T>;

/** Watches the frame's cost for as long as a page is open. */
function budget(page: Page) {
  const seen = { calls: 0, triangles: 0 };
  const watch = setInterval(() => {
    readState(page).then((s) => {
      seen.calls = Math.max(seen.calls, Number(s.calls) || 0);
      seen.triangles = Math.max(seen.triangles, Number(s.triangles) || 0);
    }, () => {});
  }, 100);
  return { seen, stop: () => clearInterval(watch) };
}

async function fingers() {
  const { browser, page, errors } = await openGame({ url, device: "iPhone 15" });
  // What a native host on a phone with a notch says it covers.
  await page.setViewportSize({ width: 393, height: 852 });
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__flySafeArea = { top: 59, right: 0, bottom: 34, left: 0 };
    window.dispatchEvent(new Event("resize"));
  });
  const cost = budget(page);
  const touch = await Fingers.on(page);
  const tapOn = async (kind: string, index?: number) => touch.tap(await targetOf(page, kind, index));
  const tools = await game<string[]>(page, "[...Array(16).keys()].map((i) => { const h = g.hands; const at = h.tool; h.tool = i; const id = h.current?.id; h.tool = at; return id; }).filter(Boolean)");
  const tool = async (id: string) => {
    await tapOn("tool", tools.indexOf(id));
    await waitFor(page, `tool=${id}`, 3000);
  };
  try {
    step("fingers: the brain wakes, the title is tapped");
    const awake = await waitFor(page, "brain=running,screen=title", 90_000);
    assert.equal(awake.device, "touch");
    assert.equal(awake.frame, "376x815", "the phone's shape, square pixels, the TV's number of them");
    await tapOn("row", 0);
    await waitFor(page, "screen=play,stack=title>play");

    step("fingers: clear weather and midday, picked from the shelf and the label's arrows");
    await tool("weather");
    await tapOn("kind", 1);
    await waitFor(page, "variant=clear");
    await tool("light");
    await tapOn("kind", 1);
    await tapOn("kind", 1);
    await waitFor(page, "time=noon", 5000);
    await page.waitForTimeout(3000);
    await waitFor(page, "mode~standing|walking", 10_000);

    step("fingers: honey, dropped by tapping the table in front of the fly, is tasted and eaten");
    await tool("feed");
    await tapOn("kind", 1);
    await waitFor(page, "variant=honey");
    // The hand waits in front of its mouth until moved: tap there. It may walk on before it tastes it (its brain's doing): then again where its mouth is now.
    let tasted = false;
    for (let drop = 1; drop <= 5 && !tasted; drop++) {
      await game(page, "g.hands.release()");
      await page.waitForTimeout(400);
      await touch.tap(await screenOf(page, "hand"));
      await waitFor(page, `food>${drop - 1}`, 5000);
      tasted = await waitFor(page, "sweet>0", 8000).then(() => true, () => false);
    }
    assert.ok(tasted, "it never tasted the honey");
    await waitFor(page, "eaten>0.05", 20_000);

    step("fingers: a finger held on the fly strokes it with the feather");
    await tool("feather");
    const stroked = touch.tap(await screenOf(page, "fly"), 1500);
    const felt = await waitFor(page, "touch>0.9", 1400).then(() => true, () => false);
    await stroked;
    assert.ok(felt, "the feather's stroke");

    step("fingers: a finger held beside it blows");
    await tool("blow");
    const blown = touch.tap(await screenOf(page, "fly"), 1500);
    const puffed = await waitFor(page, "wind>0.05", 1400).then(() => true, () => false);
    await blown;
    assert.ok(puffed, "the puff");

    step("fingers: a pinch brings the camera in, and takes it out");
    await waitFor(page, "view=follow");
    await touch.pinch([0.5, 0.35], 0.15, 0.6);
    await waitFor(page, "view=close", 3000);
    await touch.pinch([0.5, 0.35], 0.7, 0.08);
    await waitFor(page, "view~wide|table", 3000);

    step("fingers: a drag across the air turns the camera round the fly, and it eases back when let go");
    // Somewhere above the table's edge, where nothing is under the finger but the view.
    const sky = await game<[number, number] | null>(
      page,
      `(() => {
        const c = g.director.camera;
        const hit = { point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, solid: -1, t: 0 };
        const { width, height } = g.shape.design;
        for (let y = 0.08; y < 0.6; y += 0.02) for (let x = 0.1; x < 0.7; x += 0.05) {
          const d = new c.position.constructor(x * 2 - 1, 1 - y * 2, 0.5).unproject(c).sub(c.position).normalize();
          if (!g.life.world.raycast(c.position, d, hit) && !g.overlay.hits.at(x * width, y * height, 12)) return [x, y];
        }
        return null;
      })()`,
    );
    assert.ok(sky, "some air to drag across");
    await touch.drag(sky, [sky[0] + 0.25, sky[1] + 0.04], 500);
    await waitFor(page, "looking=true", 1000);
    await waitFor(page, "looking=false", EASE_BACK);

    step("fingers: the menu's button, its back button, and Settings changed by tapping");
    await tapOn("menu");
    await waitFor(page, "screen=pause");
    await tapOn("row", 3);
    await waitFor(page, "screen=settings");
    await tapOn("row", await game<number>(page, "g.screens.settings.menu.items.findIndex((i) => i.id === 'picture')"));
    await waitFor(page, "screen=picture");
    const pixels = await game<number>(page, "g.screens.picture.menu.items.findIndex((i) => i.id === 'pixels')");
    await tapOn("step", pixels);
    await page.waitForTimeout(300);
    assert.equal(await game<string>(page, "g.settings.pixels"), "chunky", "the right arrow of Pixels");
    await tapOn("step", pixels);
    await page.waitForTimeout(300);
    assert.equal(await game<string>(page, "g.settings.pixels"), "chunkier");
    await tapOn("row", pixels);
    await page.waitForTimeout(300);
    assert.equal(await game<string>(page, "g.settings.pixels"), "classic", "a tap on the row steps round to the start");
    await tapOn("back");
    await waitFor(page, "screen=settings");
    // Outside the pane is Back too.
    await touch.tap([0.5, 0.97]);
    await waitFor(page, "screen=pause");
    await touch.tap([0.5, 0.97]);
    await waitFor(page, "screen=play", 3000);

    step("fingers: turned on its side, the screen is laid out again and the world isn't built again");
    await game(page, "(g.stage.set.group.userData.mark = 'still here')");
    await page.setViewportSize({ width: 852, height: 393 });
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>).__flySafeArea = { top: 0, right: 59, bottom: 21, left: 59 };
      window.dispatchEvent(new Event("resize"));
    });
    await waitFor(page, "frame=816x376", 3000);
    assert.equal(await game<string>(page, "g.stage.set.group.userData.mark"), "still here");
    await tool("feed");

    step("fingers: the wallpaper comes, and a tap brings the controls back and does nothing else");
    await game(page, "(g.settings.wallpaperAfter = 2)");
    await waitFor(page, "wallpaper=true", 10_000);
    const before = await readState(page);
    await touch.tap([0.5, 0.6]);
    const woke = await waitFor(page, "wallpaper=false", 3000);
    await page.waitForTimeout(500);
    assert.equal((await readState(page)).food, before.food, "no food dropped by the tap that woke it");
    assert.equal(woke.tool, "feed");
    await game(page, "(g.settings.wallpaperAfter = 60)");

    cost.stop();
    assert.ok(cost.seen.calls > 0 && cost.seen.calls < MAX_CALLS, `${cost.seen.calls} draws`);
    assert.ok(cost.seen.triangles < MAX_TRIANGLES, `${cost.seen.triangles} triangles`);
    assert.deepEqual(errors, [], "page errors");
  } finally {
    cost.stop();
    await browser.close();
  }
}

async function mouse() {
  const { browser, page, errors } = await openGame({ url, width: 1280, height: 720 });
  const cost = budget(page);
  const click = async (kind: string, index?: number) => {
    const p = await canvasPoint(page, await targetOf(page, kind, index));
    await page.mouse.click(p.x, p.y);
  };
  const moveTo = async (x: number, y: number, steps = 8) => {
    const p = await canvasPoint(page, [x, y]);
    await page.mouse.move(p.x, p.y, { steps });
  };
  try {
    step("mouse: the title is clicked");
    await waitFor(page, "brain=running,screen=title", 90_000);
    await moveTo(0.3, 0.3);
    await moveTo(0.7, 0.6);
    await waitFor(page, "device=mouse");
    await click("row", 0);
    await waitFor(page, "screen=play");

    step("mouse: the hand is under the cursor, and the system's cursor is hidden over the table");
    // Over the table, well away from the fly (over the fly, the hand is on the fly).
    const fly = await screenOf(page, "fly");
    const spot: [number, number] = [fly[0] < 0.5 ? 0.72 : 0.28, 0.64];
    await moveTo(...spot);
    await waitFor(page, "pointer=free", 2000);
    assert.equal(await page.evaluate(() => (document.getElementById("game") as HTMLCanvasElement).style.cursor), "none");
    const hand = await screenOf(page, "hand");
    assert.ok(Math.hypot(hand[0] - spot[0], hand[1] - spot[1]) < 0.01, `the hand at ${hand.map((v) => v.toFixed(3))}`);

    step("mouse: a click drops food where it points");
    const food = Number((await readState(page)).food);
    await page.mouse.down();
    await page.mouse.up();
    await waitFor(page, `food>${food}`, 4000);

    step("mouse: the wheel steps the views, a right-drag turns the camera and holds it there until let go");
    await page.mouse.wheel(0, 100);
    await waitFor(page, "view=wide", 3000);
    await page.mouse.wheel(0, -100);
    await waitFor(page, "view=follow", 3000);
    const a = await canvasPoint(page, [0.45, 0.7]);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(a.x + 200, a.y, { steps: 10 });
    await waitFor(page, "looking=true", 1000);
    // Held still, it stays where it was turned to; only let go does it ease back.
    const turned = await game<number>(page, "g.director.look.yaw");
    await page.waitForTimeout(1500);
    assert.equal(await game<number>(page, "g.director.look.yaw"), turned, "held, the camera doesn't ease back");
    await page.mouse.up({ button: "right" });
    await waitFor(page, "looking=false", EASE_BACK);

    step("keys: a number picks a tool, and the hints are a keyboard's");
    await page.keyboard.press("2");
    await waitFor(page, "tool=swoop,device=keys", 2000);
    await page.keyboard.press("1");
    await waitFor(page, "tool=feed", 2000);

    step("mouse: in the wallpaper a nudge of the desk changes nothing; a mouse moved as if meant brings the controls back");
    await moveTo(0.5, 0.5, 4);
    await game(page, "(g.settings.wallpaperAfter = 2)");
    await waitFor(page, "wallpaper=true", 10_000);
    const p = await canvasPoint(page, [0.5, 0.5]);
    await page.mouse.move(p.x + 3, p.y + 2, { steps: 2 });
    await page.waitForTimeout(800);
    assert.equal((await readState(page)).wallpaper, "true", "a nudge doesn't wake it");
    await page.mouse.move(p.x + 260, p.y + 80, { steps: 10 });
    await waitFor(page, "wallpaper=false", 2000);
    await game(page, "(g.settings.wallpaperAfter = 60)");

    cost.stop();
    assert.ok(cost.seen.calls > 0 && cost.seen.calls < MAX_CALLS, `${cost.seen.calls} draws`);
    assert.deepEqual(errors, [], "page errors");
  } finally {
    cost.stop();
    await browser.close();
  }
}

try {
  await fingers();
  await mouse();
  console.log("passed");
} catch (error) {
  failed = true;
  console.error("failed:", error instanceof Error ? error.message : error);
}
server?.kill();
process.exit(failed ? 1 : 0);
