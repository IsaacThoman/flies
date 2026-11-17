// The fly's journal with the real brain: its first visit and first meal of
// sugar (dropped at its mouth; whether it eats is its brain's choice, so the
// drops are bounded), each kept with a picture taken as it happened, and a
// photo taken with the Photo tool; the journal shows their pictures, and
// after a reload they are all still there.
//
//   node apps/web/e2e/journal.e2e.ts [--url http://localhost:5173/] [--shots dir]
//
// Needs the connectome (npm run brain:fetch) and a Playwright Chromium.

import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import type { Page } from "playwright";
import { gameUp, openGame, readState, startServer, stopServer, waitFor, waitForGameTime } from "../../../scripts/play.ts";
import type { Game } from "../src/game.ts";
import { TOOLS } from "../src/tools/hands.ts";
import { dropFood } from "./feeding.ts";

const { values } = parseArgs({ options: { url: { type: "string" }, shots: { type: "string" } } });
let url = values.url;
let server: ChildProcess | null = null;
if (!url) {
  const started = await startServer();
  url = started.url;
  server = started.server;
}
const shots = values.shots;
if (shots) await mkdir(shots, { recursive: true });
const shot = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: path.join(shots, `${name}.png`) });
};
const journal = async (page: Page) => (await readState(page)).journal ?? "";
/** Waits, in game time, for the journal to have an entry matching `entry`. */
async function journalHas(page: Page, entry: RegExp, seconds: number) {
  const until = (await page.evaluate(() => (globalThis as unknown as { __fly: Game }).__fly.time)) + seconds;
  for (;;) {
    if (entry.test(await journal(page))) return true;
    if ((await page.evaluate(() => (globalThis as unknown as { __fly: Game }).__fly.time)) > until) return false;
    await waitForGameTime(page, 0.2);
  }
}
/** The arrows to a row of the title menu, one step at a time as the game shows each. */
async function toRow(page: Page, id: string) {
  for (let i = 0; i < 8 && (await readState(page)).focus !== id; i++) {
    await page.keyboard.press("ArrowUp");
    await waitForGameTime(page, 0.15);
  }
  await waitFor(page, `focus=${id}`);
}

const launch = new URL(url);
launch.searchParams.set("alone", "");
const { browser, page, errors } = await openGame({ url: launch.href, steady: true });
const step = (name: string) => console.log(`- ${name}`);
// A JPEG's bytes start "/9j/" in base64: no request may carry one.
const sent: string[] = [];
page.on("request", (request) => {
  if ((request.postData() ?? "").includes("/9j/")) sent.push(request.url());
});
try {
  await waitFor(page, "screen=title,brain=running", 240_000);
  step("arriving: its first visit to the picnic table is kept with a picture once it has been seen there");
  await page.keyboard.press("Enter");
  await waitFor(page, "screen=play");
  assert.ok(await journalHas(page, /place:picnic\+/, 30), `no picture of its first visit: ${await journal(page)}`);

  step("a first meal: sugar dropped at its mouth until its brain chooses to eat, kept with a picture of it eating");
  await waitFor(page, "tool=feed,variant=sugar");
  let ate = false;
  for (let drop = 1; drop <= 8 && !ate; drop++) {
    await page.evaluate(() => {
      const { hands, life } = (globalThis as unknown as { __fly: Game }).__fly;
      hands.release();
      const start = life.world.place.start;
      life.body.place(start.x, start.z, start.yaw, start.y);
    });
    await waitForGameTime(page, 1.5);
    await dropFood(page, () => page.keyboard.press("Enter"));
    ate = await journalHas(page, /meal:sugar\+/, 8);
    const s = await readState(page);
    console.log(`  drop ${drop}: sweet ${s.sweet}, feed ${s.feed}, meals ${s.meals}${ate ? ", kept in the journal" : ""}`);
  }
  assert.ok(ate, `eight drops of sugar and no first meal kept: ${await journal(page)}`);
  await shot(page, "first-meal-play");

  step("the Photo tool: Select takes the world as the camera shows it, without the HUD");
  await page.keyboard.press(`Digit${TOOLS.findIndex((t) => t.id === "photo") + 1}`);
  await waitFor(page, "tool=photo");
  await page.keyboard.press("ArrowUp");
  await waitForGameTime(page, 1);
  await page.keyboard.press("Enter");
  assert.ok(await journalHas(page, /photo\+/, 10), `no photo: ${await journal(page)}`);

  step("the journal from the menu: newest first, the pictures drawn, one opened big");
  await page.keyboard.press("Escape");
  await waitFor(page, "screen=title");
  await toRow(page, "journal");
  await page.keyboard.press("Enter");
  await waitFor(page, "screen=journal,journalShown>2");
  await shot(page, "journal");
  await page.keyboard.press("Enter");
  await waitFor(page, "journalOpen=photo,journalShown=1");
  await shot(page, "journal-photo");
  await page.keyboard.press("ArrowRight");
  await waitFor(page, "journalOpen=meal:sugar,journalShown=1");
  await shot(page, "journal-meal");
  await page.keyboard.press("Escape");
  await waitFor(page, "screen=journal,journalOpen=");

  step("after a reload, everything is still there, pictures and all");
  const before = await journal(page);
  await page.reload();
  await gameUp(page);
  await waitFor(page, "photos~^idle");
  assert.equal(await journal(page), before, "the same entries");
  await waitFor(page, "screen=title", 240_000);
  await page.evaluate(() => (globalThis as unknown as { __fly: Game }).__fly.open("journal"));
  await waitFor(page, "screen=journal,journalShown>2");
  // Nothing personal leaves the device: the journal is in this browser's IndexedDB, and no request carried a picture.
  assert.deepEqual(sent, []);
  const kept = await page.evaluate(() => new Promise<number>((resolve) => {
    const open = indexedDB.open("flies-journal");
    open.onsuccess = () => {
      const keys = open.result.transaction("kept").objectStore("kept").getAllKeys();
      keys.onsuccess = () => resolve(keys.result.length);
    };
  }));
  assert.ok(kept >= 4, `${kept} kept in IndexedDB`);
  assert.deepEqual(errors, []);
  console.log("passed: the journal");
} finally {
  await browser.close();
  if (server) await stopServer(server);
}
