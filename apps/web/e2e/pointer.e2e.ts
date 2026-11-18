// Plays the game with fingers and with a mouse, as play.e2e.ts plays it with
// the remote's keys, with the real brain in a real (GPU-rendered, headless)
// Chromium.
//
// With fingers, on a phone held upright with a notch and a home indicator:
// the menus are tapped, the tools picked from the shelf and their kinds from
// the label's arrows, honey is dropped by tapping the table in front of the
// fly and reaches its taste senses and feed command, the feather strokes it while a finger is held
// on it, a puff blows while a finger is held by it, a pinch brings the camera
// in and takes it out, a drag across the air turns it and it stays where it
// was put, the phone is turned on its side
// without the world being built again, a tap wakes the wallpaper and does
// nothing else, and Settings are changed by tapping its tabs and arrows.
//
// With a mouse, in a desktop window: hovering over the menu moves no focus
// and shows no ring, and the first arrow shows it; the hand is under the
// cursor, a click drops food there, the wheel brings the camera smoothly in
// and out, a drag from the table, a right-drag and a middle-drag turn it and
// it stays where it was put, a double click in the air or R takes it back to Follow, a trackpad's pinch zooms, the
// number keys pick tools and + held zooms, and a nudge of the desk doesn't
// wake the wallpaper while a mouse moved as if meant does.
//
//   node apps/web/e2e/pointer.e2e.ts [--url http://localhost:5173/]

import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import type { Page } from "playwright";
import { Fingers, canvasPoint, doubleClick, openGame, readState, screenOf, startServer, targetOf, waitFor, waitForGameTime, waitWithin } from "../../../scripts/play.ts";

import type { Game } from "../src/game.ts";
import { FLY_MIDDLE, FLY_REACH } from "../src/tools/aim.ts";
import { FEATHER_REACH, TOOLS } from "../src/tools/hands.ts";
import { dropFood, feedHoney } from "./feeding.ts";

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

/** Turns the camera round to the fly's side, as a drag would, and waits for it to get there. */
async function sideOn(page: Page) {
  await game(page, "g.director.turnBy(Math.atan2(Math.sin(g.life.body.yaw + Math.PI / 2 - g.director.yaw), Math.cos(g.life.body.yaw + Math.PI / 2 - g.director.yaw)), 0)");
  await waitForGameTime(page, 0.5);
}

/** Waits until the camera has turned from a yaw, and gives the yaw it went to once it has settled there. */
async function turnedFrom(page: Page, yaw: string) {
  await page.waitForFunction((yaw) => (document.getElementById("game") as HTMLCanvasElement).dataset.yaw !== yaw, yaw, { timeout: 60_000 });
  await waitForGameTime(page, 0.3);
  return (await readState(page)).yaw;
}

/** The fly can walk behind scenery between input events: hold a sky view until the gesture lands. */
async function withAir(page: Page, gesture: (sky: [number, number]) => Promise<void>) {
  const sky: [number, number] = [0.5, 0.4];
  await game(page, `(() => {
    const y = Math.max(g.life.body.position.y, g.director.camera.position.y) + g.director.camera.far;
    g.director.pinned = { eye: { x: 0, y, z: 0 }, target: { x: 0, y: y + 1, z: -1 } };
  })()`);
  try {
    await waitForGameTime(page, 0.1);
    const air = await game<boolean>(page, `(() => {
      const c = g.director.camera;
      const hit = { point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, solid: -1, t: 0 };
      const { width, height } = g.shape.design;
      // Upward rays from above the fly cannot enter aimAt's generous fly target.
      if (c.position.y <= g.life.body.position.y + ${FLY_MIDDLE} + ${FLY_REACH}) return false;
      return [[0.5, 0.4], [0.75, 0.44]].every(([x, y]) => {
        const d = c.position.clone().set(x * 2 - 1, 1 - y * 2, 0.5).unproject(c).sub(c.position).normalize();
        const hud = g.overlay.hits.at(x * width, y * height, 0);
        return d.y > 0 && !g.life.world.raycast(c.position, d, hit) && (!hud || hud.kind === 'panel');
      });
    })()`);
    assert.ok(air, "the camera fixture points at air clear of the HUD");
    await gesture(sky);
    // Input is consumed on game frames, including on a heavily loaded machine.
    await waitForGameTime(page, 0.3);
  } finally {
    await game(page, "(g.director.pinned = null)");
  }
}

