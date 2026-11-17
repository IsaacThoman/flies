// Plays the game with fingers and with a mouse, as play.e2e.ts plays it with
// the remote's keys, with the real brain in a real (GPU-rendered, headless)
// Chromium.
//
// With fingers, on a phone held upright with a notch and a home indicator:
// the menus are tapped, the tools picked from the shelf and their kinds from
// the label's arrows, honey is dropped by tapping the table in front of the
// fly and reaches its taste senses and feed command, the feather strokes it while a finger is held
// on it, a puff blows while a finger is held by it, a pinch brings the camera
// in and takes it out, a drag across the air turns it and it stays there a
// while before the cameraman takes it again, the phone is turned on its side
// without the world being built again, a tap wakes the wallpaper and does
// nothing else, and Settings are changed by tapping its tabs and arrows.
//
// With a mouse, in a desktop window: hovering over the menu moves no focus
// and shows no ring, and the first arrow shows it; the hand is under the
// cursor, a click drops food there, the wheel brings the camera smoothly in
// and out, a drag from the table, a right-drag and a middle-drag turn it and
// it stays where it was put, a double click in the air or R gives it back, a trackpad's pinch zooms, the
// number keys pick tools and + held zooms, and a nudge of the desk doesn't
// wake the wallpaper while a mouse moved as if meant does.
//
//   node apps/web/e2e/pointer.e2e.ts [--url http://localhost:5173/]

import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import type { Page } from "playwright";
import { Fingers, canvasPoint, openGame, readState, screenOf, startServer, targetOf, waitFor, waitForGameTime } from "../../../scripts/play.ts";

import type { Game } from "../src/game.ts";
import { dropFood, feedHoney } from "./feeding.ts";
import { disableScreensaver } from "./settings.ts";

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

let currentStep = "startup";
const step = (name: string) => { currentStep = name; console.log(`· ${name}`); };
let failed = false;

/** The game's own object in the page, for reading what isn't on the canvas's data-*. */
const game = <T>(page: Page, js: string) => page.evaluate(`(() => { const g = globalThis.__fly; return ${js}; })()`) as Promise<T>;

