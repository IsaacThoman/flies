// Exercises the weather tray through the keyboard and the host's conditions
// through Outside, with the running brain and actual renderer.
import assert from "node:assert/strict";
import { chooseFromTray } from "./tray.ts";
import { openGame, startServer, waitFor, waitForGameTime } from "../../../scripts/play.ts";
import type { Game } from "../src/game.ts";

const { url, server } = await startServer();
let browser: Awaited<ReturnType<typeof openGame>>["browser"] | undefined;
try {
  const opened = await openGame({ url });
  browser = opened.browser;
  const { page, errors } = opened;
  await waitFor(page, "brain=running,screen=title", 120_000);
  await page.keyboard.press("Enter");
  await waitFor(page, "screen=play");
  await page.evaluate(() => { (globalThis as unknown as { __fly: Game }).__fly.settings.wallpaperAfter = 0; });
  for (const kind of ["clear","rain","heavyRain","storm","snow","sleet","overcast","mist","clear","now"]) {
    await chooseFromTray(page, ["world", "weather", kind]);
    await waitFor(page, `sky~/${kind}$`);
    if (kind !== "now") {
      await waitFor(page,`weather=${kind},weatherFrom=chosen`);
      await waitForGameTime(page,5);
    }
    console.log("weather tray:",kind);
  }
  for (const [condition,kind] of [["heavyRain","heavyRain"],["thunderstorms","storm"],["snow","snow"],["sleet","sleet"]]) {
    await page.evaluate(condition=>{
      const g=(globalThis as unknown as { __fly:Game }).__fly;
      g.outside.feed({condition,observedAt:Date.now(),cloudCover:1,precipitation:8,visibility:10000,wind:8,sunrise:7,sunset:17,noon:12,daylight:true});
    },condition);
    await waitFor(page,`weather=${kind},weatherFrom=outside`);
    console.log("WeatherKit condition:",condition,kind);
  }
  assert.deepEqual(errors,[]);
  console.log("Weather e2e passed");
} finally {
  await browser?.close();
  server.kill();
}