/** A table point must stay on the table while the brain walks the fly and input events arrive. */
async function withTableCamera(page: Page, gesture: () => Promise<void>) {
  await game(page, `(() => {
    const p = g.life.world.place.start;
    const y = p.y ?? 0;
    g.director.pinned = { eye: { x: p.x, y: y + 30, z: p.z }, target: { x: p.x, y, z: p.z - 0.1 } };
  })()`);
  try {
    await waitForGameTime(page, 0.1);
    await gesture();
    await waitForGameTime(page, 0.3);
  } finally {
    await game(page, "(g.director.pinned = null)");
  }
}

/** The spot on the table furthest from the fly, clear of the controls, if the feather put down there wouldn't reach it. */
async function tableAway(page: Page): Promise<[number, number] | null> {
  return game<[number, number] | null>(
    page,
    `(() => {
      const c = g.director.camera;
      const hit = { point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, solid: -1, t: 0 };
      const { width, height } = g.shape.design;
      const fly = g.life.body.position;
      let best = null, furthest = 1.5 * ${FEATHER_REACH};
      for (let y = 0.1; y < 0.9; y += 0.04) for (let x = 0.08; x < 0.95; x += 0.06) {
        const d = new c.position.constructor(x * 2 - 1, 1 - y * 2, 0.5).unproject(c).sub(c.position).normalize();
        if (!g.life.world.raycast(c.position, d, hit) || g.overlay.hits.at(x * width, y * height, 12)) continue;
        const away = Math.hypot(hit.point.x - fly.x, hit.point.z - fly.z);
        if (away > furthest) [best, furthest] = [[x, y], away];
      }
      return best;
    })()`,
  );
}

/**
 * The frame the feather first strokes the fly: the parts it feels then, as data-touched writes them, and how far
 * (mm, across the table) the feather is from the fly's middle, which it has walked from since the feather met it.
 * A frame, not data-touched itself, which is written a few times a second: by then the fly may have walked out
 * from under the finger.
 */
