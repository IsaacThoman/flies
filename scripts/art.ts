// Renders the Apple TV app's icon, Top Shelf banners and launch image from
// the game itself (apps/web/src/art.ts) into assets/, at the sizes and in the
// layers assets/README.md lists. Starts its own Vite server and a headless
// Chromium.
//
//   node scripts/art.ts [--out <dir>] [--only <path prefix>]   (default: all of them, into assets/)

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import type { ArtShot } from "../apps/web/src/art.ts";
import { chromiumPath, gpuFlags, startServer } from "./play.ts";

const args = process.argv.slice(2);
const out = args.includes("--out") ? path.resolve(args[args.indexOf("--out") + 1]) : path.join(import.meta.dirname, "..", "assets");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : "";

type Shot = Omit<ArtShot, "width" | "height">;

// The home-screen icon: the fly in close-up on the napkin, with the whole
// strawberry and the cherries behind it and the lake beyond. Three layers,
// back to front, that tvOS moves apart: the sky and hills, the table and
// fruit, the fly.
const ICON: Omit<Shot, "layer"> = {
  fly: { x: -14, z: 56 },
  camera: { around: Math.PI + 0.4, distance: 6.6, height: 2.0, fov: 36, aimAbove: 1.25 },
  turn: -0.6,
  time: "noon",
};
const ICON_LAYERS = [
  ["1-sky", "backdrop"],
  ["2-table", "table"],
  ["3-fly", "fly"],
] as const;

// The Top Shelf: a wide, low look across the napkin, the fly to one side of the middle (tvOS may crop the edges).
const SHELF: Shot = {
  layer: "all",
  fly: { x: -14, z: 56 },
  camera: { around: Math.PI + 0.4, distance: 10, height: 1.6, fov: 26, aimAbove: 1.1, shiftRight: 1.6 },
  turn: -0.5,
  time: "morning",
};

// The launch image: what the loading screen shows behind its panel, with the wordmark.
const SPLASH: Shot = {
  layer: "all",
  fly: { x: -14, z: 56 },
  camera: { around: Math.PI + 0.4, distance: 9, height: 1.5, fov: 32, aimAbove: 1.7 },
  turn: -0.6,
  time: "noon",
  wordmark: { y: 0.31, size: 0.133 },
};

const jobs: { file: string; shot: ArtShot }[] = [];
for (const [w, h] of [[1280, 768], [800, 480], [400, 240]]) {
  for (const [name, layer] of ICON_LAYERS) jobs.push({ file: `tv-icon/${w}x${h}/${name}.png`, shot: { ...ICON, layer, width: w, height: h } });
}
for (const [variant, w] of [["standard", 1920], ["wide", 2320]] as const) {
  for (const scale of [1, 2]) jobs.push({ file: `top-shelf/${variant}/top-shelf${scale === 2 ? "@2x" : ""}.png`, shot: { ...SHELF, width: w * scale, height: 720 * scale } });
}
for (const [w, h] of [[1920, 1080], [3840, 2160]]) jobs.push({ file: `splash/splash-${w}x${h}.png`, shot: { ...SPLASH, width: w, height: h } });

const { url, server } = await startServer();
const browser = await chromium.launch({ executablePath: chromiumPath(), args: gpuFlags() });
try {
  const page = await browser.newPage();
  page.on("pageerror", (error) => console.error(error.message));
  await page.goto(new URL("art.html", url).href);
  await page.waitForFunction(() => (globalThis as unknown as { __art?: { ready: boolean } }).__art?.ready, null, { timeout: 60_000 });
  for (const { file, shot } of jobs.filter((j) => j.file.startsWith(only))) {
    const data = await page.evaluate((s) => (globalThis as unknown as { __art: { render(s: ArtShot): string } }).__art.render(s), shot);
    const target = path.join(out, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, Buffer.from(data.split(",")[1], "base64"));
    console.log(`${file} ${shot.width}x${shot.height}`);
  }
} finally {
  await browser.close();
  server.kill();
}
