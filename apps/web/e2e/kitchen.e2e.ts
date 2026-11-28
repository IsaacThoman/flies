import assert from "node:assert/strict";
import { chooseFromTray } from "./tray.ts";
import type { Browser } from "playwright";
import {
  openGame,
  readState,
  startServer,
  waitFor,
  waitForGameTime,
} from "../../../scripts/play.ts";
import type { Game } from "../src/game.ts";
import { KINDS } from "../src/scene/weather.ts";

const { url, server } = await startServer();
let browser: Browser | undefined;
try {
  const opened = await openGame({ url, steady: true });
  browser = opened.browser;
  const { page, errors } = opened;
  await waitFor(page, "screen=title");
  await page.keyboard.press("Enter");
  await waitFor(page, "screen=play");
  await page.evaluate(() => {
    (globalThis as unknown as { __fly: Game }).__fly.settings.wallpaperAfter =
      0;
  });
  await chooseFromTray(page, ["world", "place", "kitchen"]);
  const arrived = await waitFor(page, "place=kitchen,moving=");
  assert.equal(arrived.prints, "0");
  assert.equal(arrived.gl, "ok");
  const food = await page.evaluate(() => {
    const { life } = (globalThis as unknown as { __fly: Game }).__fly;
    return life.world.place.patches.map((p) => ({
      name: p.name,
      pool: !!p.pool,
      tasted: life.pantry.touching(
        p.x,
        life.world.heightAt(p.x, p.z, p.y),
        p.z,
        0,
      )?.name,
    }));
  });
  assert.ok(food.every((p) => p.name === p.tasted));
  assert.deepEqual(
    food
      .filter((p) => p.pool)
      .map((p) => p.name)
      .sort(),
    ["honey", "orange juice", "orange juice", "peach juice"],
  );
  await chooseFromTray(page, ["look", "table"]);
  await waitFor(page, "view=table");
  const calls: number[] = [];
  const weathers = Object.keys(KINDS);
  for (const time of ["morning", "noon", "golden", "dusk", "night"]) {
    await chooseFromTray(page, ["world", "time", time]);
    await waitFor(page, `time=${time}`);
    for (const weather of weathers) {
      await chooseFromTray(page, ["world", "weather", weather]);
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
  console.log(
    `kitchen: carried with remote, all food tastable, ${calls.length} light/weather combinations, median ${calls[Math.floor(calls.length / 2)]} draws`,
  );
  await chooseFromTray(page, ["world", "place", "picnic"]);
  await waitFor(page, "place=picnic,moving=");
} finally {
  await browser?.close();
  server.kill();
}
