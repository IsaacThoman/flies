// Measures the built game in a fresh browser: how long it takes to wake, how
// fast its frames come, what the picture settles at (apps/web/src/quality.ts),
// and what its brain costs. For docs/web.md's numbers.
//
//   npm run build && node scripts/measure.ts [--browser chromium|webkit|firefox] [--cpu 4]
//       [--network slow] [--scenario watch|play] [--level auto|0-5] [--brain auto|wasm|typescript]
//       [--seconds 60] [--out run.json]
//
// --cpu slows Chromium's page (the frames) by that factor. Chromium won't slow
// a worker that way, so the brain is measured directly instead: the wall time
// its worker spent on each tick against the fly time the tick covered, which
// is what a slower CPU multiplies; the report gives the speed that implies on
// a CPU 4 and 6 times slower. --network slow is a 1.6 Mbit/s, 150 ms
// connection. --level pins the picture's level instead of letting the game
// choose. "watch" is the wallpaper; "play" throws the ball every 3 s, which
// keeps the eyes and the brain busiest. --brain picks the brain built as
// WebAssembly or the TypeScript one (the page's ?brain=) instead of letting
// the page choose. The report says which ran, how long its worker took to
// build it, and, in Chromium, the memory of the page's processes, the worker
// and its brain included. WEBKIT_PATH and FIREFOX_PATH name other browser builds.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium, firefox, webkit } from "playwright";
import { chromiumPath, gpuFlags, readState, waitFor } from "./play.ts";
import { serveSite } from "./serve.ts";

const { values } = parseArgs({
  options: {
    browser: { type: "string", default: "chromium" },
    cpu: { type: "string", default: "1" },
    network: { type: "string", default: "normal" },
    scenario: { type: "string", default: "watch" },
    level: { type: "string", default: "auto" },
    brain: { type: "string", default: "auto" },
    seconds: { type: "string", default: "60" },
    out: { type: "string" },
  },
});
const cpu = Number(values.cpu);
const seconds = Number(values.seconds);
if (
  !["chromium", "webkit", "firefox"].includes(values.browser) ||
  !["watch", "play"].includes(values.scenario) ||
  !/^(auto|[0-5])$/.test(values.level) ||
  !["auto", "wasm", "typescript"].includes(values.brain)
) {
  throw new Error("--browser chromium|webkit|firefox, --scenario watch|play, --level auto|0-5, --brain auto|wasm|typescript");
}
if (values.browser !== "chromium" && (cpu !== 1 || values.network !== "normal")) throw new Error("--cpu and --network need Chromium");

/** Resident memory of the page's process, MB: the page and its workers, the brain's among them. */
function pageMemory(profile: string): number | null {
  try {
    const table = execFileSync("ps", ["-ax", "-o", "pid=,ppid=,rss=,command="], { encoding: "utf8", maxBuffer: 1 << 26 })
      .split("\n")
      .map((line) => /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line))
      .filter((m) => m !== null)
      .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), rss: Number(m[3]), command: m[4] }));
    const root = table.find((p) => p.command.includes(profile) && !p.command.includes("--type="));
    if (!root) return null;
    const renderers = table.filter((p) => p.ppid === root.pid && /--type=renderer/.test(p.command) && !/--extension-process/.test(p.command));
    return renderers.reduce((sum, p) => sum + p.rss, 0) / 1024;
  } catch {
    return null;
  }
}

/** Playwright's WebKit, or the newest in its cache. */
function webkitPath() {
  if (process.env.WEBKIT_PATH) return process.env.WEBKIT_PATH;
  if (existsSync(webkit.executablePath())) return undefined;
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(os.homedir(), process.platform === "darwin" ? "Library/Caches/ms-playwright" : ".cache/ms-playwright");
  const builds = existsSync(cache) ? readdirSync(cache).filter((d) => /^webkit-\d+$/.test(d)).sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1])) : [];
  return builds.map((d) => path.join(cache, d, "pw_run.sh")).find(existsSync);
}

const quantile = (values: number[], q: number) => {
  if (!values.length) return null;
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.round((sorted.length - 1) * q))];
};

const dist = path.join(import.meta.dirname, "../dist");
const site = await serveSite({ dir: dist, base: "/" });
const engine = { chromium, webkit, firefox }[values.browser as "chromium" | "webkit" | "firefox"];
const executablePath = values.browser === "chromium" ? chromiumPath() : values.browser === "webkit" ? webkitPath() : process.env.FIREFOX_PATH;
// A profile of its own each run: nothing kept from the last.
const profile = mkdtempSync(path.join(os.tmpdir(), "fly-measure-"));
const context = await engine.launchPersistentContext(profile, { headless: true, executablePath, args: values.browser === "chromium" ? gpuFlags() : undefined, viewport: { width: 1280, height: 720 } });
const page = context.pages()[0] ?? (await context.newPage());
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
const report: Record<string, unknown> = { options: values, browser: `${values.browser} ${context.browser()?.version() ?? ""}`.trim(), loadAverage: os.loadavg(), errors };

