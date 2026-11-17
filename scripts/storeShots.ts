// Fixed-step game captures. --out previews elsewhere; --only selects a device/story prefix.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { chromiumPath, gpuFlags, startServer } from "./play.ts";
import { storeRoom } from "./storeRoom.ts";
import type { StoreStory } from "../apps/web/src/store-art.ts";
const stories: StoreStory[] = ["01-portrait", "02-feeding", "03-flight", "04-inside", "05-eyes", "06-rain", "07-night", "08-together"];
const args = process.argv.slice(2);
const out = args.includes("--out") ? path.resolve(args[args.indexOf("--out") + 1]) : path.join(import.meta.dirname, "..", "assets", "store");
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
        const page = await browser.newPage({ viewport: { width: width / scale, height: height / scale }, deviceScaleFactor: scale, hasTouch: mobile, isMobile: mobile, timezoneId: "UTC" });
        page.on("pageerror", error => console.error(error.message));
        try {
          await page.exposeFunction("__storeRoom", storeRoom());
          await page.clock.setFixedTime(new Date("2026-06-21T08:00:00Z"));
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
          const record = JSON.stringify({ width, height, ...evidence as object }, null, 2) + "\n";
          if (pass) {
            if (record !== readFileSync(`${target}.json`, "utf8")) throw new Error(`Non-deterministic simulation: ${name}`);
            const previous = readFileSync(`${target}.png`);
            if (!png.equals(previous)) {
              const difference = await page.evaluate(async ([a, b]) => {
                const pixels = async (data: string) => {
                  const img = new Image(); img.src = `data:image/png;base64,${data}`; await img.decode();
                  const canvas = document.createElement("canvas"); canvas.width = img.width; canvas.height = img.height;
                  const g = canvas.getContext("2d")!; g.drawImage(img, 0, 0);
                  return g.getImageData(0, 0, img.width, img.height).data;
                };
                const x = await pixels(a), y = await pixels(b);
                let changed = 0, max = 0;
                for (let i = 0; i < x.length; i += 4) {
                  const delta = Math.max(Math.abs(x[i] - y[i]), Math.abs(x[i + 1] - y[i + 1]), Math.abs(x[i + 2] - y[i + 2]));
                  if (delta) changed++;
                  max = Math.max(max, delta);
                }
                return { changed, max };
              }, [previous.toString("base64"), png.toString("base64")]);
              // Coplanar glass/nerve fragments can round a channel differently by a few channel levels across transparent layers.
              if (difference.max > 3 || difference.changed > width * height * 0.0001) throw new Error(`Non-deterministic render: ${name} ${JSON.stringify(difference)}`);
              console.log(name, "GPU rounding", difference);
            }
          } else {
            writeFileSync(`${target}.png`, png);
            writeFileSync(`${target}.json`, record);
          }
          console.log(name, JSON.stringify(evidence));
        } finally { await page.close(); }
      }
    }
  }
} finally { await browser?.close(); server.kill(); }
