// Repeatable web measurements; raw evidence stays outside git. See docs/web-perf.md.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { gzipSync } from "node:zlib";
import { chromium } from "playwright";
import type { CDPSession, Page } from "playwright";
import { build } from "vite";
import type { Game } from "../apps/web/src/game.ts";
import { PLACES } from "../apps/web/src/places/catalog.ts";
import type { PlaceId } from "../apps/web/src/places/catalog.ts";
import { chromiumPath, gpuFlags, readState, waitFor, waitForGameTime } from "./play.ts";
import { serveSite } from "./serve.ts";
import { WorkerHeap } from "./webSoak.ts";
import { withHeavySlot } from "./heavySlot.ts";

export function distribution(xs: number[]) {
  assert.ok(xs.length > 0 && xs.every(Number.isFinite), "measurements must be finite and nonempty");
  const sorted = xs.toSorted((a, b) => a - b);
  const quantile = (q: number) => sorted[Math.round((sorted.length - 1) * q)];
  const mid = Math.floor(sorted.length / 2);
  return { n: xs.length, median: xs.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2, min: sorted[0], max: sorted.at(-1)!, p95: quantile(0.95), samples: xs };
}

type Probe = { firstFrame: number; title: number; frames: { ms: number; interval: number; quality: number; calls: number; triangles: number }[] };
declare global { var __webPerf: Probe; }

async function instrument(page: Page) {
  await page.addInitScript(() => {
    globalThis.__webPerf = { firstFrame: 0, title: 0, frames: [] };
    const raf = window.requestAnimationFrame.bind(window);
    let installed = false;
    let last = 0;
    window.requestAnimationFrame = (callback) => raf((now) => {
      const g = (globalThis as unknown as { __fly?: Game }).__fly;
      if (g && !installed) {
        installed = true;
        const frame = g.frame.bind(g);
        g.frame = (dt, time) => {
          const start = performance.now();
          frame(dt, time);
          const end = performance.now();
          const p = globalThis.__webPerf;
          p.firstFrame ||= end;
          if (g.canvas.dataset.screen === "title" && g.brain.status === "running") p.title ||= end;
          // Bounded storage: the memory lane clears this each sample.
          if (p.frames.length < 100_000) p.frames.push({ ms: end - start, interval: last ? time - last : 0, quality: g.quality?.level ?? 0, calls: g.stage.renderer.info.render.calls, triangles: g.stage.renderer.info.render.triangles });
          last = time;
        };
      }
      callback(now);
    });
  });
}

const root = path.join(import.meta.dirname, "..");
async function bundle(out: string, dir: string) {
  await withHeavySlot(async () => {
    await build({ configFile: path.join(root, "vite.config.ts"), logLevel: "warn", build: { outDir: dir, emptyOutDir: true }, plugins: [{
      name: "web-perf-modules",
      generateBundle(_options, chunks) {
        const modules = Object.values(chunks).filter(c => c.type === "chunk").map(c => ({ file: c.fileName, modules: Object.entries(c.modules).map(([id, info]) => ({ id: path.relative(root, id), renderedBytes: info.renderedLength })).sort((a, b) => b.renderedBytes - a.renderedBytes) }));
        writeFileSync(path.join(out, "modules.json"), JSON.stringify(modules, null, 2));
      },
    }] });
    const walk = (folder: string): string[] => readdirSync(folder).flatMap(name => {
      const file = path.join(folder, name);
      return statSync(file).isDirectory() ? walk(file) : [file];
    });
    writeFileSync(path.join(out, "bundle.json"), JSON.stringify(walk(dir).map(file => ({ file: path.relative(dir, file), bytes: statSync(file).size, gzipBytes: gzipSync(readFileSync(file), { level: 9 }).length })), null, 2));
  });
}

async function ready(page: Page, url: string) {
  await page.goto(url);
  await waitFor(page, "brain=running,screen=title", 180_000);
  await page.waitForFunction(() => globalThis.__webPerf.title > 0);
}

async function metrics(cdp: CDPSession) {
  const data = await cdp.send("Performance.getMetrics");
  return Object.fromEntries(data.metrics.map(m => [m.name, m.value]));
}

async function move(page: Page, place: PlaceId, watch = false) {
  await page.evaluate(({ place, watch }) => {
    const g = globalThis.__fly;
    g.play();
    g.settings.place = place;
    g.settings.wallpaperAfter = 0;
    g.settings.realWeather = false;
    g.quality?.reset();
    g.applySettings(false);
    g.moveTo(place);
    if (watch) g.watch();
  }, { place, watch });
  await waitFor(page, `place=${place},moving=,brain=running`);
  await waitForGameTime(page, 3);
}

