// The fly remembers: in a real (headless) Chromium with the real brain, it
// gives the followed fly a body no new fly has (just fed, its crop full,
// needing sleep) at a spot the place never starts it at, reloads, and finds
// the same fly, as the canvas's state says: its id, its hunger and crop, its
// sleep pressure, where it stood. Then a second fly: it comes back after a
// reload, and after the count goes down to one and up again.
//
//   node apps/web/e2e/remembers.e2e.ts            (starts its own Vite server)
//   node apps/web/e2e/remembers.e2e.ts --url http://localhost:5173/
//
// Needs the connectome (npm run brain:fetch) and a Playwright Chromium.

import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { gameUp, openGame, readState, startServer, waitFor } from "../../../scripts/play.ts";
import type { Game } from "../src/game.ts";
import { chooseFlies, companyAwake, disableScreensaver } from "./settings.ts";

const args = process.argv.slice(2);
let url = args.includes("--url") ? args[args.indexOf("--url") + 1] : "";
let server: ChildProcess | null = null;
if (!url) {
  const started = await startServer();
  url = started.url;
  server = started.server;
}

const { browser, page, errors } = await openGame({ url, steady: true });
let currentStep = "startup";
const step = (name: string) => { currentStep = name; console.log(`· ${name}`); };
let failed = false;

/** Each fly's place in line and id, as the canvas says. */
const kept = (s: Record<string, string>) => new Map((s.kept ?? "").split(";").filter(Boolean).map((entry) => {
  const [slot, id] = entry.split(":");
  return [Number(slot), id] as const;
}));
const pressureOf = (s: Record<string, string>) => Number(/pressure ([\d.]+)/.exec(s.rhythm ?? "")?.[1]);
const atOf = (s: Record<string, string>) => (s.at ?? "").split(",").map(Number);

try {
  step("a new fly: an id of its own, kept from the start");
  await waitFor(page, "brain=running", 90_000);
  const first = kept(await readState(page));
  const id = first.get(0)!;
  assert.match(id, /^[0-9a-f]{32}$/);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("flies.fly.0")!).id), id);

  step("given a body no new fly has, at a spot the place never starts it at, then reloaded");
  const spot = await page.evaluate(() => {
    const life = (globalThis as unknown as { __fly: Game }).__fly.life;
    const start = life.world.place.start;
    // Halfway from where it starts to the middle of the table, and a fly's length or two across.
    const x = start.x / 2 + 4;
    const z = start.z / 2 - 4;
    life.setDown(x, z, start.yaw + 1);
    life.hunger.level = 0.05;
    life.hunger.fullness = 0.9;
    life.rhythm!.pressure = 0.95;
    return { x, z, start: [start.x, start.z] };
  });
  // Leaving the page (pagehide) saves it; the new page reads it before its first frame.
  await page.reload();
  await gameUp(page);
  const back = await readState(page);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("flies.fly.0")!) as { id: string; body: { hunger: number; fullness: number; sleep: { pressure: number } }; where: { x: number; z: number } });

  step("the same fly: its id, its hunger and crop, its need for sleep and where it stood");
  assert.equal(kept(back).get(0), id);
  assert.equal(saved.id, id);
  assert.ok(Math.abs(saved.where.x - spot.x) < 2 && Math.abs(saved.where.z - spot.z) < 2, `saved where it was put: ${JSON.stringify(saved.where)}`);
  // The canvas gives hunger to three places: a saved 0.0504 reads back as 0.050.
  const hunger = Number(back.hunger);
  assert.ok(hunger >= saved.body.hunger - 0.0005 && hunger < 0.2, `hunger ${hunger}: as it was, a little hungrier for the time away (a new fly arrives at 0.7)`);
  assert.ok(Number(back.fullness) > 0.3, `fullness ${back.fullness}: its crop still full (a new fly's is empty)`);
  assert.ok(Math.abs(pressureOf(back) - saved.body.sleep.pressure) < 0.01, `pressure ${pressureOf(back)} against ${saved.body.sleep.pressure} saved`);
  const [x, z] = atOf(back);
  assert.ok(Math.hypot(x - saved.where.x, z - saved.where.z) < 0.5, `standing at ${back.at}, where it was`);
  assert.ok(Math.hypot(x - spot.start[0], z - spot.start[1]) > 4, "not where the place starts a fly");

  step("a second fly is a fly of its own, the same after a reload");
  await disableScreensaver(page);
  await waitFor(page, "brain=running", 90_000);
  await chooseFlies(page, 2);
  const two = kept(await companyAwake(page, 2));
  const second = two.get(1)!;
  assert.match(second, /^[0-9a-f]{32}$/);
  assert.notEqual(second, id);
  await page.reload();
  await disableScreensaver(page);
  await waitFor(page, "brain=running", 90_000);
  const again = kept(await companyAwake(page, 2));
  assert.deepEqual([again.get(0), again.get(1)], [id, second]);

  step("one fly, then two again: the second comes back, not a new one");
  await chooseFlies(page, 1);
  await waitFor(page, "flies=1,company=");
  assert.deepEqual([...kept(await readState(page))], [[0, id]]);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("flies.fly.1")!).id), second, "kept while it is away");
  await chooseFlies(page, 2);
  const returned = kept(await companyAwake(page, 2));
  assert.equal(returned.get(1), second);
  await chooseFlies(page, 1);
  await waitFor(page, "flies=1,company=");

  assert.deepEqual(errors, [], "page errors");
  console.log("passed");
} catch (error) {
  failed = true;
  console.error(`failed (${currentStep}):`, error instanceof Error ? error.message : error);
  console.error("state:", JSON.stringify(await readState(page).catch(() => ({}))));
  if (errors.length) console.error("page errors:\n" + errors.join("\n"));
} finally {
  await browser.close();
  server?.kill();
}
process.exit(failed ? 1 : 0);
