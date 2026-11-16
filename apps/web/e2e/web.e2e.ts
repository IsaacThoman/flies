// Opens the built site as a visitor would: built into a scratch folder and
// served as plain files from a folder on a static host (scripts/serve.ts,
// docs/web.md), in a real GPU-rendered Chromium. The first load, on a slow
// connection that breaks off partway, counts the brain's bytes as they come
// and carries on from where it broke, and runs the brain built as
// WebAssembly, served as application/wasm; `?brain=typescript` runs the
// TypeScript one from the same kept connectome; the second loads with the network off,
// from the service worker and the brain's cache; a tab hidden for a while
// (headless Chromium can't hide one, so the page is told it is) stops the
// fly's life and its sound and wakes without a jump; a lost graphics context
// comes back; the wallpaper holds the screen
// awake and lets go when hidden; and nothing is fetched from anywhere but the
// site itself.
//
//   npm run e2e                   (with play.e2e.ts)
//   node apps/web/e2e/web.e2e.ts [--shots <dir>]   (screenshots of each stage, for looking at)
//
// Needs the connectome (npm run brain:fetch) and a Playwright Chromium.

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { build } from "vite";
import { fullChromiumPath, gpuFlags, readState, waitFor } from "../../../scripts/play.ts";
import { serveSite } from "../../../scripts/serve.ts";

const root = path.join(import.meta.dirname, "../../..");
const args = process.argv.slice(2);
const shots = args.includes("--shots") ? path.resolve(args[args.indexOf("--shots") + 1]) : null;
const step = (name: string) => console.log(`· ${name}`);
/** Where the first part of the brain is cut off the first time, bytes. */
const CUT_AT = 3_000_000;

const out = mkdtempSync(path.join(tmpdir(), "fly-web-e2e-"));
await build({ configFile: path.join(root, "vite.config.ts"), logLevel: "warn", build: { outDir: out, emptyOutDir: true } });
let cuts = 0;
const site = await serveSite({ dir: out, base: "/some/folder/fly/", cut: (file) => (file.startsWith("brain/connectome.") && cuts++ === 0 ? CUT_AT : null) });
const browser = await chromium.launch({ executablePath: fullChromiumPath(), args: gpuFlags() });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
const errors: string[] = [];
const elsewhere: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
// The one broken download is this test's doing.
let brokenOff = 1;
page.on("console", (message) => {
  if (message.type() !== "error") return;
  if (message.text().includes("ERR_CONTENT_LENGTH_MISMATCH") && brokenOff-- > 0) return;
  errors.push(message.text());
});
context.on("request", (request) => {
  const url = request.url();
  if (!url.startsWith(new URL(site.url).origin) && !/^(data|blob):/.test(url)) elsewhere.push(url);
});
const shot = async (name: string) => {
  if (shots) await page.locator("#game").screenshot({ path: path.join(shots, `${name}.png`) });
};
const brainRequests = () => site.requests.filter((r) => r.path.includes("/brain/"));
const moduleTypes: string[] = [];
context.on("response", (response) => {
  if (response.url().endsWith(".wasm")) moduleTypes.push(response.headers()["content-type"] ?? "");
});
let failed = false;