function firstStroke(page: Page) {
  return page.evaluate(() => new Promise<{ touched: string; off: number }>((resolve, reject) => {
    const g = (globalThis as unknown as { __fly: Game }).__fly;
    let next = 0;
    const timer = setTimeout(() => {
      cancelAnimationFrame(next);
      reject(new Error("the feather didn't stroke the fly within 60 s"));
    }, 60_000);
    const frame = () => {
      if (!g.hands.stroking) {
        next = requestAnimationFrame(frame);
        return;
      }
      clearTimeout(timer);
      const sensed = g.life.sensed as unknown as Record<string, number>;
      const touched = Object.keys(sensed).filter((k) => /^touch[A-Z]/.test(k) && sensed[k] > 0).map((k) => `${k.slice(5)} ${sensed[k].toFixed(2)}`).join(" ");
      const p = g.hands.pointer, fly = g.life.body.position;
      resolve({ touched, off: Math.hypot(p.x - fly.x, p.z - fly.z) });
    };
    next = requestAnimationFrame(frame);
  }));
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
  const { browser, page, errors } = await openGame({ url, device: "iPhone 15", steady: true });
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

    step("fingers: clear weather and midday, picked from the shelf and the arrows of the Sky's two labels");
    await tool("sky");
    await touch.tap(await targetOf(page, "kind", 1, 1));
    await waitFor(page, "sky=clock/clear,weather=clear");
    await touch.tap(await targetOf(page, "kind", 1, 0));
    await touch.tap(await targetOf(page, "kind", 1, 0));
    await waitFor(page, "sky=noon/clear,time=noon");
    await waitForGameTime(page, 3);
    await waitWithin(page, "mode~standing|walking", 60);

    step("fingers: honey, dropped by tapping in front of the fly, reaches taste senses and produces a feed command");
    await tool("feed");
    await tapOn("kind", 1);
    await waitFor(page, "variant=honey");
    // The camera stays where it was put however the fly turns, so, as a player would, turn it to the fly's side first, where the spot in front of its mouth is in sight.
    await feedHoney(page, () =>
      dropFood(page, async () => {
        await sideOn(page);
        await touch.tap(await screenOf(page, "hand"));
      }),
    );

    step("fingers: Clear dropped removes offerings without taking the place's food");
    // Along the kinds, one tap and one shown change at a time, to the last.
    for (let i = 0; i < 12; i++) {
      const at = (await readState(page)).variant;
      if (at === "clear") break;
      await tapOn("kind", 1);
      await waitFor(page, `variant~^(?!${at}$)`);
    }
    await waitFor(page, "variant=clear");
    const placeFoods = await game<number>(page, "g.life.pantry.foods.filter(f => f.kind === 'patch' || f.kind === 'found').length");
    await withTableCamera(page, async () => {
      const clearAt = await tableAway(page);
      assert.ok(clearAt, "table clear of the controls to clear dropped food");
      await touch.tap(clearAt);
      await page.waitForFunction(() => {
        const g = (globalThis as unknown as { __fly: Game }).__fly;
        return g.hands.falling.length === 0 && !g.life.pantry.foods.some(f => f.kind !== "patch" && f.kind !== "found");
      });
    });
    assert.equal(await game<number>(page, "g.life.pantry.foods.length"), placeFoods);

    step("fingers: a finger held on the fly strokes it with the feather, on its back");
    await tool("feather");
    // The feather rests on whatever of the fly is under the hand, and a touch is still felt for a moment after
    // it has gone (packages/body's senses): left following the fly, in front of its mouth, the feather is on its
    // face, and its face still feels it on the frames after the finger lands on its back. So, as a player who
    // means its back would, put it down away from the fly first, until the fly feels nothing.
    const away = await tableAway(page);
    assert.ok(away, "table to put the feather down on, away from the fly");
    await touch.tap(away);
    await waitFor(page, "touch=0.000,touched=");
    const stroke = firstStroke(page);
    await touch.hold(await screenOf(page, "fly"), async () => {
      const { touched, off } = await stroke;
      assert.ok(/Notum 1\.00/.test(touched) && !/Front/.test(touched), `stroked on its back, not its face: ${touched} (the feather ${off.toFixed(2)} mm from its middle)`);
    });

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

    step("fingers: a drag across the air turns the camera round the fly, and it stays where it was put");
    const unturned = (await readState(page)).yaw;
    const foodBeforeDrag = (await readState(page)).food;
    await withAir(page, async (sky) => {
      await touch.drag(sky, [sky[0] + 0.25, sky[1] + 0.04], 500);
    });
    const turned = await turnedFrom(page, unturned);
    assert.equal((await readState(page)).food, foodBeforeDrag, "an air drag drops nothing");
    await waitForGameTime(page, 6);
    assert.equal((await readState(page)).yaw, turned, "it stays where it was put");

    step("fingers: the menu's button, its back button, and Settings changed by tapping");
    await tapOn("menu");
    await waitFor(page, "screen=title,ring=false");
    await tapOn("row", 2);
    await waitFor(page, "screen=settings,tab=wallpaper");
    await tapOn("tab", 2);
    await waitFor(page, "tab=picture");
    // Pixels shows its three options side by side: each is pressed where it is.
    const pixels = await game<number>(page, "g.screens.settings.menu.items.findIndex((i) => i.id === 'pixels')");
    await touch.tap(await targetOf(page, "option", pixels, 1));
    await waitFor(page, "pixels=chunky");
    await touch.tap(await targetOf(page, "option", pixels, 2));
    await waitFor(page, "pixels=chunkier");
    await touch.tap(await targetOf(page, "option", pixels, 0));
    await waitFor(page, "pixels=classic");
    // Hints is a switch: a tap anywhere on its row turns it off, and another on again.
    const hints = await game<number>(page, "g.screens.settings.menu.items.findIndex((i) => i.id === 'hints')");
    await tapOn("row", hints);
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("flies.settings") ?? "{}").hints === false);
    await tapOn("row", hints);
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("flies.settings") ?? "{}").hints === true);
    // The screensaver's delay has too many options to show at once: the one chosen, between arrows.
    await tapOn("tab", 0);
    await waitFor(page, "tab=wallpaper");
    const delay = await game<number>(page, "g.screens.settings.menu.items.findIndex((i) => i.id === 'wallpaperAfter')");
    const delayBefore = await game<number>(page, "g.settings.wallpaperAfter");
    await touch.tap(await targetOf(page, "step", delay, -1));
    await page.waitForFunction((was) => (globalThis as unknown as { __fly: { settings: { wallpaperAfter: number } } }).__fly.settings.wallpaperAfter !== was, delayBefore);
    await game(page, `(g.settings.wallpaperAfter = ${delayBefore}, g.applySettings())`);
    // Outside the pane is Back.
    await touch.tap([0.5, 0.97]);
    await waitFor(page, "screen=title");
    await tapOn("row", 5);
    await waitFor(page, "screen=about");
    await tapOn("notice", 0);
    await waitFor(page, "acknowledgement=0");
    await tapOn("notice", 1);
    await waitFor(page, "acknowledgement=1");
    await tapOn("back");
    await waitFor(page, "screen=about,acknowledgement=");
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

    step("fingers: rotating during a held world press cancels the obsolete release");
    await waitForGameTime(page, 0.5);
    const newestFood = () => game<number>(page, "Math.max(0, ...g.life.pantry.foods.filter(f => f.kind !== 'patch' && f.kind !== 'found').map(f => f.id))");
    const foodBeforeRotation = await newestFood();
    await touch.hold(await screenOf(page, "fly"), async () => {
      await page.setViewportSize({ width: 393, height: 852 });
      await page.evaluate(() => {
        (window as unknown as Record<string, unknown>).__flySafeArea = { top: 59, right: 0, bottom: 34, left: 0 };
        window.dispatchEvent(new Event("resize"));
      });
      await waitFor(page, "frame=376x815");
    });
    await waitForGameTime(page, 0.5);
    assert.equal(await newestFood(), foodBeforeRotation, "the rotated release dropped no food");
    assert.equal(await game<boolean>(page, "g.director.held"), false, "the camera is released too");

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
  const { browser, page, errors } = await openGame({ url, width: 1280, height: 720, steady: true });
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
    // A click on the world behind the title plays.
    const world = await canvasPoint(page, [0.2, 0.8]);
    await page.mouse.click(world.x, world.y);
    await waitFor(page, "screen=play");

    step("mouse: the hand is under the cursor, and the system's cursor is hidden over the table");
    await withTableCamera(page, async () => {
      // Over the table, well away from the fly (over the fly, the hand is on the fly).
      const spot = await tableAway(page);
      assert.ok(spot, "table away from the fly and clear of the controls for the mouse hand");
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
    // R: back to Follow's distance, on the same side of the fly.
    const zoomedAt = (await readState(page)).yaw;
    await page.keyboard.press("r");
    await waitWithin(page, `view=follow,reach~^11\\.1$,yaw=${zoomedAt}`, 15);

    step("mouse: a trackpad's two-finger scroll turns the camera up and round, as a drag does, and leaves its distance");
    const level = Number((await readState(page)).pitch);
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -8);
    await waitFor(page, `pitch>${level + 0.1}`);
    for (let i = 0; i < 6; i++) await page.mouse.wheel(-8, 0);
    await turnedFrom(page, zoomedAt);
    assert.equal((await readState(page)).reach, "11.1", "a scroll is no zoom");

    step("mouse: a drag from the table, a right-drag and a middle-drag turn the camera, and drop nothing; it stays where it was put");
    for (const button of ["left", "right", "middle"] as const) {
      const food = (await readState(page)).food;
      const unturned = (await readState(page)).yaw;
      const a = await canvasPoint(page, [0.45, 0.7]);
      await page.mouse.move(a.x, a.y);
      await page.mouse.down({ button });
      await page.mouse.move(a.x + 200, a.y, { steps: 10 });
      await turnedFrom(page, unturned);
      assert.equal(await page.evaluate(() => (document.getElementById("game") as HTMLCanvasElement).style.cursor), "grabbing");
      await page.mouse.up({ button });
      await waitForGameTime(page, 0.3);
      assert.equal((await readState(page)).food, food, `${button}: no food dropped`);
      if (button === "left") {
        const turned = (await readState(page)).yaw;
        await waitForGameTime(page, 7);
        assert.equal((await readState(page)).yaw, turned, "it stays where the mouse put it");
      }
    }

    step("mouse: a double click in the air takes the camera back to Follow's distance");
    for (let i = 0; i < 2; i++) await page.mouse.wheel(0, 100);
    await waitFor(page, "reach>13");
    const foodBeforeDoubleClick = (await readState(page)).food;
    const before = (await readState(page)).yaw;
    await withAir(page, async (sky) => {
      const at = await canvasPoint(page, sky);
      await page.mouse.move(at.x, at.y);
      await page.waitForFunction(() => (document.getElementById("game") as HTMLCanvasElement).style.cursor === "grab");
      await doubleClick(page, at.x, at.y);
    });
    assert.equal((await readState(page)).food, foodBeforeDoubleClick, "a double click in the air drops nothing");
    await waitWithin(page, `view=follow,reach~^11\\.1$,yaw=${before}`, 15);

    step("keys: a number picks a tool, and the hints are a keyboard's");
    // The key for the feather is its place on the shelf, which grows as tools are added.
    await page.keyboard.press(String(TOOLS.findIndex((t) => t.id === "feather") + 1));
    await waitFor(page, "tool=feather,device=keys");
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
    // In two steps, each far enough on its own: Playwright sends each step of a move only once the
    // page has taken the last, frames apart on a slow machine.
    await page.mouse.move(p.x + 260, p.y + 80, { steps: 2 });
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
