// Fixed-step game captures. --out previews elsewhere; --only selects a device/story prefix.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { chromiumPath, gpuFlags, startServer } from "./play.ts";
import type { StoreStory } from "../apps/web/src/store-art.ts";
const stories: StoreStory[] = ["01-portrait", "02-feeding", "03-flight", "04-inside", "05-eyes", "06-rain", "07-night", "08-together"];
const args = process.argv.slice(2);
const out = args.includes("--out") ? path.resolve(args[args.indexOf("--out") + 1]) : path.resolve("assets/store");
const verify = args.includes("--verify");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : "";
const devices = [["iphone-6.9", 2868, 1320], ["ipad-13", 2752, 2064], ["tv-1080", 1920, 1080], ["tv-4k", 3840, 2160]] as const;
const { url, server } = await startServer();
let browser;
try {
  browser = await chromium.launch({ executablePath: chromiumPath(), args: gpuFlags() });
  for (const [device, width, height] of devices) {
    for (const story of stories) {
      const name = `${device}/${story}`;
      if (!name.startsWith(only)) continue;
      for (let pass = 0; pass < (verify ? 2 : 1); pass++) {
      const mobile = !device.startsWith("tv-");
      const scale = device === "iphone-6.9" ? 3 : device === "ipad-13" ? 2 : 1;
      const page = await browser.newPage({ viewport: { width: width / scale, height: height / scale }, deviceScaleFactor: scale, hasTouch: mobile, isMobile: mobile });
      try {
        await page.clock.setFixedTime(new Date("2026-06-21T12:00:00Z"));
        await page.goto(new URL("store.html", url).href);
        await page.waitForFunction(() => (globalThis as unknown as { __store?: { ready: boolean } }).__store?.ready);
        const evidence = await page.evaluate(async ({ story, tv }) => {
          const api = (globalThis as unknown as { __store: { capture(story: StoreStory, tv: boolean): Promise<unknown> } }).__store;
          return api.capture(story, tv);
        }, { story, tv: device.startsWith("tv-") });
        const target = path.join(out, name);
        mkdirSync(path.dirname(target), { recursive: true });
        const png = await page.locator("#game").screenshot({ animations: "disabled" });
        if (png.readUInt32BE(16) !== width || png.readUInt32BE(20) !== height || png[25] !== 2) throw new Error(`Invalid size or alpha channel: ${name}`);
        if (pass && !png.equals(readFileSync(`${target}.png`))) throw new Error(`Non-deterministic capture: ${name}`);
        writeFileSync(`${target}.png`, png);
        writeFileSync(`${target}.json`, JSON.stringify({ width, height, ...evidence as object }, null, 2) + "\n");
        console.log(name, JSON.stringify(evidence));
      } finally { await page.close(); }
      }
    }
  }
} finally { await browser?.close(); server.kill(); }
