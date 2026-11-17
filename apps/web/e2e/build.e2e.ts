// The Build tool in the browser with the real brain: a tile built with the
// remote's buttons (the keyboard) goes down just in front of the fly, the
// fly's body stands on it, a wall built in its way stops it, the tile is
// still there after a reload, and Clear built takes them away.

import assert from "node:assert/strict";
import type { Browser, Page } from "playwright";
import { openGame, readState, startServer, waitFor, waitForGameTime, waitWithin } from "../../../scripts/play.ts";
import type { Game } from "../src/game.ts";
import { TOOLS } from "../src/tools/hands.ts";

const BUILD = TOOLS.find((t) => t.id === "build")!;

const { url, server } = await startServer();
let browser: Browser | undefined;

async function play(page: Page) {
  await waitFor(page, "screen=title");
  await page.keyboard.press("Enter");
  await waitFor(page, "screen=play,brain=running");
}

async function press(page: Page, key: string, count = 1) {
  for (let i = 0; i < count; i++) {
    await page.keyboard.press(key);
    await waitForGameTime(page, 0.12);
  }
}

/** The Build tool in hand, on this kind. */
async function choose(page: Page, kind: string) {
  for (let i = 0; i < TOOLS.length; i++) {
    const at = (await readState(page)).tool;
    if (at === "build") break;
    await page.keyboard.press("ArrowRight");
    await waitFor(page, `tool~^(?!${at}$)`);
  }
  await waitFor(page, "tool=build");
  await press(page, "ArrowUp", BUILD.variants.length);
  await press(page, "ArrowDown", BUILD.variants.findIndex((v) => v.id === kind));
  await waitFor(page, `variant=${kind}`);
}

/** Sets the fly down at a point, on whatever is highest there, as the Place tool sets it down; the brain carries on from there. */
const setDown = (page: Page, x: number, z: number, yaw = 0) =>
  page.evaluate(([x, z, yaw]) => (globalThis as unknown as { __fly: Game }).__fly.life.setDown(x, z, yaw), [x, z, yaw] as const);

/**
 * Select where the ghost shows the piece fits, until there are `count`: the fly is free to walk
 * into the spot between a look at the ghost and the press, which then refuses it.
 */
async function build(page: Page, kind: string, count: number) {
  for (let i = 0; i < 5; i++) {
    await waitFor(page, `buildAim~^${kind} ok`);
    await press(page, "Enter");
    try {
      await waitWithin(page, `built=${count}`, 1);
      return;
    } catch {
      // Refused: the fly was in the way. Again, where the ghost is now.
    }
  }
  await waitFor(page, `built=${count}`, 1);
}

/** The fewest draws a frame over a second: frames that refresh the fly's eyes draw its six views too. */
async function fewestDraws(page: Page) {
  let fewest = Infinity;
  for (let i = 0; i < 8; i++) {
    fewest = Math.min(fewest, Number((await readState(page)).calls));
    await waitForGameTime(page, 0.13);
  }
  return fewest;
}

const pieces = (page: Page) => page.evaluate(() => (globalThis as unknown as { __fly: Game }).__fly.builder.pieces.map((p) => ({ ...p })));

try {
  const opened = await openGame({ url, steady: true });
  browser = opened.browser;
  const { page, errors } = opened;
  await play(page);
  // Somewhere open, facing out over the table.
  await setDown(page, -40, -190, 0);
  await choose(page, "tile-blue");
  // The hand waits just in front of the fly: the tile goes down as near as it has room.
  const before = await fewestDraws(page);
  await build(page, "tile-blue", 1);
  const [tile] = await pieces(page);
  assert.equal(tile.kind, "tile-blue");
  // Two draws more: the pieces and their shadows (the ghost is drawn already).
  const after = await fewestDraws(page);
  assert.ok(after - before <= 2, `draws ${before} to ${after}`);

  // Its body on the tile: what it stands on is the tile, half a millimetre up.
  await setDown(page, tile.x, tile.z, Math.PI);
  await waitFor(page, "standsOn=blue tile", 5_000);
  assert.equal(await page.evaluate(() => (globalThis as unknown as { __fly: Game }).__fly.life.body.position.y), 0.5);

  // A wall across its way: a walking fly doesn't get through it.
  await choose(page, "wall");
  const wallAt = { x: -40, z: -150 };
  await page.evaluate(([x, z]) => {
    const g = (globalThis as unknown as { __fly: Game }).__fly;
    g.hands.movePointer({ x, y: 0, z }, { x: 0, y: 1, z: 0 });
  }, [wallAt.x, wallAt.z] as const);
  await build(page, "wall", 2);
  // Set down facing it, 6 mm short of it: wherever its brain takes it for a while, it is never inside it.
  await setDown(page, wallAt.x, wallAt.z - 6, 0);
  for (let t = 0; t < 20; t++) {
    await waitForGameTime(page, 0.5);
    const inWall = await page.evaluate(([x, z]) => {
      const g = (globalThis as unknown as { __fly: Game }).__fly;
      const p = g.life.body.position;
      return Math.abs(p.x - x) < 10 && Math.abs(p.z - z) < 0.75 && p.y < 3;
    }, [wallAt.x, wallAt.z] as const);
    assert.equal(inWall, false, "the fly's body never goes into the wall");
  }

  // Kept: after a reload both are there, where they were, and its body stands on the tile again.
  await page.reload();
  await play(page);
  await waitFor(page, "built=2");
  assert.deepEqual((await pieces(page))[0], tile);
  await setDown(page, tile.x, tile.z, 0);
  await waitFor(page, "standsOn=blue tile", 5_000);

  // Clear built takes everything built here away.
  await setDown(page, -40, -190, 0);
  await choose(page, "clear");
  await press(page, "Enter");
  await waitFor(page, "built=0");
  assert.deepEqual(errors, []);
  console.log(`build: a tile with the remote's buttons (draws ${before} to ${after}), stood on, a wall not walked through, both kept across a reload, cleared`);
} finally {
  await browser?.close();
  server.kill();
}
