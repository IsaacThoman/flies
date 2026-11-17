// Weather evidence, driven through the same Outside feed as WeatherKit.
// Run in a /tmp/flies-heavy slot: node scripts/weatherEvidence.ts /tmp/weather-evidence
// WEATHER_PLACES=lab,windowsill splits a render sweep into smaller batches.
// Requires ffmpeg and CHROMIUM_PATH; writes no artifacts into the repository.
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { startServer, openGame, waitFor, waitForGameTime, readState } from "./play.ts";
import type { Game } from "../apps/web/src/game.ts";
import { TOOLS } from "../apps/web/src/tools/hands.ts";
import { PLACES } from "../apps/web/src/places/catalog.ts";

const dest = path.resolve(process.argv[2] ?? "/tmp/weather-evidence");
const { url, server } = await startServer();
let browser: Awaited<ReturnType<typeof openGame>>["browser"] | undefined;
try {
  const opened = await openGame({ url, width: 960, height: 540 });
  browser = opened.browser;
  const { page, errors } = opened;
  await waitFor(page, "brain=running,screen=title", 120_000);
  await page.keyboard.press("Enter");
  await waitFor(page, "screen=play");
  const stats = [];
  for (const { id: place } of PLACES) {
    if (process.env.WEATHER_PLACES && !process.env.WEATHER_PLACES.split(",").includes(place)) continue;
    await page.evaluate(place => {
      const g = (globalThis as unknown as { __fly: Game }).__fly;
      g.settings.place = place; g.moveTo(place); g.settings.wallpaperAfter = 0;
    }, place);
    await waitFor(page, `place=${place},moving=`);
    for (const time of ["noon", "night"] as const) for (const condition of ["heavyRain", "thunderstorms", "snow", "sleet"]) {
      const name = `${place}-${time}-${condition}`;
      const variants = [
        TOOLS.findIndex(t => t.id === "sky"),
        TOOLS.find(t => t.id === "sky")!.variants.findIndex(v => v.id === time),
        TOOLS.findIndex(t => t.id === "view"),
        TOOLS.find(t => t.id === "view")!.variants.findIndex(v => v.id === "table"),
      ];
      await page.evaluate(({ time, condition, variants }) => {
        const g = (globalThis as unknown as { __fly: Game }).__fly;
        const [st, choice, vt, view] = variants;
        g.director.setView("table");
        if (g.stage.current.id !== "picnic") {
          const p = g.life.body.position;
          const focus = g.stage.current.camera.focus;
          const x = focus ? focus.x + p.x * focus.follow : p.x * 0.35;
          const z = focus ? focus.z + p.z * focus.follow : p.z * 0.35;
          const camera = g.director.camera.position;
          g.director.turnBy(0.04 - Math.atan2(camera.x - x, camera.z - z), 0);
        }
        g.stage.setTime(time);
        g.settings.eyesInset = "off";
        g.hands.variants[st] = choice; g.hands.seconds[st] = 0; g.hands.variants[vt] = view;
        g.outside.feed({ condition, observedAt: Date.now(), cloudCover: 1, visibility: 12000,
          precipitation: condition === "snow" ? 2 : 12, wind: 9,
          sunrise: 7, sunset: 17, noon: 12, daylight: time === "noon" });
        g.stage.weather.follow(Date.now() / 3600000, true, g.outside);
        if (condition === "snow" || condition === "sleet") for (let i = 0; i < 900; i++) g.stage.weather.update(0.1);
      }, { time, condition, variants });
      await waitForGameTime(page, 4);
      await mkdir(`${dest}/${name}`, { recursive: true });
      await page.locator("#game").screenshot({ path: `${dest}/${name}.png` });
      stats.push({ name, ...await readState(page) });
      for (let f = 0; f < 8; f++) {
        await waitForGameTime(page, 0.12);
        await page.locator("#game").screenshot({ path: `${dest}/${name}/${f}.png` });
      }
      execFileSync("ffmpeg", ["-v", "error", "-framerate", "7", "-i", `${dest}/${name}/%d.png`, "-vf", "scale=640:-1", "-y", `${dest}/${name}.gif`]);
      console.log(name);
    }
  }
  await writeFile(`${dest}/metrics.json`, JSON.stringify({ stats, errors }, null, 2));
  if (errors.length) throw new Error(errors.join("\n"));
} finally {
  await browser?.close();
  server.kill();
}
