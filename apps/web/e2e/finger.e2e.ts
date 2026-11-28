// The Finger tool in a real (GPU-rendered, headless) Chromium with the real
// brain: the fingertip is in the fly's world. With the fly set down on a clear
// stretch of the table at midday (so what it does answers what the test does):
//
// (a) its eyes take the finger in: the share of dark facets with the finger
//     put down in front of it, against the same moment with the finger drawn
//     for the player only (left out of what the eyes see);
// (b) a finger slid at it fast and slowly along the table, straight ahead,
//     from its front right and from its right side, each from the same place
//     to the same place: what its looming detectors and its giant fibre
//     make of each (and of the ball, for comparison) is printed; whether it
//     takes off is the brain's. What the game owes it is asserted: its eyes
//     look every frame while the finger comes at it fast;
// (c) set down on the finger, the fly is lifted and carried with it, staying
//     on (if its brain takes off, it took off: that try is counted and another
//     made, at most five; so too if it walks off its edge), feeling the wind
//     of being carried;
// (d) set down again, it walks off when its brain walks it off (waited for,
//     at most two minutes of its life a try, at most three tries);
// (e) asleep (01:00, still five minutes), the finger held a little way over
//     it and lowered onto its back: where it feels it (packages/body/src/
//     touch.ts) and whether it wakes, which is the brain's; at most three tries.
//
// It prints the numbers, and asserts what must hold whatever the brain
// chooses. The pointer is driven through the game's own hand each frame (a
// mouse or a swipe does the same, by way of the table under it).
//
//   node apps/web/e2e/finger.e2e.ts [--url http://localhost:5173/]
//
// Needs the connectome (npm run brain:fetch) and a Playwright Chromium.

import assert from "node:assert/strict";
import { chooseFromTray } from "./tray.ts";
import type { ChildProcess } from "node:child_process";
import { openGame, readState, startServer, stopServer, waitFor, waitForGameTime } from "../../../scripts/play.ts";
import type { Game } from "../src/game.ts";
import { FAST } from "../src/tools/finger.ts";
import { FLY_HEIGHT } from "@fly/body";

const args = process.argv.slice(2);
let url = args.includes("--url") ? args[args.indexOf("--url") + 1] : "";
let server: ChildProcess | null = null;
if (!url) {
  const started = await startServer();
  url = started.url;
  server = started.server;
}
const step = (what: string) => console.log(`- ${what}`);
const { browser, page, errors } = await openGame({ url: `${url}${url.includes("?") ? "&" : "?"}alone`, steady: true });

type Drive = { x: number; z: number; speed: number; tx: number; tz: number } | null;
/** What the brain did while watched: its eyes' looming detectors' highest rate (Hz, either eye), the loom the body sent, and its giant fibre's escape command. */
/** ...and how fast the finger slid across the table (mm/s, its height left out: it hops over what it meets). */
type Peak = { looming: number; loom: number; escape: number; watching: boolean; fast: number; looked: number; slide: number };
type Hooked = { __fly: Game; __drive: Drive; __spot: { x: number; z: number; yaw: number }; __peak: Peak; __hold: boolean };

const press = async (key: string) => {
  await page.keyboard.press(key);
  await waitForGameTime(page, 0.15);
};
const state = async () => readState(page);
const num = async (key: string) => Number((await state())[key]);

/** Sets the fly down on the clear spot, on the table (not on a finger held over it), facing as it was found, and the hand `ahead` mm in front of it (`left` to its left), moved there at `speed` mm/s (Infinity: at once). */
const setFly = () => page.evaluate(() => {
  const g = globalThis as unknown as Hooked;
  const s = g.__spot;
  g.__fly.life.setDown(s.x, s.z, s.yaw, 1e-3);
});
const handTo = (ahead: number, left: number, speed: number) => page.evaluate(([ahead, left, speed]) => {
  const g = globalThis as unknown as Hooked;
  const s = g.__spot;
  const p = g.__fly.hands.pointer;
  const tx = s.x + Math.sin(s.yaw) * ahead + Math.cos(s.yaw) * left;
  const tz = s.z + Math.cos(s.yaw) * ahead - Math.sin(s.yaw) * left;
  g.__drive = { x: speed === Infinity ? tx : p.x, z: speed === Infinity ? tz : p.z, speed, tx, tz };
}, [ahead, left, speed] as const);
const drivenThere = () => page.waitForFunction(() => {
  const d = (globalThis as unknown as Hooked).__drive;
  return !d || (d.x === d.tx && d.z === d.tz);
}, null, { polling: 50, timeout: 60_000 });
const fingerDown = async (down: boolean) => {
  const target = down ? "down" : "raised";
  const ready = await waitFor(page, "tool=finger,finger~^(raised|down)$");
  if (ready.finger === target) return;
  await press("Enter");
  await waitFor(page, `finger=${target}`);
};

