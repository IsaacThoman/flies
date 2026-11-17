import assert from "node:assert/strict";
import type { Browser } from "playwright";
import { openGame, readState, startServer, waitFor, waitForGameTime } from "../../../scripts/play.ts";
import type { Game } from "../src/game.ts";
import { PLACES } from "../src/places/catalog.ts";

const { url, server } = await startServer();
let browser: Browser | undefined;
try {
  const opened = await openGame({ url });
  browser = opened.browser;
  const { page, errors } = opened;
  await waitFor(page, "screen=title");
  await page.keyboard.press("Enter");
  await waitFor(page, "screen=play");
  await page.evaluate(() => {
    (globalThis as unknown as { __fly: Game }).__fly.settings.wallpaperAfter = 0;
  });
  const press = async (key: string, count = 1) => {
    for (let i = 0; i < count; i++) {
      await page.keyboard.press(key);
      await waitForGameTime(page, 0.12);
    }
  };
  const tool = async (id: string) => {
    for (let i = 0; i < 10 && (await readState(page)).tool !== id; i++) await press("ArrowRight");
    await waitFor(page, `tool=${id}`);
  };
  await tool("place");
  const kitchen = PLACES.findIndex(p => p.id === "kitchen");
  await press("ArrowDown", kitchen);
  await press("Enter");
  const arrived = await waitFor(page, "place=kitchen,moving=");
  assert.equal(arrived.prints, "0");
  assert.equal(arrived.gl, "ok");
  const food = await page.evaluate(() => {
    const { life } = (globalThis as unknown as { __fly: Game }).__fly;
    return life.world.place.patches.map(p => ({ name: p.name, pool: !!p.pool, tasted: life.pantry.touching(p.x, life.world.heightAt(p.x, p.z, p.y), p.z, 0)?.name }));
  });
  assert.ok(food.every(p => p.name === p.tasted));
  assert.equal(food.filter(p => p.pool).length, 3);
  await tool("view");
  await press("ArrowDown", 2);
  await waitFor(page, "view=table");
  const calls: number[] = [];
  for (const time of ["morning", "noon", "golden", "dusk", "night"]) {
    await tool("light");
    await press("ArrowUp", 6);
    await press("ArrowDown", ["morning", "noon", "golden", "dusk", "night"].indexOf(time) + 1);
    await waitFor(page, `time=${time}`);
    await tool("weather");
    await press("ArrowUp", 5);
    for (const weather of ["clear", "overcast", "mist", "rain"]) {
      await press("ArrowDown");
      await waitFor(page, `weather=${weather}`);
      await waitForGameTime(page, 4);
      const s = await readState(page);
      assert.equal(s.place, "kitchen");
      assert.equal(s.gl, "ok");
      assert.ok(Number(s.triangles) < 180_000, s.triangles);
      calls.push(Number(s.calls));
    }
  }
  calls.sort((a, b) => a - b);
  assert.ok(calls[Math.floor(calls.length / 2)] <= 35, JSON.stringify(calls));
  assert.deepEqual(errors, []);
  console.log(`kitchen: carried with remote, all food tastable, 20 light/weather combinations, median ${calls[10]} draws`);
  await tool("place");
  await press("ArrowUp", kitchen);
  await press("Enter");
  await waitFor(page, "place=picnic,moving=");
} finally {
  await browser?.close();
  server.kill();
}
