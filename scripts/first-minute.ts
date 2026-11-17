// Cold-cache evidence uses real elapsed time: these are photographs of the wait,
// not a simulation advanced faster than the network. Build and serve first.
// node scripts/first-minute.ts --url http://127.0.0.1:8080/ --out /tmp/first-minute
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import { chromiumPath, contextFor, gpuFlags, readState } from "./play.ts";

// Playwright normally waits for fonts before a screenshot, hiding blank startup.
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = "1";

const { values } = parseArgs({ options: { url: { type: "string" }, out: { type: "string" } } });
if (!values.url || !values.out) throw new Error("Pass --url and --out; use a production build for network timings.");
const out = path.resolve(values.out);
const networks = { "4G": { latency: 170, downloadThroughput: 1_125_000, uploadThroughput: 112_500 }, slow3G: { latency: 400, downloadThroughput: 50_000, uploadThroughput: 50_000 } };
const seconds = [0.5, 2, 5, 10, 20, 40, 60];
const browser = await chromium.launch({ executablePath: chromiumPath(), args: gpuFlags() });
try {
  for (const device of ["desktop", "phone"]) {
    for (const [network, throttle] of Object.entries(networks)) {
      const dir = path.join(out, `${device}-${network}`);
      await mkdir(dir, { recursive: true });
      const context = await browser.newContext({ ...contextFor({ url: values.url, ...(device === "phone" ? { device: "iPhone 15" } : { width: 1280, height: 720 }) }), serviceWorkers: "block" });
      try {
        const page = await context.newPage();
        const cdp = await context.newCDPSession(page);
        await cdp.send("Network.enable");
        await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
        await cdp.send("Network.emulateNetworkConditions", { offline: false, ...throttle });
        await page.addInitScript(() => {
          const timings = { boot: 0, firstFrame: 0, title: 0 };
          (globalThis as unknown as { __firstMinute: typeof timings }).__firstMinute = timings;
          const observe = () => {
            const data = document.getElementById("game")?.dataset;
            const now = performance.now();
            if (data?.boot && !timings.boot) timings.boot = now;
            if (data?.ready && !timings.firstFrame) timings.firstFrame = now;
            if (data?.screen === "title" && !timings.title) timings.title = now;
          };
          new MutationObserver(observe).observe(document, { subtree: true, attributes: true, childList: true });
        });
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const start = Date.now();
        await page.goto(values.url, { waitUntil: "commit" });
        const photographs = [];
        for (const second of seconds) {
          await page.waitForTimeout(Math.max(0, start + second * 1000 - Date.now()));
          // Fonts still downloading must not delay a photograph of an unfinished page.
          await page.screenshot({ path: path.join(dir, `${second}s.png`), timeout: 60_000 });
          photographs.push({ requestedSecond: second, actualSecond: (Date.now() - start) / 1000, state: await readState(page) });
        }
        await page.waitForFunction(() => (globalThis as unknown as { __firstMinute: { title: number } }).__firstMinute.title > 0, null, { timeout: 600_000 });
        const timings = await page.evaluate(() => (globalThis as unknown as { __firstMinute: Record<string, number> }).__firstMinute);
        const report = { device, network, throttle, timings, errors, photographs };
        await writeFile(path.join(dir, "measurements.json"), JSON.stringify(report, null, 2));
        console.log(device, network, timings);
      } finally {
        await context.close();
      }
    }
  }
  // A plain contact sheet makes the same photographs reviewable at a glance.
  const sheet = await browser.newPage({ viewport: { width: 1400, height: 650 }, deviceScaleFactor: 1 });
  for (const device of ["desktop", "phone"]) for (const network of Object.keys(networks)) {
    const dir = path.join(out, `${device}-${network}`);
    const images = await Promise.all(seconds.map(async (s) => `<figure><img src="data:image/png;base64,${(await readFile(path.join(dir, `${s}s.png`))).toString("base64")}"><figcaption>${s}s</figcaption></figure>`));
    await sheet.setContent(`<style>body{margin:0;background:#e7f4ff;display:flex;font:16px system-ui}figure{margin:4px;width:192px}img{width:100%;display:block}figcaption{text-align:center;padding:6px}</style>${images.join("")}`);
    await sheet.screenshot({ path: path.join(out, `${device}-${network}-strip.png`), fullPage: true });
  }
} finally {
  await browser.close();
}