async function frameSample(page: Page, cdp: CDPSession, seconds: number, play: boolean) {
  await page.evaluate(() => { globalThis.__webPerf.frames.length = 0; });
  const start = await metrics(cdp);
  // An interaction cadence in game time, unaffected by wall-clock stalls.
  for (let t = 0; t < seconds; t += 2) {
    if (play) await page.keyboard.press("Enter");
    await waitForGameTime(page, Math.min(2, seconds - t));
  }
  const end = await metrics(cdp);
  const frames = await page.evaluate(() => globalThis.__webPerf.frames.splice(0));
  const state = await readState(page);
  return { jsMs: distribution(frames.map(f => f.ms)), intervalMs: distribution(frames.slice(1).map(f => f.interval)), longFrames50ms: frames.filter(f => f.interval > 50).length,
    longJs50ms: frames.filter(f => f.ms > 50).length, taskMsPerFrame: (end.TaskDuration - start.TaskDuration) * 1000 / frames.length,
    qualities: [...new Set(frames.map(f => f.quality))], state };
}

async function main() {
  const { values } = parseArgs({ options: {
    out: { type: "string" }, dir: { type: "string" },
    phases: { type: "string", default: "loads,frames,memory,brain" },
    runs: { type: "string", default: "3" }, seconds: { type: "string", default: "10" },
    "memory-seconds": { type: "string", default: "600" },
    build: { type: "boolean", default: false },
  } });
  assert.ok(values.out, "--out is required (outside the repository)");
  const out = path.resolve(values.out);
  assert.ok(!out.startsWith(root + path.sep), "raw evidence belongs outside the repository");
  mkdirSync(out, { recursive: true });
  const dir = path.resolve(values.dir ?? path.join(out, "site"));
  const runs = Number(values.runs), seconds = Number(values.seconds), memorySeconds = Number(values["memory-seconds"]);
  assert.ok(Number.isInteger(runs) && runs >= 3, "at least 3 runs");
  assert.ok(seconds >= 2 && memorySeconds >= 0);
  const phases = values.phases.split(",");
  assert.ok(phases.every(p => ["loads", "frames", "memory", "brain"].includes(p)));
  if (values.build) await bundle(out, dir);
  const report: Record<string, unknown> = { revision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), dirty: execFileSync("git", ["diff", "--stat"], { encoding: "utf8" }), node: process.version, host: os.cpus()[0].model, options: values, notes: "Timings include instrumentation; frame submission is not GPU/display time. Phone CPU throttling affects page only. Memory includes worker Wasm separately; memory checkpoints n=1, real time." };
  const save = () => writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2));
  if (phases.includes("loads")) {
    const loads: unknown[] = [];
    report.loads = loads;
    for (let run = 0; run < runs; run++) for (const profile of ["desktop", "phone"]) await withHeavySlot(async () => {
      const site = await serveSite({ dir, base: "/fly/" });
      const browser = await chromium.launch({ executablePath: chromiumPath(), args: gpuFlags() });
      try {
        const context = await browser.newContext({ viewport: profile === "phone" ? { width: 390, height: 844 } : { width: 1280, height: 720 }, isMobile: profile === "phone", hasTouch: profile === "phone", deviceScaleFactor: 1 });
        const page = await context.newPage();
        await instrument(page);
        const cdp = await context.newCDPSession(page);
        await cdp.send("Network.enable");
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile === "phone" ? 4 : 1 });
        if (profile === "phone") await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 200_000, uploadThroughput: 93_750 });
        let bytes = 0;
        cdp.on("Network.loadingFinished", e => { bytes += e.encodedDataLength; });
        for (const cache of ["cold", "warm"]) {
          bytes = 0;
          const errors: string[] = [];
          const onError = (e: Error) => errors.push(e.message);
          page.on("pageerror", onError);
          await ready(page, site.url);
          const probe = await page.evaluate(() => ({ firstFrame: globalThis.__webPerf.firstFrame, title: globalThis.__webPerf.title }));
          const titleBytes = bytes;
          const state = await readState(page);
          assert.equal(state.from, cache === "cold" ? "network" : "cache");
          // Let installation and cache writes finish: warm means the offline shell and brain are complete.
          await page.evaluate(async () => { await navigator.serviceWorker.ready; });
          await page.waitForFunction(() => globalThis.__fly.canvas.dataset.kept === "true");
          loads.push({ run, profile, cache, ...probe, titleBytes, settledBytes: bytes, state, errors, loadAverage: os.loadavg() });
          assert.deepEqual(errors, []);
          page.off("pageerror", onError);
          save();
        }
      } finally { await browser.close(); await site.close(); }
    });
  }
  if (phases.includes("frames") || phases.includes("memory")) await withHeavySlot(async () => {
    const site = await serveSite({ dir, base: "/fly/" });
    const browser = await chromium.launch({ executablePath: chromiumPath(), args: gpuFlags() });
    try {
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", e => errors.push(e.message));
      await instrument(page);
      const cdp = await context.newCDPSession(page);
      await cdp.send("Performance.enable");
      const workers = new WorkerHeap(cdp);
      await workers.start();
      await ready(page, site.url);
      await page.keyboard.press("Enter");
      await waitFor(page, "screen=play");
      if (phases.includes("frames")) {
        const frames: unknown[] = [];
        report.frames = frames;
        for (let run = 0; run < runs; run++) for (const place of (run % 2 ? [...PLACES].reverse() : PLACES)) for (const mode of ["play", "watch"]) {
          await move(page, place.id, mode === "watch");
          if (mode === "play") await page.evaluate(() => { while (globalThis.__fly.hands.current.id !== "swoop") globalThis.__fly.hands.stepTool(1); });
          frames.push({ run, place: place.id, mode, ...await frameSample(page, cdp, seconds, mode === "play"), loadAverage: os.loadavg() });
          save();
        }
      }
      if (phases.includes("memory")) {
        const memory: unknown[] = [];
        report.memory = memory;
        const sample = async (label: string) => {
          await cdp.send("HeapProfiler.collectGarbage");
          const heap = await cdp.send("Runtime.getHeapUsage");
          memory.push({ label, elapsedMs: Date.now() - started, heap, ...await workers.sample(), state: await readState(page), dom: await cdp.send("Memory.getDOMCounters") });
          await page.evaluate(() => { globalThis.__webPerf.frames.length = 0; });
          save();
        };
        await move(page, "picnic", true);
        const started = Date.now();
        await sample("start");
        // Real elapsed time, sampled in short waits; never accelerate the simulation.
        while (Date.now() - started < memorySeconds * 1000) { await waitForGameTime(page, 10); await sample("watch"); }
        await sample("ten-minute-checkpoint");
        for (let i = 0; i < 10; i++) await move(page, PLACES[(i + 1) % PLACES.length].id, true);
        await sample("ten-place-changes");
      }
      assert.deepEqual(errors, []);
    } finally { await browser.close(); await site.close(); }
  });
  if (phases.includes("brain")) await withHeavySlot(async () => {
    // The same deterministic senses and CPU timer as cost.budget.ts, independent of browser load.
    const { CpuMeter } = await import("./cpuBudget.ts");
    const { readConnectomeFile } = await import("../packages/brain/src/node.ts");
    const { FlyBrain } = await import("../packages/brain/src/runtime.ts");
    const { RESTING_SENSES } = await import("../packages/brain/src/types.ts");
    const connectome = readConnectomeFile();
    const rows: { rest: number; full: number; rawRest: number; rawFull: number }[] = [];
    for (let i = 0; i < runs; i++) {
      const brain = new FlyBrain(connectome, { seed: 1 });
      const cost = (senses: typeof RESTING_SENSES) => {
        for (let t = 0; t < 1008; t += 16) brain.tick(16, senses);
        const meter = new CpuMeter();
        for (let t = 0; t < 2048; t += 16) { brain.tick(16, senses); if ((t / 16) % 16 === 15) meter.lap(); }
        return [meter.ms / 2048, meter.rawMs / 2048];
      };
      const [rest, rawRest] = cost(RESTING_SENSES);
      const [full, rawFull] = cost({ ...RESTING_SENSES, loomLeft: 1, loomRight: 1, touch: 1, bumpLeft: 1, bumpRight: 1, wind: 1, sweet: 1, grounded: false, maleTaste: 1, wingbeat: 1 });
      rows.push({ rest, full, rawRest, rawFull });
    }
    report.brain = { rest: distribution(rows.map(r => r.rest)), full: distribution(rows.map(r => r.full)), rows };
  });
  save();
  console.log(path.join(out, "report.json"));
}

if (import.meta.main) await main();