/** Drags the mouse with the right button between points on the screen (0 to 1 across and down). */
async function rightDrag(page: Page, from: [number, number], to: [number, number]) {
  const a = await canvasPoint(page, from);
  const b = await canvasPoint(page, to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(b.x, b.y, { steps: 10 });
  await page.mouse.up({ button: "right" });
}

/** Somewhere above the table's edge, where nothing is under the pointer, or near it, but the view. */
async function airOf(page: Page): Promise<[number, number] | null> {
  const sky = await game<[number, number] | null>(
    page,
    `(() => {
      const c = g.director.camera;
      const hit = { point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, solid: -1, t: 0 };
      const { width, height } = g.shape.design;
      // Air with air all round it, so that the camera following the fly a little doesn't put the table there.
      const air = (x, y) => !g.life.world.raycast(c.position, new c.position.constructor(x * 2 - 1, 1 - y * 2, 0.5).unproject(c).sub(c.position).normalize(), hit) && !g.overlay.hits.at(x * width, y * height, 12);
      for (let y = 0.08; y < 0.7; y += 0.02) for (let x = 0.1; x < 0.9; x += 0.05) {
        if (air(x, y) && air(x - 0.06, y) && air(x + 0.06, y) && air(x, y - 0.06) && air(x, y + 0.08)) return [x, y];
      }
      return null;
    })()`,
  );
  return sky;
}

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
  await disableScreensaver(page);
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
    await waitFor(page, `tool=${id}`);
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
    await waitFor(page, "time=noon");
    await waitForGameTime(page, 3);
    await waitFor(page, "mode~standing|walking");

    step("fingers: honey, dropped by tapping in front of the fly, reaches taste senses and produces a feed command");
    await tool("feed");
    await tapOn("kind", 1);
    await waitFor(page, "variant=honey");
    await feedHoney(page, () => dropFood(page, async () => touch.tap(await screenOf(page, "hand"))));

    step("fingers: Clear dropped removes offerings without taking the place's food");
    for (let i = 0; i < 3; i++) await tapOn("kind", 1);
    await waitFor(page, "variant=clear");
    const placeFoods = await game<number>(page, "g.life.pantry.foods.filter(f => f.kind === 'patch' || f.kind === 'found').length");
    await touch.tap(await screenOf(page, "hand"));
    await page.waitForFunction(() => {
      const g = (globalThis as unknown as { __fly: Game }).__fly;
      return g.hands.falling.length === 0 && !g.life.pantry.foods.some(f => f.kind !== "patch" && f.kind !== "found");
    });
    assert.equal(await game<number>(page, "g.life.pantry.foods.length"), placeFoods);

    step("fingers: a finger held on the fly strokes it with the feather");
    await tool("feather");
    await touch.hold(await screenOf(page, "fly"), () => waitFor(page, "touch>0.9"));

    step("fingers: a finger held beside it blows");
    await tool("blow");
    await touch.hold(await screenOf(page, "fly"), () => waitFor(page, "wind>0.05"));

    step("fingers: a pinch brings the camera in, smoothly and as far as the fingers go, and takes it out");
    const follow = Number((await waitFor(page, "view=follow")).reach);
    await touch.pinch([0.5, 0.35], 0.15, 0.6);
    const pinched = await waitFor(page, "view=close");
    assert.ok(Number(pinched.reach) < follow / 2.5, `nearer by about the spread: ${follow} → ${pinched.reach} mm`);
    await touch.pinch([0.5, 0.35], 0.7, 0.08);
    await waitFor(page, "view~wide|table");

    step("fingers: a drag across the air turns the camera round the fly; it stays there a while, then the cameraman has it again");
    // A far, downward-looking shot can contain only table. Use the same drag that
    // works from the table to reveal air, rather than assuming the fly left a horizon in view.
    await waitForGameTime(page, 0.6);
    let sky = await airOf(page);
    for (let turn = 1; turn <= 6 && !sky; turn++) {
      await touch.drag([0.5, 0.6], [0.65, 0.3], 500);
      await waitForGameTime(page, 0.6);
      sky = await airOf(page);
      console.log(`  camera setup ${turn}: ${sky ? "air in view" : "table fills the view"}`);
    }
    assert.ok(sky, "no air to point at after six camera drags");
    await touch.drag(sky, [sky[0] + 0.25, sky[1] + 0.04], 500);
    await waitFor(page, "looking=true");
    await waitForGameTime(page, 2);
    assert.equal((await readState(page)).looking, "true", "it stays where it was put");
    await waitFor(page, "looking=false");

    step("fingers: the menu's button, its back button, and Settings changed by tapping");
    await tapOn("menu");
    await waitFor(page, "screen=title,ring=false");
    await tapOn("row", 2);
    await waitFor(page, "screen=settings,tab=wallpaper");
    await tapOn("tab", 2);
    await waitFor(page, "tab=picture");
    const pixels = await game<number>(page, "g.screens.settings.menu.items.findIndex((i) => i.id === 'pixels')");
    await tapOn("step", pixels);
    await waitFor(page, "pixels=chunky");
    await tapOn("step", pixels);
    await waitFor(page, "pixels=chunkier");
    await tapOn("row", pixels);
    await waitFor(page, "pixels=classic");
    // Outside the pane is Back.
    await touch.tap([0.5, 0.97]);
    await waitFor(page, "screen=title");
    await tapOn("row", 4);
    await waitFor(page, "screen=about");
    await tapOn("back");
    await waitFor(page, "screen=title");
    await tapOn("row", 0);
    await waitFor(page, "screen=play");

    step("fingers: turned on its side, the screen is laid out again and the world isn't built again");
    await game(page, "(g.stage.set.group.userData.mark = 'still here')");
    await page.setViewportSize({ width: 852, height: 393 });
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>).__flySafeArea = { top: 0, right: 59, bottom: 21, left: 59 };
      window.dispatchEvent(new Event("resize"));
    });
    await waitFor(page, "frame=816x376");
    assert.equal(await game<string>(page, "g.stage.set.group.userData.mark"), "still here");
    await tool("feed");

    step("fingers: the wallpaper comes, and a tap brings the controls back and does nothing else");
    await game(page, "(g.settings.wallpaperAfter = 2)");
    await waitFor(page, "wallpaper=true");
    const before = await readState(page);
    await touch.tap([0.5, 0.6]);
    const woke = await waitFor(page, "wallpaper=false");
    await waitForGameTime(page, 0.5);
    assert.equal((await readState(page)).food, before.food, "no food dropped by the tap that woke it");
    assert.equal(woke.tool, "feed");
    await game(page, "(g.settings.wallpaperAfter = 0)");

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
  await disableScreensaver(page);
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
    step("mouse: hovering over the menu moves no focus and shows no ring; the first arrow shows it where it was; a click acts on what it clicks");
    await waitFor(page, "brain=running,screen=title", 90_000);
    await moveTo(0.3, 0.3);
    for (const row of [4, 3, 2, 1]) {
      const at = await targetOf(page, "row", row);
      await moveTo(...at, 4);
    }
    await waitFor(page, "device=mouse");
    assert.deepEqual([(await readState(page)).focus, (await readState(page)).ring], ["play", "false"]);
    await page.keyboard.press("ArrowDown");
    await waitFor(page, "ring=true,focus=play,device=keys");
    await page.keyboard.press("ArrowDown");
    await waitFor(page, "focus=watch");
    await click("row", 2);
    await waitFor(page, "screen=settings,ring=false");
    // A right click is Back.
    const p0 = await canvasPoint(page, [0.5, 0.5]);
    await page.mouse.click(p0.x, p0.y, { button: "right" });
    await waitFor(page, "screen=title,focus=settings");
    await click("row", 0);
    await waitFor(page, "screen=play");

    step("mouse: the hand is under the cursor, and the system's cursor is hidden over the table");
    // Over the table, well away from the fly (over the fly, the hand is on the fly).
    const fly = await screenOf(page, "fly");
    const spot: [number, number] = [fly[0] < 0.5 ? 0.72 : 0.28, 0.64];
    await moveTo(...spot);
    await waitFor(page, "pointer=free");
    assert.equal(await page.evaluate(() => (document.getElementById("game") as HTMLCanvasElement).style.cursor), "none");
    await page.waitForFunction(([x, y]) => {
      const g = (globalThis as unknown as { __fly: Game }).__fly;
      const p = g.hands.pointer;
      const v = g.director.camera.position.clone().set(p.x, p.y, p.z).project(g.director.camera);
      return Math.hypot((v.x + 1) / 2 - x, (1 - v.y) / 2 - y) < 0.01;
    }, spot, { timeout: 60_000 });

    step("mouse: a click drops food where it points");
    await dropFood(page, async () => {
      await page.mouse.down();
      await page.mouse.up();
    });

    step("mouse: each click of the wheel brings the camera a little nearer, smoothly, and back out; it stays where it is left");
    const start = Number((await waitFor(page, "view=follow")).reach);
    await moveTo(0.5, 0.3);
    let last = start;
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, -100);
      const now = Number((await waitFor(page, `reach<${last - 0.1}`)).reach);
      assert.ok(now > last / 1.3, `a step, not a jump: ${last} → ${now} mm`);
      // Let this click finish before measuring the next: unfinished glides add together.
      await waitForGameTime(page, 0.6);
      last = Number((await readState(page)).reach);
    }
    await waitFor(page, "view=close");
    // Each click eases in over a moment; once in, left there, it stays there.
    await waitForGameTime(page, 0.5);
    last = Number((await readState(page)).reach);
    await waitForGameTime(page, 1.5);
    assert.equal(Number((await readState(page)).reach), last, "left there, it stays there");
    for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 100);
    await waitFor(page, `view=follow,reach>${start - 0.2},reach<${start + 0.2}`);

    step("mouse: a trackpad's pinch, and + held, bring it in too");
    await page.keyboard.down("Control");
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -8);
    await page.keyboard.up("Control");
    await waitFor(page, `reach<${start - 2}`);
    await page.keyboard.down("Equal");
    await waitForGameTime(page, 0.5);
    await page.keyboard.up("Equal");
    await waitFor(page, "view=close");
    await page.keyboard.press("r");
    await waitFor(page, `view=close,looking=false`);

    step("mouse: a drag from the table, a right-drag and a middle-drag turn the camera, and drop nothing; a double click in the air, or R, gives it back");
    for (const button of ["left", "right", "middle"] as const) {
      const food = (await readState(page)).food;
      const a = await canvasPoint(page, [0.45, 0.7]);
      await page.mouse.move(a.x, a.y);
      await page.mouse.down({ button });
      await page.mouse.move(a.x + 200, a.y, { steps: 10 });
      await waitFor(page, "looking=true");
      assert.equal(await page.evaluate(() => (document.getElementById("game") as HTMLCanvasElement).style.cursor), "grabbing");
      await page.mouse.up({ button });
      await waitForGameTime(page, 0.3);
      assert.equal((await readState(page)).food, food, `${button}: no food dropped`);
      if (button === "left") {
        // A mouse orbits freely: long after a finger's turn would have gone back to the cameraman, it is still where it was put.
        await waitForGameTime(page, 7);
        assert.equal((await readState(page)).looking, "true", "it stays where the mouse put it");
      }
      await page.keyboard.press("r");
      await waitFor(page, "looking=false");
    }
    // Turned low and round with the right button until there is some air over the table to double-click, as
    // the game sees it under the pointer (a grab, not the hand): the camera glides on and follows the fly after
    // a drag, so air found a moment before can have the table under it by the time the mouse gets there.
    let at: { x: number; y: number } | null = null;
    for (let i = 0; i < 6 && !at; i++) {
      await rightDrag(page, [0.5, 0.6], [0.65, 0.3]);
      // The game takes the drag a frame or more later, longer on a loaded machine: look for air once it has.
      await waitForGameTime(page, 0.6);
      const sky = await airOf(page);
      if (!sky) continue;
      const point = await canvasPoint(page, sky);
      await page.mouse.move(point.x, point.y);
      await waitForGameTime(page, 0.1);
      if ((await page.evaluate(() => (document.getElementById("game") as HTMLCanvasElement).style.cursor)) === "grab") at = point;
    }
    assert.ok(at, "some air to double-click");
    await waitFor(page, "looking=true");
    await page.mouse.dblclick(at.x, at.y);
    // At once: left alone it would stay where the mouse put it.
    await waitFor(page, "looking=false");

    step("keys: a number picks a tool, and the hints are a keyboard's");
    await page.keyboard.press("2");
    await waitFor(page, "tool=swoop,device=keys");
    await page.keyboard.press("1");
    await waitFor(page, "tool=feed");

    step("mouse: in the wallpaper a nudge of the desk changes nothing; a mouse moved as if meant brings the controls back");
    await moveTo(0.5, 0.5, 4);
    await game(page, "(g.settings.wallpaperAfter = 2)");
    await waitFor(page, "wallpaper=true");
    const p = await canvasPoint(page, [0.5, 0.5]);
    await page.mouse.move(p.x + 3, p.y + 2, { steps: 2 });
    await waitForGameTime(page, 0.8);
    assert.equal((await readState(page)).wallpaper, "true", "a nudge doesn't wake it");
    await page.mouse.move(p.x + 260, p.y + 80, { steps: 10 });
    await waitFor(page, "wallpaper=false");
    await game(page, "(g.settings.wallpaperAfter = 0)");

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
  console.error(`failed (${currentStep}):`, error instanceof Error ? error.message : error);
}
server?.kill();
process.exit(failed ? 1 : 0);
