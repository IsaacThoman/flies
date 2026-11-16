// Real-time browser soak. Raw samples belong outside the repository.
import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { appendFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { build } from "vite";
import { serveSite } from "./serve.ts";
import type { CDPSession, Page } from "playwright";
import type { Game } from "../apps/web/src/game.ts";
import { PLACES } from "../apps/web/src/places/catalog.ts";
import type { PlaceId } from "../apps/web/src/places/catalog.ts";
import { TIMES } from "../apps/web/src/scene/light.ts";
import { WEATHERS } from "../apps/web/src/scene/weather.ts";
import { TOOLS } from "../apps/web/src/tools/hands.ts";
import { chromiumPath, fullChromiumPath, gameUp, gpuFlags, readState, startServer, waitFor } from "./play.ts";

declare global { var __fly: Game; }

const PHASES = ["places", "climate", "tools", "menus", "eyes", "wallpaper"] as const;
type Phase = typeof PHASES[number];
type Sample = { seconds: number; phase: string; place: string; checkpoint: boolean; [metric: string]: number | string | boolean };
const STATE = ["screen", "weather", "time", "view", "eyes", "eyesInset", "variant", "quality", "fps", "pixels", "eyesDetail", "eyesRate", "frame", "audio", "hidden"];
const CLOCKS = ["gameSeconds", "audioSeconds", "eyesUpdates"];
const METRICS = ["geometries", "textures", "programs", "calls", "triangles", "heap", "backing", "workerHeap", "workerBacking", "nodes", "listeners", "audioNodes", "frameMs", "brainSpeed", "storage"];

/** Disjoint early/late quarters avoid calling a warmup spike a sustained slope. */
export function trend(rows: { seconds: number; value: number }[], tolerance: number) {
  if (rows.length < 4) return null;
  const n = Math.max(1, Math.floor(rows.length / 4));
  const mean = (a: typeof rows, key: "value" | "seconds") => a.reduce((s, r) => s + r[key], 0) / a.length;
  const early = rows.slice(0, n), late = rows.slice(-n);
  const first = mean(early, "value"), last = mean(late, "value");
  const delta = last - first;
  return { first, last, perHour: delta * 3600 / (mean(late, "seconds") - mean(early, "seconds")), verdict: Math.abs(delta) <= tolerance ? "flat" : delta > 0 ? "growing" : "falling" };
}

// Workers are separate V8 isolates: the page's Performance metrics omit the brain.
class WorkerHeap {
  #cdp: CDPSession;
  #sessions = new Set<string>();
  #pending = new Map<number, { resolve: (v: Record<string, number>) => void; reject: (e: Error) => void }>();
  #id = 0;
  constructor(cdp: CDPSession) {
    this.#cdp = cdp;
    cdp.on("Target.attachedToTarget", ({ sessionId, targetInfo }) => { if (targetInfo.type === "worker") this.#sessions.add(sessionId); });
    cdp.on("Target.detachedFromTarget", ({ sessionId }) => this.#sessions.delete(sessionId));
    cdp.on("Target.receivedMessageFromTarget", ({ message }) => {
      const m = JSON.parse(message);
      const pending = this.#pending.get(m.id);
      if (!pending) return;
      this.#pending.delete(m.id);
      if (m.error) pending.reject(new Error(m.error.message));
      else pending.resolve(m.result);
    });
  }
  async start() { await this.#cdp.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: false }); }
  async #send(sessionId: string, method: string) {
    const id = ++this.#id;
    return new Promise<Record<string, number>>((resolve, reject) => {
      const timeout = setTimeout(() => { this.#pending.delete(id); reject(new Error(`Worker CDP timed out: ${method}`)); }, 30_000);
      this.#pending.set(id, { resolve: (v) => { clearTimeout(timeout); resolve(v); }, reject: (e) => { clearTimeout(timeout); reject(e); } });
      void this.#cdp.send("Target.sendMessageToTarget", { sessionId, message: JSON.stringify({ id, method }) }).catch((e) => { clearTimeout(timeout); this.#pending.delete(id); reject(e); });
    });
  }
  async sample() {
    let heap = 0, backing = 0;
    for (const session of this.#sessions) {
      await this.#send(session, "HeapProfiler.collectGarbage");
      const m = await this.#send(session, "Runtime.getHeapUsage");
      heap += m.usedSize;
      backing += m.backingStorageSize ?? 0;
    }
    return { workerHeap: this.#sessions.size ? heap : NaN, workerBacking: this.#sessions.size ? backing : NaN };
  }
}

async function move(page: Page, place: PlaceId) {
  await page.evaluate((id) => globalThis.__fly.moveTo(id), place);
  await waitFor(page, `place=${place},moving=`, 60_000);
}

async function choose(page: Page, tool: string, variant: string) {
  await page.evaluate(({ tool, variant }) => {
    const hands = globalThis.__fly.hands;
    for (let i = 0; i < 12 && hands.current.id !== tool; i++) hands.stepTool(1);
    while (hands.stepVariant(-1)) { /* Start at the first choice, even after a previous phase. */ }
    while (hands.variant.id !== variant) if (!hands.stepVariant(1)) throw Error(`No ${variant} on ${tool}`);
  }, { tool, variant });
  await waitFor(page, `tool=${tool},variant=${variant}`);
}

async function canonical(page: Page) {
  await page.evaluate(() => {
    const g = globalThis.__fly;
    g.play();
    g.settings.wallpaperAfter = 0;
    g.settings.place = "turns";
    g.settings.eyes = "low";
    g.settings.eyesInset = "always";
    g.settings.pixels = "classic";
    g.applySettings();
  });
  await choose(page, "light", "noon");
  await choose(page, "weather", "clear");
  await choose(page, "view", "follow");
  await page.waitForTimeout(2500);
}

export async function run(args = process.argv.slice(2)) {
  const flag = (name: string, fallback: string) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
  const quick = args.includes("--quick");
  const minutes = Number(flag("--minutes", quick ? "0.25" : "30"));
  const wallpaperMinutes = Number(flag("--wallpaper-minutes", "60"));
  const wallpaperTime = flag("--wallpaper-time", "clock");
  const wallpaperWeather = flag("--wallpaper-weather", "now");
  const wallpaperPlaces = flag("--places", PLACES.map((p) => p.id).join(",")).split(",");
  assert.ok(["clock", ...TIMES].includes(wallpaperTime), "invalid --wallpaper-time");
  assert.ok(["now", ...WEATHERS].includes(wallpaperWeather), "invalid --wallpaper-weather");
  assert.ok(wallpaperPlaces.length && wallpaperPlaces.every((id) => PLACES.some((p) => p.id === id)), "invalid --places");
  const cycles = Number(flag("--cycles", quick ? "4" : "200"));
  const interval = Number(flag("--interval", quick ? "5" : "10")) * 1000;
  const phases = flag("--phases", quick ? "places" : PHASES.join(",")).split(",") as Phase[];
  assert.ok(phases.length && phases.every((p) => PHASES.includes(p)), `--phases: ${PHASES.join(",")}`);
  assert.ok([minutes, wallpaperMinutes, cycles, interval].every((n) => Number.isFinite(n) && n > 0), "durations, cycles and interval must be positive");
  const csv = path.resolve(flag("--csv", path.join(os.tmpdir(), `web-soak-${Date.now()}.csv`)));
  writeFileSync(csv, ["seconds", "phase", "place", "checkpoint", ...STATE, ...CLOCKS, ...METRICS].join(",") + "\n");
  let server: ChildProcess | undefined;
  let site: Awaited<ReturnType<typeof serveSite>> | undefined;
  let built: string | undefined;
  let url = flag("--url", "");
  if (!url && args.includes("--built")) {
    built = mkdtempSync(path.join(os.tmpdir(), "fly-soak-"));
    await build({ configFile: path.join(import.meta.dirname, "../vite.config.ts"), logLevel: "warn", build: { outDir: built, emptyOutDir: true } });
    site = await serveSite({ dir: built, base: "/fly/" });
    url = site.url;
  } else if (!url) ({ url, server } = await startServer());
  const browser = await chromium.launch({ executablePath: args.includes("--built") ? fullChromiumPath() : chromiumPath(), args: [...gpuFlags(), "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"] });
  console.log(`Chromium ${browser.version()}; ${os.cpus()[0]?.model ?? process.arch}; ${os.release()}`);
  const samples: Sample[] = [];
  const errors: string[] = [];
  const started = Date.now();
  console.log(`CSV ${csv}; real time, ${cycles} circuits; ${minutes} min/interaction phase, ${wallpaperMinutes} min/place wallpaper`);
  console.log("GPU bytes and native mixer memory unavailable in CDP; frameMs is CPU submission, not GPU/display time.");

  async function lane(name: string, work: (page: Page, sample: (checkpoint?: boolean, force?: boolean) => Promise<void>, phase: (p: string) => void) => Promise<void>) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`${name}: ${m.text()}`); });
    const cdp = await context.newCDPSession(page);
    const worker = new WorkerHeap(cdp);
    const audioNodes = new Set<string>();
    cdp.on("WebAudio.audioNodeCreated", ({ node }) => audioNodes.add(node.nodeId));
    cdp.on("WebAudio.audioNodeWillBeDestroyed", ({ nodeId }) => audioNodes.delete(nodeId));
    await cdp.send("Performance.enable");
    await cdp.send("HeapProfiler.enable");
    await cdp.send("WebAudio.enable");
    await worker.start();
    let current = "warmup";
    let lastLive: { gameSeconds: number; audioSeconds: number; eyesUpdates: number; at: number } | undefined;
    const sample = async (checkpoint = false) => {
      await cdp.send("HeapProfiler.collectGarbage");
      const wm = await worker.sample();
      const perf = await cdp.send("Performance.getMetrics");
      const metrics = Object.fromEntries(perf.metrics.map((m) => [m.name, m.value]));
      const heap = await cdp.send("Runtime.getHeapUsage");
      const dom = await cdp.send("Memory.getDOMCounters");
      const state = await readState(page);
      assert.equal(state.brain, "running", `${name}: brain stopped`);
      const live = await page.evaluate(() => ({
        storage: Object.entries(localStorage).reduce((n, [k, v]) => n + k.length + v.length, 0),
        gameSeconds: globalThis.__fly.time,
        audioSeconds: globalThis.__fly.audio.ctx?.currentTime ?? NaN,
        eyesUpdates: globalThis.__fly.eyes.updates,
      }));
      if (current === "wallpaper" && lastLive && Date.now() - lastLive.at >= 2000) {
        assert.ok(live.gameSeconds > lastLive.gameSeconds, `${name}: frames stopped`);
        if (state.eyes === "brain") assert.ok(live.eyesUpdates > lastLive.eyesUpdates, `${name}: eye readbacks stopped`);
        if (state.audio === "running") assert.ok(live.audioSeconds > lastLive.audioSeconds, `${name}: audio stopped`);
      }
      lastLive = { ...live, at: Date.now() };
      const row: Sample = { seconds: (Date.now() - started) / 1000, phase: `${name}:${current}`, place: state.place, checkpoint,
        ...Object.fromEntries(STATE.map((k) => [k, state[k]])),
        ...Object.fromEntries(["geometries", "textures", "programs", "calls", "triangles", "frameMs", "brainSpeed"].map((k) => [k, Number(state[k])])),
        heap: metrics.JSHeapUsedSize, backing: heap.backingStorageSize ?? NaN, ...wm, nodes: dom.nodes, listeners: dom.jsEventListeners, audioNodes: audioNodes.size, ...live };
      samples.push(row);
      appendFileSync(csv, [row.seconds, row.phase, row.place, row.checkpoint, ...STATE.map((k) => row[k]), ...CLOCKS.map((k) => Number.isFinite(row[k]) ? row[k] : ""), ...METRICS.map((m) => Number.isFinite(row[m]) ? row[m] : "")].join(",") + "\n");
    };
    let inSample: Promise<void> = Promise.resolve();
    let sampling = false;
    let sampleError: unknown;
    let timer: ReturnType<typeof setInterval> | undefined;
    const enqueue = (checkpoint: boolean) => {
      const next = inSample.then(() => sample(checkpoint));
      inSample = next.catch((e) => { sampleError = e; });
      return next;
    };
    const due = async (checkpoint = false, force = false) => {
      if (sampleError) throw sampleError;
      if (checkpoint || force) await enqueue(checkpoint);
    };
    try {
      await page.goto(url);
      await gameUp(page);
      await waitFor(page, "brain=running,screen=title", 120_000);
      await page.keyboard.press("Enter");
      await waitFor(page, "screen=play");
      await canonical(page);
      console.log(`${name}: GPU ${await page.evaluate(() => {
        const gl = globalThis.__fly.stage.renderer.getContext();
        const debug = gl.getExtension("WEBGL_debug_renderer_info");
        return debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : "unavailable";
      })}`);
      // Upload the persistent, initially hidden tool/eye/blit resources before taking baselines.
      for (const tool of TOOLS) for (const variant of tool.variants) {
        if (tool.id === "place") continue;
        await choose(page, tool.id, variant.id);
        if (["feed", "swoop", "feather", "blow"].includes(tool.id)) await page.keyboard.press("Enter", { delay: 200 });
      }
      for (const pixels of ["chunky", "chunkier", "classic"] as const) {
        await page.evaluate((pixels) => { const g = globalThis.__fly; g.settings.pixels = pixels; g.applySettings(); }, pixels);
        await page.waitForTimeout(250);
      }
      await canonical(page);
      // Touch every place before measuring: audio buffers and shader variants are lazy.
      for (const place of PLACES) { await move(page, place.id); await page.waitForTimeout(500); }
      timer = setInterval(() => {
        // Skip an overrun rather than queue GCs that could themselves slow the game indefinitely.
        if (sampling || sampleError) return;
        sampling = true;
        void enqueue(false).catch((e) => { sampleError = e; }).finally(() => { sampling = false; });
      }, interval);
      await work(page, due, (p) => { current = p; console.log(`${name}: ${p}`); });
      if (sampleError) throw sampleError;
    } finally {
      clearInterval(timer);
      await inSample;
      await context.close();
    }
  }

  async function interaction(page: Page, sample: (checkpoint?: boolean, force?: boolean) => Promise<void>, phase: (p: string) => void) {
    for (const p of phases.filter((p) => p !== "wallpaper")) {
      phase(p);
      if (p === "places") {
        await canonical(page);
        for (let cycle = 0; cycle < cycles; cycle++) for (const place of PLACES) {
          await move(page, place.id);
          await page.waitForTimeout(2500);
          await sample(true);
        }
        continue;
      }
      const until = Date.now() + minutes * 60_000;
      let checkpointAt = Date.now() + 60_000;
      const checkpoints = async () => {
        await canonical(page);
        for (const place of PLACES) { await move(page, place.id); await page.waitForTimeout(2500); await sample(true); }
      };
      do {
        if (p === "climate") {
          for (const place of PLACES) {
            await move(page, place.id);
            for (const weather of WEATHERS) {
              await choose(page, "weather", weather);
              await waitFor(page, `weather=${weather}`);
              for (const time of [...TIMES, "clock"]) {
                await choose(page, "light", time);
                // Let the eased sky/rain and its PMREM rebuilds run, without advancing the clock.
                for (let i = 0; i < 12; i++) { await page.waitForTimeout(1000); await sample(); }
                await sample(false, true);
              }
              // A fresh copy after each weather gives comparable early/late climate samples.
              await canonical(page);
              await move(page, PLACES.find((p) => p.id !== place.id)!.id);
              await move(page, place.id);
              await page.waitForTimeout(2500);
              await sample(true);
            }
          }
        } else if (p === "tools") {
          for (const tool of TOOLS) for (const variant of tool.variants) {
            await choose(page, tool.id, variant.id);
            await page.keyboard.press("Enter", { delay: tool.hold ? 400 : 40 });
            if (tool.id === "place") await waitFor(page, `place=${variant.id},moving=`);
            await page.waitForTimeout(100);
            await sample();
          }
        } else if (p === "menus") {
          await page.keyboard.press(" ");
          await waitFor(page, "screen=pause");
          for (const screen of ["brain", "about", "settings", "wallpaper", "sound", "picture"] as const) {
            await page.evaluate((screen) => globalThis.__fly.open(screen), screen);
            await waitFor(page, `screen=${screen}`);
            await page.keyboard.press("ArrowDown");
            if (["wallpaper", "sound", "picture"].includes(screen)) {
              await page.keyboard.press("ArrowRight");
              await page.keyboard.press("ArrowLeft");
            }
            await sample();
            await page.keyboard.press("Escape");
            await waitFor(page, "screen=pause");
          }
          await page.keyboard.press(" ");
          await waitFor(page, "screen=play");
          await page.evaluate(() => { globalThis.__fly.title(); });
          await waitFor(page, "screen=title");
          await page.evaluate(() => globalThis.__fly.play());
        } else if (p === "eyes") {
          for (const eyes of ["off", "high", "low"] as const) for (const inset of ["off", "always", "wallpaper"] as const) {
            await page.evaluate(({ eyes, inset }) => {
              const g = globalThis.__fly;
              g.settings.eyes = eyes; g.settings.eyesInset = inset; g.applySettings();
            }, { eyes, inset });
            for (const view of ["eyes", "follow"]) {
              await choose(page, "view", view);
              await page.waitForTimeout(500);
              await sample();
            }
          }
        }
        await sample();
        if (Date.now() >= checkpointAt) {
          // Repeat matched states during stress phases, not just once when they finish.
          await checkpoints();
          checkpointAt = Date.now() + 60_000;
        }
      } while (Date.now() < until);
      await checkpoints();
    }
  }
  try {
    const jobs: Promise<void>[] = [];
    if (phases.some((p) => p !== "wallpaper")) jobs.push(lane("interaction", interaction));
    if (phases.includes("wallpaper")) for (const place of PLACES.filter((p) => wallpaperPlaces.includes(p.id))) jobs.push(lane(place.id, async (page, sample, phase) => {
      await move(page, place.id);
      await page.evaluate((id) => { const g = globalThis.__fly; g.settings.place = id; g.settings.eyesInset = "wallpaper"; g.applySettings(); g.watch(); }, place.id);
      await choose(page, "light", wallpaperTime);
      await choose(page, "weather", wallpaperWeather);
      phase("wallpaper");
      const until = Date.now() + wallpaperMinutes * 60_000;
      while (Date.now() < until) { await sample(); await page.waitForTimeout(Math.min(1000, until - Date.now())); }
      await sample(true);
    }));
    await Promise.all(jobs);
    assert.deepEqual(errors, [], "browser errors");
    if (quick) {
      for (const place of PLACES) for (const metric of ["geometries", "textures", "programs"]) {
        const rows = samples.filter((s) => s.checkpoint && s.phase === "interaction:places" && s.place === place.id);
        const baseline = Number(rows[0]?.[metric]);
        assert.ok(rows.length >= 3, `${place.id}: need three matched checkpoints`);
        for (const row of rows) assert.ok(Number(row[metric]) <= baseline + (metric === "programs" ? 2 : metric === "geometries" ? 1 : 0), `${place.id}: ${metric} ${baseline} → ${row[metric]}`);
      }
    }
  } finally {
    await browser.close(); server?.kill();
    await site?.close();
    if (built) rmSync(built, { recursive: true, force: true });
    const groups = new Map<string, Sample[]>();
    for (const s of samples) {
      // Climate/tool/menu counts are intentionally variable. Only matched checkpoints or steady wallpaper have meaningful slopes.
      if (!s.checkpoint && !s.phase.endsWith(":wallpaper")) continue;
      const key = `${s.phase}/${s.place}`;
      const rows = groups.get(key) ?? []; rows.push(s); groups.set(key, rows);
    }
    for (const [key, rows] of groups) for (const metric of METRICS) {
      const values = rows.map((r) => ({ seconds: r.seconds, value: Number(r[metric]) })).filter((r) => Number.isFinite(r.value));
      const first = values[0]?.value ?? 0;
      const tolerance = metric.includes("Heap") || metric === "heap" || metric.toLowerCase().includes("backing") ? Math.max(256 * 1024, first * 0.02) : ["frameMs", "brainSpeed", "calls", "triangles"].includes(metric) ? Math.max(0.1, first * 0.1) : metric === "storage" ? 16 : 0;
      const t = trend(values, tolerance);
      console.log(`${key} ${metric}: ${t ? `${t.verdict} ${t.first.toFixed(2)} → ${t.last.toFixed(2)} (${t.perHour.toFixed(2)}/hour)` : "insufficient samples"}`);
    }
    console.log(`${samples.length} samples, ${((Date.now() - started) / 60_000).toFixed(1)} wall minutes; ${csv}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await run();
