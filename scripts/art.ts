// Renders the apps' art from the game itself (apps/web/src/art.ts) into assets/: the Apple TV
// app's icon, Top Shelf banners and launch image, the web app's icons and link preview, and the
// iPhone and iPad app's icon and launch image, at the sizes and in the layers assets/README.md
// lists. Starts its own Vite server and a headless Chromium.
//
//   node scripts/art.ts [--out <dir>] [--only <path prefix>]   (default: all of them, into assets/)

import { mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import type { ArtShot } from "../apps/web/src/art.ts";
import { chromiumPath, gpuFlags, startServer } from "./play.ts";

const args = process.argv.slice(2);
const out = args.includes("--out") ? path.resolve(args[args.indexOf("--out") + 1]) : path.join(import.meta.dirname, "..", "assets");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : "";

type Shot = Omit<ArtShot, "width" | "height">;

// A clear blue check separates the fly's legs from the picnic's finer weave.
const ICON: Omit<Shot, "layer"> = {
  fly: { x: -8.9, z: -33.7 },
  camera: { around: Math.PI + 0.15, distance: 5.5, height: 1.8, fov: 36, aimAbove: 0.65 },
  turn: -0.8, time: "noon", pose: { wings: 0.01 }, bubbles: false,
};
const ICON_LAYERS = [
  ["1-picnic", "picnic"],
  ["2-fly", "fly"],
] as const;

// The Top Shelf: a wide, low look across the napkin, the fly to one side of the middle (tvOS may crop the edges).
const SHELF: Shot = {
  layer: "all",
  fly: { x: -8.9, z: -33.7 },
  camera: { around: Math.PI + 0.15, distance: 6.8, height: 1.6, fov: 28, aimAbove: 0.6, shiftRight: 0.6 },
  turn: -0.8, time: "morning", pose: { wings: 0.01 }, poseFrames: 2, bubbles: false,
};

// The launch image: what the loading screen shows (the fly small and to the left, as the camera's title shot frames it), with the wordmark.
const SPLASH: Shot = {
  layer: "all",
  fly: { x: -9, z: -40 },
  camera: { around: Math.PI + 0.15, distance: 12, height: 1.6, fov: 30, aimAbove: 0.9, shiftRight: 2.9 },
  turn: -0.6,
  time: "noon",
  wordmark: { y: 0.31, size: 0.133 },
};

// The web app's icons: the fly close up on the napkin, square. The maskable
// one is framed looser, since a launcher may cut it to a circle 80% as wide.
const WEB_ICON: Shot = { ...ICON, layer: "all", camera: { ...ICON.camera, distance: ICON.camera.distance * 1.05, fov: ICON.camera.fov } };
const WEB_MASKABLE: Shot = { ...WEB_ICON, camera: { ...WEB_ICON.camera, distance: WEB_ICON.camera.distance * 1.32 } };
// The browser tab's icon: the fly alone, nearly from above, so it reads at 32 pixels.
const FAVICON: Shot = { ...ICON, layer: "fly", camera: { around: Math.PI + 0.4, distance: 1.2, height: 4.0, fov: 34, aimAbove: 0.3 }, turn: -0.9, pose: { wings: 0 } };
// The link preview: the launch image's shot at the shape link previews use.
const PREVIEW: Shot = { ...SPLASH, camera: { ...SPLASH.camera, distance: 10, shiftRight: 2.2 }, wordmark: { y: 0.3, size: 0.15 } };
// The iPhone and iPad icon is the web app's, at 1024, opaque (the system rounds the corners), and
// the same at night for the dark appearance. Their launch image: the fly in the middle of a square
// that the launch screen crops to the screen's shape, from a tall phone's narrow strip to a wide
// iPad's band, so the fly is in every crop; no wordmark, since where the loading screen puts it
// depends on the screen.
const IOS_LAUNCH: Shot = { ...ICON, layer: "all", camera: { ...ICON.camera, distance: 16, height: 3.4, fov: 30, aimAbove: 0.9 } };

const jobs: { file: string; shot: ArtShot }[] = [];
for (const [file, size] of [["icon-512", 512], ["icon-192", 192], ["apple-touch-icon", 180]] as const) jobs.push({ file: `web/${file}.png`, shot: { ...WEB_ICON, width: size, height: size } });
jobs.push({ file: "web/icon-maskable-512.png", shot: { ...WEB_MASKABLE, width: 512, height: 512 } });
jobs.push({ file: "web/favicon.png", shot: { ...FAVICON, width: 64, height: 64 } });
jobs.push({ file: "web/preview.png", shot: { ...PREVIEW, width: 1200, height: 630 } });
jobs.push({ file: "ios/icon.png", shot: { ...WEB_ICON, width: 1024, height: 1024 } });
jobs.push({ file: "ios/icon-dark.png", shot: { ...WEB_ICON, time: "dusk", width: 1024, height: 1024 } });
jobs.push({ file: "ios/launch.png", shot: { ...IOS_LAUNCH, width: 2048, height: 2048 } });
for (const [w, h] of [[1280, 768], [800, 480], [400, 240]]) {
  for (const [name, layer] of ICON_LAYERS) jobs.push({ file: `tv-icon/${w}x${h}/${name}.png`, shot: { ...ICON, camera: { ...ICON.camera, aimAbove: 0.3 }, layer, width: w, height: h } });
}
for (const [variant, w] of [["standard", 1920], ["wide", 2320]] as const) {
  for (const scale of [1, 2]) jobs.push({ file: `top-shelf/${variant}/top-shelf${scale === 2 ? "@2x" : ""}.png`, shot: { ...SHELF, width: w * scale, height: 720 * scale } });
}
for (const [w, h] of [[1920, 1080], [3840, 2160]]) jobs.push({ file: `splash/splash-${w}x${h}.png`, shot: { ...SPLASH, width: w, height: h } });

const { url, server } = await startServer();
let browser;
try {
  browser = await chromium.launch({ executablePath: chromiumPath(), args: gpuFlags() });
  const page = await browser.newPage();
  page.on("pageerror", (error) => console.error(error.message));
  await page.goto(new URL("art.html", url).href);
  await page.waitForFunction(() => (globalThis as unknown as { __art?: { ready: boolean } }).__art?.ready, null, { timeout: 60_000 });
  await page.addStyleTag({ content: "html,body{background:transparent!important}canvas{display:none}#export{display:block}" });
  await page.evaluate(() => {
    const img = document.createElement("img");
    img.id = "export";
    document.body.appendChild(img);
  });
  for (const { file, shot } of jobs.filter((j) => j.file.startsWith(only))) {
    const data = await page.evaluate((s) => (globalThis as unknown as { __art: { render(s: ArtShot): string } }).__art.render(s), shot);
    const target = path.join(out, file);
    mkdirSync(path.dirname(target), { recursive: true });
    await page.evaluate(async data => {
      const img = document.getElementById("export") as HTMLImageElement;
      img.src = data;
      await img.decode();
    }, data);
    // Chromium's opaque screenshots encode RGB; canvas.toDataURL retains an alpha channel.
    await page.locator("#export").screenshot({ path: target, omitBackground: shot.layer === "fly" || shot.layer === "table" });
    console.log(`${file} ${shot.width}x${shot.height}`);
  }
  // A regenerated stack must not retain layers from another composition.
  for (const [w, h] of [[1280, 768], [800, 480], [400, 240]]) {
    const prefix = `tv-icon/${w}x${h}/`;
    const files = jobs.filter(j => j.file.startsWith(prefix)).map(j => j.file);
    if (!files.every(file => file.startsWith(only))) continue;
    const keep = new Set(files.map(file => path.basename(file)));
    const dir = path.join(out, prefix);
    for (const file of readdirSync(dir)) if (file.endsWith(".png") && !keep.has(file)) rmSync(path.join(dir, file));
  }
} finally {
  await browser?.close();
  server.kill();
}
