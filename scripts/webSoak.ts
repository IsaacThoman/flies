// Leaves the built game running in Chromium as a wallpaper for a long time,
// carrying the fly from place to place far more often than the game would,
// and watches what it holds on to: the JavaScript heap after a garbage
// collection, and three.js's geometries, textures and shader programs. A
// steady game ends each lap where it began.
//
//   npm run build && node scripts/webSoak.ts [--minutes 20] [--every 8]
//
// --every is seconds between moves. Prints a line a lap (a visit to every
// place) and the change from the first lap to the last.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import { build } from "vite";
import { PLACES } from "../apps/web/src/places/catalog.ts";
import { fullChromiumPath, gpuFlags, waitFor } from "./play.ts";
import { serveSite } from "./serve.ts";

const { values } = parseArgs({ options: { minutes: { type: "string", default: "20" }, every: { type: "string", default: "8" } } });
const minutes = Number(values.minutes);
const every = Number(values.every) * 1000;

const root = path.join(import.meta.dirname, "..");
const out = mkdtempSync(path.join(tmpdir(), "fly-web-soak-"));
await build({ configFile: path.join(root, "vite.config.ts"), logLevel: "warn", build: { outDir: out, emptyOutDir: true } });
const site = await serveSite({ dir: out, base: "/fly/" });
const browser = await chromium.launch({ executablePath: fullChromiumPath(), args: [...gpuFlags(), "--enable-precise-memory-info", "--js-flags=--expose-gc"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));

type Sample = { heapMB: number; geometries: number; textures: number; programs: number; calls: number; frameMs: number; speed: number };
type Fly = {
  stage: { renderer: { info: { memory: { geometries: number; textures: number }; programs: unknown[] | null } }; cost: { calls: number } };
  frameMsAverage: number;
  meter: { speed: number };
  moveTo(id: string): void;
  watch(): void;
};

const sample = () =>
  page.evaluate(async () => {
    const fly = (globalThis as unknown as { __fly: Fly }).__fly;
    (globalThis as unknown as { gc?: () => void }).gc?.();
    await new Promise((resolve) => setTimeout(resolve, 200));
    const info = fly.stage.renderer.info;
    return {
      heapMB: (performance as unknown as { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize / 1e6,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
      calls: fly.stage.cost.calls,
      frameMs: fly.frameMsAverage,
      speed: fly.meter.speed,
    } satisfies Sample;
  });

try {
  await page.goto(site.url);
  await waitFor(page, "brain=running,screen=title", 120_000);
  await page.evaluate(() => (globalThis as unknown as { __fly: Fly }).__fly.watch());
  const places = PLACES.map((p) => p.id);
  const laps: Sample[] = [];
  const started = Date.now();
  let move = 0;
  while (Date.now() - started < minutes * 60_000) {
    const to = places[++move % places.length];
    await page.evaluate((id) => (globalThis as unknown as { __fly: Fly }).__fly.moveTo(id), to);
    await waitFor(page, `place=${to},moving=`, 30_000);
    await page.waitForTimeout(every);
    if (move % places.length === 0) {
      const s = await sample();
      laps.push(s);
      console.log(
        `lap ${laps.length} (${((Date.now() - started) / 60_000).toFixed(1)} min, ${move} moves): heap ${s.heapMB.toFixed(1)} MB, ${s.geometries} geometries, ${s.textures} textures, ${s.programs} programs, ${s.calls} draws, ${s.frameMs.toFixed(2)} ms JS, brain ${s.speed.toFixed(2)}x`,
      );
    }
  }
  const first = laps[1] ?? laps[0];
  const last = laps.at(-1)!;
  console.log(
    `from lap 2 to lap ${laps.length}: heap ${(last.heapMB - first.heapMB).toFixed(1)} MB, geometries ${last.geometries - first.geometries}, textures ${last.textures - first.textures}, programs ${last.programs - first.programs}`,
  );
  if (errors.length) console.log(`page errors:\n${errors.join("\n")}`);
} finally {
  await browser.close();
  await site.close();
  rmSync(out, { recursive: true, force: true });
}
