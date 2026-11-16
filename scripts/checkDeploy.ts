// Checks a running container, without starting a server or rebuilding it.
// docker compose cp web:/srv/. <scratch-dir>
// node scripts/checkDeploy.ts --url http://localhost/ --dir <scratch-dir>
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import { fullChromiumPath, gpuFlags, readState, waitFor } from "./play.ts";
import { cacheControl, TYPES } from "./serve.ts";

const { values } = parseArgs({ options: { url: { type: "string", default: "http://localhost/" }, dir: { type: "string", default: "dist" } } });
const base = new URL(values.url);
assert.ok(base.pathname.endsWith("/"), "--url must end in /");
const files = readdirSync(values.dir, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => path.relative(values.dir, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"));
assert.ok(files.includes("index.html"), "--dir must contain the running image's dist files");
const brains = files.filter((file) => /^brain\/connectome\./.test(file));
assert.ok(brains.length > 0, "the build must include the real brain");

console.log("· HEAD every built file: MIME type, cache lifetime, byte ranges, no encoded brain or PNG");
for (const file of files) {
  const response = await fetch(new URL(file, base), { method: "HEAD", headers: { "Accept-Encoding": "gzip" } });
  assert.equal(response.status, 200, file);
  const type = TYPES[path.extname(file)] ?? (file.endsWith(".wasm") ? "application/wasm" : "application/octet-stream");
  assert.equal(response.headers.get("content-type")?.split(";")[0], type.split(";")[0], file);
  assert.equal(response.headers.get("cache-control"), cacheControl(file), file);
  if (/\.bin$|\.png$/.test(file)) {
    assert.equal(response.headers.get("content-encoding"), null, file);
    assert.equal(response.headers.get("accept-ranges"), "bytes", file);
  }
}
const entry = await fetch(base, { method: "HEAD" });
assert.equal(entry.headers.get("cache-control"), "no-cache");
const spa = await fetch(new URL("a-page-that-does-not-exist", base));
assert.equal(spa.status, 200);
assert.equal(spa.headers.get("cache-control"), "no-cache");
assert.match(spa.headers.get("content-type") ?? "", /^text\/html/);
for (const file of ["brain/missing.bin", "assets/missing.js"]) {
  assert.equal((await fetch(new URL(file, base))).status, 404, file);
}
const script = files.find((file) => /^assets\/index-.*\.js$/.test(file));
assert.ok(script);
const compressed = await fetch(new URL(script, base), { headers: { "Accept-Encoding": "gzip" } });
assert.equal(compressed.headers.get("content-encoding"), "gzip", "JavaScript is compressed");
await compressed.arrayBuffer();
for (const file of files.filter((file) => file.startsWith("brain/"))) {
  const ranged = await fetch(new URL(file, base), { headers: { Range: "bytes=10-19", "Accept-Encoding": "gzip" } });
  assert.equal(ranged.status, 206, file);
  assert.match(ranged.headers.get("content-range") ?? "", /^bytes 10-19\/\d+$/);
  assert.equal(ranged.headers.get("content-encoding"), null);
  assert.deepEqual(Buffer.from(await ranged.arrayBuffer()), readFileSync(path.join(values.dir, file)).subarray(10, 20), file);
}

const browser = await chromium.launch({ executablePath: fullChromiumPath(), args: gpuFlags() });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors: string[] = [];
  const elsewhere: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  context.on("request", (request) => {
    if (!request.url().startsWith(base.origin + "/") && !/^(data|blob):/.test(request.url())) elsewhere.push(request.url());
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 80, downloadThroughput: 2_500_000, uploadThroughput: 500_000 });
  console.log("· First visit: real brain download with increasing progress");
  await page.goto(base.href);
  await waitFor(page, "screen=loading,phase=download,received>0", 30_000);
  const progress = new Set<number>();
  for (let i = 0; i < 100; i++) {
    const state = await readState(page);
    if (state.phase !== "download") break;
    progress.add(Number(state.received));
    await page.waitForTimeout(100);
  }
  assert.ok(progress.size >= 5, `progress advanced ${progress.size} times`);
  const first = await waitFor(page, "brain=running,screen=title", 120_000);
  assert.equal(first.from, "network");
  assert.equal(first.neurons, "166700");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  console.log("· Second visit: offline page and brain from caches");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await context.setOffline(true);
  await page.reload();
  const second = await waitFor(page, "brain=running,screen=title", 60_000);
  assert.equal(second.from, "cache");
  assert.equal(second.neurons, "166700");
  assert.deepEqual(errors, [], "page errors");
  assert.deepEqual(elsewhere, [], "requests outside the site");
  console.log(`passed (${files.length} files, ${brains.length} connectome parts)`);
} finally {
  await browser.close();
}