try {
  step("first visit, on a slow connection: the brain's bytes are counted as they arrive");
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 80, downloadThroughput: 2_500_000, uploadThroughput: 500_000 });
  const started = Date.now();
  await page.goto(site.url);
  await waitFor(page, "screen=loading,phase=download,received>0", 30_000);
  const seen = new Set<number>();
  let total = 0;
  for (let i = 0; i < 80; i++) {
    const s = await readState(page);
    if (s.phase !== "download") break;
    seen.add(Number(s.received));
    total = Number(s.total);
    if (i === 6) await shot("1-downloading");
    await page.waitForTimeout(100);
  }
  assert.ok(seen.size >= 5, `the bytes counted up (${[...seen].join(", ")})`);
  const awake = await waitFor(page, "brain=running,screen=title", 120_000);
  console.log(`  ${(total / 1e6).toFixed(1)} MB, awake after ${((Date.now() - started) / 1000).toFixed(1)} s`);
  assert.equal(awake.from, "network");
  assert.equal(awake.neurons, "166700");
  assert.equal(awake.brainEngine, "wasm", "the brain built as WebAssembly");
  assert.deepEqual(moduleTypes, ["application/wasm"]);
  assert.ok(total > 14_000_000, `the connectome and the module counted (${total} bytes)`);
  await shot("2-title");

  step("the connection broke off partway, and the download carried on from there");
  const firstPart = brainRequests().find((r) => r.path.includes("/brain/connectome."))!.path;
  const first = brainRequests().filter((r) => r.path === firstPart);
  assert.equal(first.length, 2, "asked for again once");
  assert.equal(first[0].range, null);
  // From what had arrived: up to the cut, less what was still on its way when the connection went.
  const resumedAt = Number(/^bytes=(\d+)-$/.exec(first[1].range ?? "")?.[1]);
  assert.ok(resumedAt > CUT_AT / 2 && resumedAt <= CUT_AT, `resumed at ${first[1].range}`);

  step("second visit with the network off: the page from the service worker, the brain from the cache");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  const before = site.requests.length;
  await context.setOffline(true);
  const again = Date.now();
  await page.reload();
  const offline = await waitFor(page, "brain=running,screen=title", 60_000);
  console.log(`  awake after ${((Date.now() - again) / 1000).toFixed(1)} s`);
  assert.equal(offline.from, "cache");
  assert.equal(offline.brainEngine, "wasm");
  // The browser's own check for a new service worker escapes Playwright's offline switch; nothing of the page's may.
  const reached = site.requests.slice(before).filter((r) => !r.path.endsWith("/sw.js"));
  assert.deepEqual(reached.map((r) => r.path), [], "nothing reached the server");
  await context.setOffline(false);

  step("?brain=typescript runs the TypeScript brain on the kept connectome, without the module");
  const asked = site.requests.length;
  await page.goto(`${site.url}?brain=typescript`);
  const typescript = await waitFor(page, "brain=running,screen=title", 60_000);
  assert.equal(typescript.brainEngine, "typescript");
  assert.equal(typescript.from, "cache");
  assert.deepEqual(site.requests.slice(asked).filter((r) => r.path.includes("/brain/")), [], "nothing of the brain fetched");
  await page.goto(site.url);
  await waitFor(page, "brain=running,screen=title,brainEngine=wasm", 60_000);

  step("the wallpaper keeps the screen awake");
  await page.keyboard.press("ArrowDown");
  await waitFor(page, "focus=watch");
  await page.keyboard.press("Enter");
  await waitFor(page, "wallpaper=true,wakeLock=held", 10_000);

  step("hidden for a while: it sleeps, lets the screen go, and wakes without a jump");
  const hide = (hidden: boolean) =>
    page.evaluate((h) => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (h ? "hidden" : "visible") });
      document.dispatchEvent(new Event("visibilitychange"));
    }, hidden);
  const lived = () => page.evaluate(() => (globalThis as unknown as { __fly: { time: number; life: { time: number } } }).__fly.life.time);
  await hide(true);
  await waitFor(page, "hidden=true,wakeLock=none,audio~^(?!running)", 3000);
  const livedBefore = await lived();
  await page.waitForTimeout(6000);
  await hide(false);
  const back = await waitFor(page, "hidden=false,wallpaper=true,wakeLock=held,audio=running", 5000);
  assert.equal(back.brain, "running", "a frozen page is not a stalled brain");
  const jumped = (await lived()) - livedBefore;
  assert.ok(jumped < 1.5, `the fly lived ${jumped.toFixed(2)} s across six seconds asleep`);
  await page.waitForTimeout(2500);
  assert.equal((await readState(page)).brain, "running");

  step("the graphics context is lost and comes back");
  await page.evaluate(() => {
    const gl = (document.getElementById("game") as HTMLCanvasElement).getContext("webgl2")!;
    const lose = gl.getExtension("WEBGL_lose_context")!;
    (globalThis as unknown as { __lose: WEBGL_lose_context }).__lose = lose;
    lose.loseContext();
  });
  await waitFor(page, "gl=lost", 5000);
  await page.waitForTimeout(500);
  await page.evaluate(() => (globalThis as unknown as { __lose: WEBGL_lose_context }).__lose.restoreContext());
  await waitFor(page, "gl=ok,brain=running", 5000);
  await page.waitForTimeout(1500);
  const drawn = await readState(page);
  assert.ok(Number(drawn.calls) > 5, `drawing again (${drawn.calls} draws)`);
  // Read in a frame callback after the game's, while what it drew is still in the canvas.
  const colours = await page.evaluate(async () => {
    const canvas = document.getElementById("game") as HTMLCanvasElement;
    const copy = document.createElement("canvas");
    copy.width = 64;
    copy.height = 48;
    const g = copy.getContext("2d")!;
    let most = 0;
    for (let tries = 0; tries < 6; tries++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      g.drawImage(canvas, 0, 0, 64, 48);
      const data = g.getImageData(0, 0, 64, 48).data;
      const seen = new Set<number>();
      for (let i = 0; i < data.length; i += 4) seen.add((data[i] >> 4) * 256 + (data[i + 1] >> 4) * 16 + (data[i + 2] >> 4));
      most = Math.max(most, seen.size);
    }
    return most;
  });
  assert.ok(colours > 20, `a picture, not a blank (${colours} colours)`);
  await shot("3-restored");

  step("away and back: the page comes back working, from the back-forward cache or afresh");
  await page.evaluate(() => ((globalThis as unknown as { __kept: boolean }).__kept = true));
  await page.goto("about:blank");
  await page.goBack();
  const returned = await waitFor(page, "brain=running", 60_000);
  const restored = await page.evaluate(() => (globalThis as unknown as { __kept?: boolean }).__kept === true);
  console.log(`  ${restored ? "restored from the back-forward cache" : "loaded afresh"}, on ${returned.screen}`);

  step("a first visit that loses the network says so, and wakes when it is back");
  const fresh = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const lonely = await fresh.newPage();
  lonely.on("pageerror", (error) => errors.push(error.message));
  await lonely.route("**/brain/**", (route) => route.abort("internetdisconnected"));
  await lonely.goto(site.url);
  await fresh.setOffline(true);
  await waitFor(lonely, "brain=failed,failure=offline", 30_000);
  if (shots) await lonely.locator("#game").screenshot({ path: path.join(shots, "4-offline.png") });
  await lonely.unroute("**/brain/**");
  await fresh.setOffline(false);
  await waitFor(lonely, "brain=running", 60_000);
  await fresh.close();

  step("a browser without WebGL 2 is told so, in the game's own look");
  const flat = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const blind = await flat.newPage();
  await blind.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return type === "webgl2" ? null : (getContext as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof getContext;
  });
  await blind.goto(site.url);
  await waitFor(blind, "failure=webgl", 10_000);
  if (shots) await blind.locator("#game").screenshot({ path: path.join(shots, "5-no-webgl.png") });
  await flat.close();

  step("nothing was asked of any other site");
  assert.deepEqual(elsewhere, []);
  assert.deepEqual(errors, [], "page errors");
  console.log("passed");
} catch (error) {
  failed = true;
  console.error("failed:", error instanceof Error ? error.message : error);
  console.error("state:", JSON.stringify(await readState(page).catch(() => ({}))));
  if (errors.length) console.error("page errors:\n" + errors.join("\n"));
} finally {
  await browser.close();
  await site.close();
  rmSync(out, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
