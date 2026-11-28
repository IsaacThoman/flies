// The Build tool in the browser with the real brain: a tile built with the
// remote's buttons (the keyboard) goes down just in front of the fly, the
// fly's body stands on it, a wall built in its way stops it, the tile is
// still there after a reload, and Clear built takes them away.

import assert from "node:assert/strict";
import { chooseFromTray } from "./tray.ts";
import type { Browser, Page } from "playwright";
import { openGame, startServer, waitFor, waitForGameTime, waitWithin } from "../../../scripts/play.ts";
import type { Game } from "../src/game.ts";

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

/** Sets the fly down at a point, on whatever is highest there, as the Place tool sets it down; the brain carries on from there. */
const setDown = (page: Page, x: number, z: number, yaw = 0) =>
  page.evaluate(([x, z, yaw]) => (globalThis as unknown as { __fly: Game }).__fly.life.setDown(x, z, yaw), [x, z, yaw] as const);

/** Puts the hand at a point on the table, as a swipe would: it stays there for 15 s, then drifts back to the fly. */
const pointAt = (page: Page, x: number, z: number) =>
  page.evaluate(([x, z]) => (globalThis as unknown as { __fly: Game }).__fly.hands.movePointer({ x, y: 0, z }, { x: 0, y: 1, z: 0 }), [x, z] as const);

/**
 * Select where the ghost shows the piece fits, until there are `count`: the fly is free to walk
 * into the spot between a look at the ghost and the press, which then refuses it. With `at`, the
 * hand is put there again before each try, so that a wait for the fly to move off the spot never
 * outlasts the hand and sets the piece down in front of the fly instead.
 */
async function build(page: Page, kind: string, count: number, at?: { x: number; z: number }) {
  for (let i = 0; i < 5; i++) {
    if (at) await pointAt(page, at.x, at.z);
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

/**
 * How many draws the kit's own meshes (the pieces, their shadows, the ghost) make a frame for the
 * camera the player sees through, over half a second of frames: counted on the meshes themselves,
 * so that nothing else in the frame (the fly's eyes' six views, the bubbles, a visitor, the
 * reflections) moves it, and with nothing culled, so that the camera following the fly, with a
 * piece in view or out of it, doesn't either: what the kit costs with all of it in view. Exact,
 * or NaN if it varied.
 */
async function kitDraws(page: Page) {
  await page.evaluate(() => {
    type Counted = { draws: number[]; frame: number };
    const w = globalThis as unknown as { __fly: Game; __kitDraws?: Counted };
    const g = w.__fly;
    if (!w.__kitDraws) {
      const counted: Counted = { draws: [], frame: -1 };
      for (const mesh of g.kit.group.children) {
        mesh.frustumCulled = false;
        mesh.onAfterRender = (_renderer, _scene, camera) => {
          if (camera === g.director.camera && counted.frame >= 0) counted.draws[counted.frame]++;
        };
      }
      const frame = g.frame.bind(g);
      g.frame = (dt, now) => {
        if (counted.frame >= 0) counted.draws[++counted.frame] = 0;
        frame(dt, now);
      };
      w.__kitDraws = counted;
    }
    w.__kitDraws.draws = [0];
    w.__kitDraws.frame = 0;
  });
  await waitForGameTime(page, 0.5);
  return page.evaluate(() => {
    const counted = (globalThis as unknown as { __kitDraws: { draws: number[]; frame: number } }).__kitDraws;
    // The first and the last frame may be partly outside the half second.
    const draws = counted.draws.slice(1, -1);
    counted.frame = -1;
    return draws.every((d) => d === draws[0]) ? draws[0] : NaN;
  });
}

const pieces = (page: Page) => page.evaluate(() => (globalThis as unknown as { __fly: Game }).__fly.builder.pieces.map((p) => ({ ...p })));

try {
  const opened = await openGame({ url, steady: true });
  browser = opened.browser;
  const { page, errors } = opened;
  await play(page);
  // Somewhere open, facing out over the table.
  await setDown(page, -40, -190, 0);
  await chooseFromTray(page, ["build", "tile-blue"]);
  // The hand waits just in front of the fly: the tile goes down as near as it has room.
  // Before it, the kit draws only its ghost; after, the pieces and their shadows too.
  const before = await kitDraws(page);
  assert.equal(before, 1, `the ghost alone: ${before} draws`);
  await build(page, "tile-blue", 1);
  const [tile] = await pieces(page);
  assert.equal(tile.kind, "tile-blue");
  const after = await kitDraws(page);
  assert.equal(after, 3, `the ghost, the pieces and their shadows: ${after} draws`);

  // Its body on the tile: what it stands on is the tile, half a millimetre up.
  await setDown(page, tile.x, tile.z, Math.PI);
  await waitFor(page, "standsOn=blue tile", 5_000);
  assert.equal(await page.evaluate(() => (globalThis as unknown as { __fly: Game }).__fly.life.body.position.y), 0.5);

  // A wall across its way: a walking fly doesn't get through it.
  await chooseFromTray(page, ["build", "wall"]);
  await build(page, "wall", 2, { x: -40, z: -150 });
  const wall = (await pieces(page))[1];
  assert.deepEqual([wall.kind, wall.x, wall.z], ["wall", -40, -150], "the wall where the hand put it");
  // Still two draws for the pieces, however many.
  assert.equal(await kitDraws(page), 3, "two pieces, still three draws");
  // Set down facing it, 6 mm short of it: wherever its brain takes it for a while, its feet are
  // never inside the wall, frame by frame, as the world has it. Standing on its top is not inside.
  await page.evaluate(() => {
    const w = globalThis as unknown as { __fly: Game; __inWall?: unknown[] };
    const g = w.__fly;
    const index = g.life.world.solids.length - 1;
    const seen: unknown[] = (w.__inWall = []);
    const frame = g.frame.bind(g);
    g.frame = (dt, now) => {
      frame(dt, now);
      const b = g.life.body;
      const p = b.position;
      if (seen.length < 5 && g.life.world.solidAt(p.x, p.y + 0.02, p.z) === index) {
        seen.push({ time: g.time.toFixed(2), at: [p.x, p.y, p.z].map((v) => v.toFixed(3)).join(","), mode: b.mode, activity: g.life.activity, standsOn: b.surface.solid >= 0 ? g.life.world.solids[b.surface.solid].name : "floor", takeoffs: g.life.takeOffs });
      }
    };
  });
  await setDown(page, wall.x, wall.z - 6, 0);
  await waitForGameTime(page, 10);
  const inWall = await page.evaluate(() => (globalThis as unknown as { __inWall: unknown[] }).__inWall);
  assert.deepEqual(inWall, [], `the fly's feet went into the wall: ${JSON.stringify(inWall)}`);

  // Kept: after a reload both are there, where they were, and its body stands on the tile again.
  await page.reload();
  await play(page);
  await waitFor(page, "built=2");
  assert.deepEqual((await pieces(page))[0], tile);
  await setDown(page, tile.x, tile.z, 0);
  await waitFor(page, "standsOn=blue tile", 5_000);

  // Clear built takes everything built here away.
  await setDown(page, -40, -190, 0);
  await chooseFromTray(page, ["world", "clearBuilt"]);
  await waitFor(page, "built=0");
  assert.deepEqual(errors, []);
  console.log(`build: a tile with the remote's buttons (the kit's draws ${before} to ${after}), stood on, a wall not walked into, both kept across a reload, cleared`);
} finally {
  await browser?.close();
  server.kill();
}