try {
  if (values.browser === "chromium") {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
    if (values.network === "slow") {
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 200_000, uploadThroughput: 93_750 });
    }
  }
  const started = Date.now();
  await page.goto(values.brain === "auto" ? site.url : `${site.url}?brain=${values.brain}`);
  const progress: [number, number][] = [];
  for (;;) {
    const s = await readState(page);
    if (s.phase === "download" && s.received) progress.push([(Date.now() - started) / 1000, Number(s.received)]);
    if (s.brain === "failed") throw new Error(`the brain failed: ${s.failure} ${s.error ?? ""}`);
    if (s.brain === "running" && !report.awake) report.awake = (Date.now() - started) / 1000;
    if (s.screen === "title") break;
    if (Date.now() - started > 300_000) throw new Error("not awake after 5 minutes");
    await page.waitForTimeout(100);
  }
  report.title = (Date.now() - started) / 1000;
  report.engine = (await readState(page)).brainEngine;
  report.buildMs = await page.evaluate(() => (globalThis as unknown as { __fly: { brain: { buildMs?: number | null } } }).__fly.brain.buildMs ?? null);
  report.download = { samples: progress.length, steady: progress.every(([, n], i) => i === 0 || n >= progress[i - 1][1]) };

  // Every tick the brain answers, seen once: the game asks the governor about each frame after it has read the brain's state.
  await page.evaluate((level) => {
    type Fly = { brain: { state: { stats: { simMs: number; wallMs: number } } | null }; quality: { level: number; changes: number; frame: (ms: number, speed: number) => void } };
    const fly = (globalThis as unknown as { __fly: Fly }).__fly;
    const ticks: [number, number, number][] = [];
    let seen = fly.brain.state;
    const judge = fly.quality.frame.bind(fly.quality);
    fly.quality.frame = (ms, speed) => {
      const state = fly.brain.state;
      if (state && state !== seen) ticks.push([performance.now(), state.stats.wallMs, state.stats.simMs]);
      seen = state;
      if (level === "auto") judge(ms, speed);
    };
    if (level !== "auto") {
      fly.quality.level = Number(level);
      fly.quality.changes++;
    }
    (globalThis as unknown as { __ticks: typeof ticks }).__ticks = ticks;
  }, values.level);
  if (values.scenario === "watch") {
    await page.keyboard.press("ArrowDown");
    await waitFor(page, "focus=watch");
    await page.keyboard.press("Enter");
    await waitFor(page, "wallpaper=true");
  } else {
    await page.keyboard.press("Enter");
    await waitFor(page, "screen=play");
    await page.keyboard.press("ArrowRight");
    await waitFor(page, "tool=swoop");
  }
  const from = await page.evaluate(() => performance.now());
  const samples: Record<string, string>[] = [];
  for (let t = 0; t < seconds * 2; t++) {
    if (values.scenario === "play" && t % 6 === 0) await page.keyboard.press("Enter");
    await page.waitForTimeout(500);
    samples.push(await readState(page));
  }
  const ticks = await page.evaluate((after) => (globalThis as unknown as { __ticks: [number, number, number][] }).__ticks.filter(([at]) => at >= after), from);
  // The brain's cost over each second: seconds of one core per second of fly time.
  const costs: number[] = [];
  for (let at = from; at + 1000 <= from + seconds * 1000; at += 1000) {
    const second = ticks.filter(([t]) => t >= at && t < at + 1000);
    const sim = second.reduce((sum, [, , s]) => sum + s, 0);
    if (sim > 0) costs.push(second.reduce((sum, [, w]) => sum + w, 0) / sim);
  }
  const numbers = (key: string) => samples.map((s) => Number(s[key])).filter((n) => n > 0);
  const windowMs = numbers("windowMs");
  const cost = quantile(costs, 0.5);
  const slowCost = quantile(costs, 0.9);
  report.frames = { fps: windowMs.length ? 1000 / quantile(windowMs, 0.5)! : null, slowFps: windowMs.length ? 1000 / quantile(windowMs, 0.9)! : null, jsMs: quantile(numbers("frameMs"), 0.5) };
  report.brain = {
    speed: quantile(numbers("speed"), 0.5),
    cost,
    slowCost,
    on4xSlowerCpu: cost && Math.min(1, 1 / (cost * 4)),
    on6xSlowerCpu: cost && Math.min(1, 1 / (cost * 6)),
  };
  report.levels = [...new Set(samples.map((s) => s.quality))];
  if (values.browser === "chromium") report.memoryMB = pageMemory(profile);
  report.end = Object.fromEntries(["quality", "fps", "pixels", "eyesDetail", "eyesRate", "calls", "triangles"].map((key) => [key, samples.at(-1)?.[key]]));
} catch (error) {
  report.failed = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  await context.close();
  await site.close();
  rmSync(profile, { recursive: true, force: true });
}
if (values.out) writeFileSync(values.out, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