try {
  await waitFor(page, "brain=running", 180_000);
  await waitFor(page, "screen=title");
  await press("Enter");
  await waitFor(page, "screen=play");

  step("midday and clear, so the finger is seen against a bright table and sky");
  await chooseFromTray(page, ["world", "weather", "clear"]);
  await waitFor(page, "weather=clear");
  await chooseFromTray(page, ["world", "time", "noon"]);
  await waitFor(page, "time=noon");

  // The hand, driven each frame through the game's own pointer, as a mouse or a swipe moves it: straight at the target at its speed.
  await page.evaluate(() => {
    const g = globalThis as unknown as Hooked;
    const game = g.__fly;
    g.__drive = null;
    // A clear stretch of the picnic table: nothing standing within 60 mm, and well inside its edge.
    const world = game.life.world;
    let best: { x: number; z: number; yaw: number } | null = null;
    for (let r = 0; r < 300 && !best; r += 10) {
      for (let a = 0; a < 16 && !best; a++) {
        const x = Math.cos((a / 16) * Math.PI * 2) * r;
        const z = Math.sin((a / 16) * Math.PI * 2) * r;
        let clear = world.onTable(x, z) && world.onTable(x * 1.3 + 80, z * 1.3 + 80) && world.onTable(x * 1.3 - 80, z * 1.3 - 80);
        // Nothing at all within 60 mm, looked at every 1.5 mm: not a crumb for the finger to rest on.
        for (let dx = -60; dx <= 60 && clear; dx += 1.5) for (let dz = -60; dz <= 60 && clear; dz += 1.5) if (dx * dx + dz * dz <= 3600) clear = world.heightAt(x + dx, z + dz) === 0;
        if (clear) best = { x, z, yaw: Math.atan2(-x, -z) };
      }
    }
    if (!best) throw new Error("no clear spot on the table");
    g.__spot = best;
    const frame = game.frame.bind(game);
    let seen = 0;
    game.frame = (dt: number, now: number) => {
      const d = g.__drive;
      if (d) {
        const dx = d.tx - d.x;
        const dz = d.tz - d.z;
        const left = Math.hypot(dx, dz);
        const go = d.speed * dt;
        if (left <= go) {
          d.x = d.tx;
          d.z = d.tz;
        } else {
          d.x += (dx / left) * go;
          d.z += (dz / left) * go;
        }
        const p = game.hands.pointer;
        p.x = d.x;
        p.z = d.z;
        // On the table under it, as the game's own pointer is: never on the finger it holds.
        const present = world.movingPresent;
        world.movingPresent = false;
        p.y = world.heightAt(d.x, d.z);
        world.movingPresent = present;
      }
      frame(dt, now);
      const peak = g.__peak;
      if (peak.watching) {
        const life = game.life;
        const rates = life.brain.state?.stats.rates;
        peak.looming = Math.max(peak.looming, rates?.["vision.looming left"] ?? 0, rates?.["vision.looming right"] ?? 0);
        peak.loom = Math.max(peak.loom, life.sensed.loomLeft, life.sensed.loomRight);
        peak.escape = Math.max(peak.escape, life.brain.state?.command.escape ?? 0);
        peak.slide = Math.max(peak.slide, Math.hypot(game.finger.velocity.x, game.finger.velocity.z));
        if (game.finger.urgent(life.body.position)) {
          peak.fast++;
          if (game.eyes.updates !== seen) peak.looked++;
        }
      }
      seen = game.eyes.updates;
    };
    g.__peak = { looming: 0, loom: 0, escape: 0, watching: false, fast: 0, looked: 0, slide: 0 };
    // Held where it was set down (its brain running on) until let go: the same scene for every look and every approach.
    g.__hold = false;
    const body = game.life.body;
    const step = body.step.bind(body);
    body.step = (...a: Parameters<typeof body.step>) => {
      step(...a);
      if (g.__hold) game.life.setDown(g.__spot.x, g.__spot.z, g.__spot.yaw, 1e-3);
    };
  });
  const hold = (held: boolean) => page.evaluate((held) => { (globalThis as unknown as Hooked).__hold = held; }, held);

  step("(a) the fly's eyes take the finger in");
  /** The followed fly's next complete picture of its facets, one light each. */
  const picture = async () => {
    const after = await num("eyesUpdates");
    await waitFor(page, `eyesUpdates>${after + 1}`);
    return page.evaluate(() => {
      const light = (globalThis as unknown as Hooked).__fly.eyes.light!;
      return [...light.left, ...light.right];
    });
  };
  await chooseFromTray(page, ["finger"]);
  await waitFor(page, "finger=raised");
  await handTo(16, 0, Infinity);
  await setFly();
  await fingerDown(true);
  await waitFor(page, "fingerHeight=0.00", 30_000);
  // Held still where it is for a moment (its brain is still running), the same scene seen twice: with the finger, and with it drawn for the
  // player only, left out of what the eyes see. The facets that differ are the finger's.
  await hold(true);
  const withIt = await picture();
  await page.evaluate(() => (globalThis as unknown as Hooked).__fly.fingerView.mesh.layers.disable(1));
  const without = await picture();
  await page.evaluate(() => (globalThis as unknown as Hooked).__fly.fingerView.mesh.layers.enable(1));
  await hold(false);
  let differ = 0;
  let change = 0;
  for (let i = 0; i < withIt.length; i++) {
    const d = withIt[i] - without[i];
    if (Math.abs(d) > 0.05) differ++;
    change += d;
  }
  console.log(`  ${differ} of ${withIt.length} facets (${((100 * differ) / withIt.length).toFixed(1)}%) see the finger, ${change < 0 ? "darker" : "brighter"} by ${(Math.abs(change) / Math.max(1, differ)).toFixed(2)} on average`);
  assert.ok(differ > withIt.length * 0.03, `the finger is in its eyes' picture: ${differ} facets`);

  step("(b) slid at it fast and slowly: what its looming detectors and its giant fibre make of it");
  type Approach = { speed: number; bearing: number; looming: number; loom: number; escape: number; tookOff: boolean; fast: number; looked: number; slide: number };
  const approaches: Approach[] = [];
  /** Watches the brain from now until `done`: its peaks, and the frames the finger moved fast near it with how many pictures its eyes took then. */
  const watch = async (done: () => Promise<unknown>) => {
    await page.evaluate(() => {
      const g = globalThis as unknown as Hooked;
      g.__peak = { looming: 0, loom: 0, escape: 0, watching: true, fast: 0, looked: 0, slide: 0 };
      g.__hold = false;
    });
    await done();
    return page.evaluate(() => {
      const g = globalThis as unknown as Hooked;
      g.__peak.watching = false;
      return g.__peak;
    });
  };
  /** Slides the finger at it from `bearing` degrees round to its right (0 straight ahead), from 70 mm out to 4 mm short of its head. */
  const approach = async (speed: number, bearing: number) => {
    const a = (bearing * Math.PI) / 180;
    const at = (d: number) => [d * Math.cos(a), -d * Math.sin(a)] as const;
    // Lifted and brought round 70 mm out that way, it turns to point at the fly; then down on the table, and the fly held still
    // facing ahead for a while, so nothing it saw on the way (its own walking, being set down, the finger coming down) is counted.
    await setFly();
    await hold(true);
    await fingerDown(false);
    await handTo(...at(70), Infinity);
    await drivenThere();
    await waitForGameTime(page, 2);
    await fingerDown(true);
    await waitFor(page, "fingerHeight=0.00", 20_000);
    await waitFor(page, "fingerSpeed<1", 20_000);
    await waitForGameTime(page, 4);
    const takeoffs = await num("takeoffs");
    // Let go as the finger comes along the table: the tip's edge stops 4 mm short of its head.
    const peak = await watch(async () => {
      await handTo(...at(13), speed);
      await drivenThere();
      await waitFor(page, "fingerSpeed<1", 20_000);
      await waitForGameTime(page, 0.5);
    });
    const result = { speed, bearing, ...peak, tookOff: (await num("takeoffs")) > takeoffs };
    approaches.push(result);
    console.log(`  from ${bearing}° at ${speed} mm/s: looming detectors ${result.looming.toFixed(1)} Hz, loom ${result.loom.toFixed(2)}, escape ${result.escape.toFixed(2)}, slid at up to ${result.slide.toFixed(0)} mm/s${result.fast ? `, fast for ${result.fast} frames` : ""}${result.tookOff ? ", took off" : ""}`);
    await setFly();
  };
  // For comparison, the ball (Swoop), thrown at it and watched the same way.
  await chooseFromTray(page, ["toys", "ball"]);
  await setFly();
  await hold(true);
  await waitForGameTime(page, 4);
  const thrown = await watch(async () => {
    await press("Enter");
    await page.waitForFunction(() => !(globalThis as unknown as Hooked).__fly.hands.ball.active, null, { polling: 50 });
  });
  console.log(`  the ball: looming detectors ${thrown.looming.toFixed(1)} Hz, escape ${thrown.escape.toFixed(2)}`);
  await setFly();
  await chooseFromTray(page, ["finger"]);
  // Straight ahead, where this brain's looming pathway is all but silent, and from its front right and its right side, where it is
  // strongest (packages/brain/README.md, Seeing).
  const TRIES = 3;
  for (const bearing of [0, 70, 90]) {
    for (let i = 0; i < TRIES; i++) {
      await approach(600, bearing);
      await approach(15, bearing);
    }
  }
  const fast = approaches.filter((a) => a.speed > 100);
  const slow = approaches.filter((a) => a.speed < 100);
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  for (const bearing of [0, 70, 90]) {
    const f = fast.filter((a) => a.bearing === bearing);
    const sl = slow.filter((a) => a.bearing === bearing);
    console.log(`  from ${bearing}°: looming detectors ${median(f.map((a) => a.looming)).toFixed(1)} Hz fast, ${median(sl.map((a) => a.looming)).toFixed(1)} Hz slow; escape ${median(f.map((a) => a.escape)).toFixed(2)} fast, ${median(sl.map((a) => a.escape)).toFixed(2)} slow; took off ${f.filter((a) => a.tookOff).length} of ${f.length} fast, ${sl.filter((a) => a.tookOff).length} of ${sl.length} slow`);
  }
  console.log(`  the ball: looming detectors ${thrown.looming.toFixed(1)} Hz, escape ${thrown.escape.toFixed(2)}`);
  // What the brain makes of it is the brain's. What the game owes it: while the finger comes at it fast, its eyes look every frame.
  for (const a of fast) {
    assert.ok(a.fast > 0, "the finger moved fast near it");
    assert.ok(a.looked >= a.fast * 0.5, `its eyes took ${a.looked} pictures in the ${a.fast} frames the finger came at it fast`);
  }
  // Slid slowly, it never slides fast (it may hop up quickly over something it meets, which counts as fast while it does).
  for (const a of slow) assert.ok(a.slide < FAST, `slid at up to ${a.slide.toFixed(0)} mm/s`);

  step("(c) on the finger, it is lifted and carried, and stays on");
  let carried = false;
  for (let attempt = 1; attempt <= 5 && !carried; attempt++) {
    // Lifted and brought round in front of it, so it points at the fly, then down: on the table before the fly is set on it.
    await fingerDown(false);
    await handTo(20, 0, Infinity);
    await drivenThere();
    await waitForGameTime(page, 2);
    await fingerDown(true);
    await waitFor(page, "fingerHeight=0.00,fingerSpeed<1", 20_000);
    // Set down on its back, toward the knuckle, facing along it.
    await page.evaluate(() => {
      const g = globalThis as unknown as Hooked;
      const f = g.__fly.finger;
      g.__fly.life.setDown(f.tip.x + Math.sin(f.yaw) * 12, f.tip.z + Math.cos(f.yaw) * 12, f.yaw + Math.PI);
    });
    await waitFor(page, "onFinger=yes", 5_000);
    const takeoffs = await num("takeoffs");
    const from = await page.evaluate(() => ({ ...(globalThis as unknown as Hooked).__fly.life.body.position }));
    await fingerDown(false);
    await waitFor(page, "fingerHeight>5.9", 10_000);
    await handTo(20, -40, 40);
    let stayed = true;
    let wind = 0;
    let lifted = 0;
    while (true) {
      const s = await state();
      if (s.onFinger !== "yes") stayed = false;
      wind = Math.max(wind, Number(s.wind));
      if (!stayed) break;
      const done = await page.evaluate(() => { const d = (globalThis as unknown as Hooked).__drive; return !d || (d.x === d.tx && d.z === d.tz); });
      if (done) break;
      await waitForGameTime(page, 0.1);
    }
    const to = await page.evaluate(() => ({ ...(globalThis as unknown as Hooked).__fly.life.body.position }));
    // Over the table (level here, at 0), on the lifted finger: it may walk about on the finger meanwhile, up its back or down its side.
    lifted = to.y;
    const moved = Math.hypot(to.x - from.x, to.z - from.z);
    const tookOff = (await num("takeoffs")) > takeoffs;
    // Off it without a take-off is its brain walking it over the edge, and falling: the brain's choice as much as a take-off.
    console.log(`  try ${attempt}: ${stayed ? "stayed on" : tookOff ? "took off" : "walked off its edge"}, carried ${moved.toFixed(1)} mm, ${lifted.toFixed(1)} mm over the table, wind felt up to ${wind.toFixed(3)}`);
    if (stayed) {
      // Most of the hand's 40 mm: it may walk about on the finger meanwhile.
      assert.ok(moved > 25, `carried ${moved} mm`);
      assert.ok(lifted > 5.9, `${lifted} mm over the table on the lifted finger`);
      assert.ok(wind > 0, "it feels the air of being carried");
      carried = true;
    }
  }
  assert.ok(carried, "carried in one of five tries");

  step("(d) set down, it walks off when its brain walks it off");
  await fingerDown(true);
  await waitFor(page, "fingerHeight=0.00", 10_000);
  let walkedOff = false;
  for (let attempt = 1; attempt <= 3 && !walkedOff; attempt++) {
    if ((await state()).onFinger !== "yes") {
      await page.evaluate(() => {
        const g = globalThis as unknown as Hooked;
        const f = g.__fly.finger;
        g.__fly.life.setDown(f.tip.x + Math.sin(f.yaw) * 12, f.tip.z + Math.cos(f.yaw) * 12, f.yaw + Math.PI);
      });
    }
    const takeoffs = await num("takeoffs");
    const started = await page.evaluate(() => (globalThis as unknown as Hooked).__fly.time);
    const off = await page.waitForFunction(() => {
      const game = (globalThis as unknown as Hooked).__fly;
      return !game.finger.carries(game.life.body) && game.life.body.onFeet;
    }, null, { polling: 100, timeout: 240_000 }).then(() => true, () => false);
    const took = (await num("takeoffs")) > takeoffs;
    const after = await page.evaluate((started) => (globalThis as unknown as Hooked).__fly.time - started, started);
    walkedOff = off && !took;
    console.log(`  try ${attempt}: ${walkedOff ? `walked off after ${after.toFixed(0)} s` : took ? "took off instead" : "still on it"}`);
  }
  assert.ok(walkedOff, "it walked off in one of three tries");

  step("(e) asleep, the finger lowered onto its back: where it feels it, and whether it wakes");
  let rested = 0;
  for (let attempt = 1; attempt <= 3; attempt++) {
    // Held over it, lifted, its tip 4 mm ahead of its middle so its round end covers it, pointing at it.
    await fingerDown(false);
    await setFly();
    await hold(true);
    await handTo(4, 0, Infinity);
    await drivenThere();
    await waitFor(page, "fingerSpeed<1", 20_000);
    await waitForGameTime(page, 3);
    // Its clock at 01:00 (the game sets every fly's clock from the real hour now and then: not this one, for now), still five minutes.
    await page.evaluate(() => {
      const g = globalThis as unknown as Hooked;
      const r = g.__fly.life.rhythm!;
      r.setTime(1);
      r.setTime = () => {};
      r.still = 300;
      g.__hold = false;
    });
    await waitForGameTime(page, 4);
    const before = await state();
    if (before.activity !== "sleeping") {
      console.log(`  try ${attempt}: not asleep (${before.activity})`);
      continue;
    }
    await fingerDown(true);
    let touched = "";
    let woke = "";
    for (let t = 0; t < 20 && !woke; t += 0.25) {
      await waitForGameTime(page, 0.25);
      const s = await state();
      if (s.touched) touched = s.touched;
      if (s.activity !== "sleeping") woke = `${s.activity} after ${t.toFixed(2)} s`;
    }
    const over = await page.evaluate(() => { const g = (globalThis as unknown as Hooked).__fly; return g.finger.tip.y - g.life.body.position.y; });
    console.log(`  try ${attempt}: the finger's underside ${over.toFixed(2)} mm over its feet, felt on ${touched || "nothing"}; ${woke ? `woke: ${woke}` : "slept on, 20 s"}`);
    // Resting on its back (it may have moved out from under it as it came: that try doesn't count).
    if (Math.abs(over - FLY_HEIGHT) > 0.1) continue;
    rested++;
    assert.ok(/Notum|Wings/.test(touched), `felt on its back: ${touched}`);
    break;
  }
  assert.ok(rested > 0, "asleep under the finger in one of three tries");
  assert.deepEqual(errors, []);
  console.log("finger: seen, looms when fast, carries, and lets it walk off");
} finally {
  await browser.close();
  if (server) await stopServer(server);
}
