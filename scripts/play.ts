// Drives the web game in a GPU-rendered headless Chromium, step by step, for
// looking at it and for scripted checks. Starts its own Vite server unless
// --url is given.
//
//   node scripts/play.ts [--url http://localhost:5173/] [--size 1280x720] [--device "iPhone 15"] [--landscape] [--headed] <step>...
//
// --device takes one of Playwright's device descriptors (a phone or a tablet,
// with its screen, touch and pixel ratio); --landscape turns it on its side.
// --size sets the window's size (with a device, its screen's).
//
// Steps run in order. Points on the screen (x,y) run from 0 to 1 across and
// down the canvas.
//   wait:<cond>[,<cond>...]   until the canvas's data-* state matches: key=value, key~regex, key>n, key<n
//   key:<Key>[*n]             press a key (Enter, Escape, ArrowLeft, " ", ...), n times
//   hold:<Key>:<ms>           hold a key down
//   swipe:<x0>,<y0>:<x1>,<y1> a finger across the remote's touch surface, in its -1..1 units (y up)
//   move:<x>,<y>              move the mouse there
//   click:<x>,<y>[:<ms>]      click the mouse there (held for ms)
//   mousedrag:<x0>,<y0>:<x1>,<y1>[:<button>]  drag the mouse (button: left, right, middle)
//   dblclick:<x>,<y>          double-click the mouse there
//   wheel:<x>,<y>:<dy>[:ctrl|:<dx>] the wheel there (ctrl: a trackpad's pinch; a number: scrolled across too)
//   tap:<x>,<y>[:<ms>]        a finger taps there (held for ms)
//   touchdrag:<x0>,<y0>:<x1>,<y1>[:<ms>]  a finger drags between points
//   twofingerdrag:<x0>,<y0>:<x1>,<y1> two fingers move together, without changing spread
//   pinch:<x>,<y>:<from>:<to> two fingers about a point, from one spread to another (shares of the width)
//   tapon:<kind>[:<index>[:<dial>]]  a finger taps the middle of a target drawn on screen (from the game's hit map: tool, kind, label, go, menu, row, step, tab, option, back...);
//                             a kind's index is its direction, and its dial which of the tool's (the Sky's weather is 1); an option's or a step's index is its row's, and its dial which option, or which way (-1, 1)
//   clickon:<kind>[:<index>[:<dial>]]  the mouse clicks one
//   resize:<w>x<h>            the window (or the device's screen) changes shape
//   sleep:<ms>                wait
//   shot:<file.png>           screenshot the game as shown
//   state                     print the data-* state
//   eval:<js>                 evaluate in the page and print the result
//   reload                    reload the page (what the game saved stays), and wait for the game
// Paths are relative to the current directory.

import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, devices } from "playwright";
import type { BrowserContext, BrowserContextOptions, CDPSession, Page } from "playwright";

const root = path.join(import.meta.dirname, "..");

/** Playwright's Chromium, or the newest one in its cache (another checkout may have installed a different version). */
export function chromiumPath(): string | undefined {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  if (existsSync(chromium.executablePath())) return undefined;
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(os.homedir(), process.platform === "darwin" ? "Library/Caches/ms-playwright" : ".cache/ms-playwright");
  const builds = existsSync(cache) ? readdirSync(cache) : [];
  const shells = builds.filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  for (const d of shells) {
    const binary = path.join(cache, d, `chrome-headless-shell-${process.platform === "darwin" ? `mac-${process.arch}` : "linux64"}`, "chrome-headless-shell");
    if (existsSync(binary)) return binary;
  }
  return undefined;
}

/**
 * The whole browser rather than the headless shell, for what the shell
 * leaves out (the Screen Wake Lock API): Playwright's, or the newest in its
 * cache; the shell if there is none.
 */
export function fullChromiumPath(): string | undefined {
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(os.homedir(), process.platform === "darwin" ? "Library/Caches/ms-playwright" : ".cache/ms-playwright");
  const builds = existsSync(cache) ? readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1])) : [];
  for (const d of builds) {
    const binary =
      process.platform === "darwin"
        ? path.join(cache, d, `chrome-mac-${process.arch}`, "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing")
        : path.join(cache, d, "chrome-linux64", "chrome");
    if (existsSync(binary)) return binary;
  }
  return chromiumPath();
}

/** Headless Chromium falls back to software WebGL unless told to use the GPU. */
export const gpuFlags = () => (process.platform === "darwin" ? ["--use-angle=metal"] : ["--ignore-gpu-blocklist", "--enable-gpu"]);

/** Waits for the owned server to exit; an unresponsive child cannot hold cleanup open. */
export async function stopServer(server: ChildProcess) {
  if (!server.pid || server.exitCode !== null || server.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    const killed = setTimeout(() => server.kill("SIGKILL"), 1_000);
    server.once("close", () => { clearTimeout(killed); resolve(); });
    server.kill();
  });
}

/** Starts Vite on a free port; ownership is handed over before waiting for readiness. */
export function startServer(own: (server: ChildProcess) => void = () => {}): Promise<{ url: string; server: ChildProcess }> {
  return new Promise((resolve, reject) => {
    const server = spawn(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "--port", "0", "--strictPort", "false"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    own(server);
    let output = "";
    let settled = false;
    const detach = () => {
      clearTimeout(timeout);
      server.stdout.off("data", onData);
      server.stderr.off("data", onData);
      server.off("close", onExit);
      server.off("error", onError);
      server.stdout.resume();
      server.stderr.resume();
    };
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      detach();
      void stopServer(server).then(() => reject(new Error(`${message}: ${output}`)));
    };
    const onData = (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-32_768);
      // eslint-disable-next-line no-control-regex
      const match = output.replace(/\x1b\[[0-9;]*m/g, "").match(/Local:\s+(http:\/\/\S+)/);
      if (match) {
        settled = true;
        detach();
        resolve({ url: match[1], server });
      }
    };
    const onExit = (code: number | null) => fail(`vite exited (${code})`);
    const onError = (error: Error) => fail(`vite failed (${error.message})`);
    const timeout = setTimeout(() => fail("Timed out starting vite"), 30_000);
    server.stdout.on("data", onData);
    server.stderr.on("data", onData);
    server.once("close", onExit);
    server.once("error", onError);
  });
}

type Condition = (state: Record<string, string>) => boolean;

export function parseConditions(spec: string): Condition[] {
  return spec.split(",").map((part) => {
    const m = part.match(/^([\w-]+)(=|~|>|<)(.*)$/);
    if (!m) throw new Error(`Bad condition: ${part}`);
    const [, key, op, value] = m;
    if (op === "=") return (s) => s[key] === value;
    if (op === "~") return (s) => new RegExp(value).test(s[key] ?? "");
    if (op === ">") return (s) => Number(s[key]) > Number(value);
    return (s) => Number(s[key]) < Number(value);
  });
}

export const readState = (page: Page) => page.evaluate(() => ({ ...(document.getElementById("game") as HTMLCanvasElement).dataset }) as Record<string, string>);

export async function waitFor(page: Page, spec: string, timeout = 60_000) {
  const conditions = parseConditions(spec);
  const started = Date.now();
  for (;;) {
    const state = await readState(page);
    if (conditions.every((c) => c(state))) return state;
    if (Date.now() - started > timeout) throw new Error(`Timed out waiting for ${spec}: ${JSON.stringify(state)}`);
    await page.waitForTimeout(100);
  }
}

/**
 * Waits for the canvas's state to match within `seconds` of the game's time, however long that
 * takes on the clock: for what the brain chooses to do in its own time (a fly landing).
 */
export async function waitWithin(page: Page, spec: string, seconds: number) {
  const conditions = parseConditions(spec);
  const time = () => page.evaluate(() => (globalThis as unknown as { __fly: { time: number } }).__fly.time);
  const until = (await time()) + seconds;
  for (;;) {
    const state = await readState(page);
    if (conditions.every((c) => c(state))) return state;
    if ((await time()) > until) throw new Error(`No ${spec} within ${seconds} s of game time: ${JSON.stringify(state)}`);
    await page.waitForTimeout(100);
  }
}

/**
 * A double click at a point on the page whose clicks happened 40 ms apart, however long a busy
 * page takes to be handed them: Playwright's own sends each event only once the page has taken the
 * last, so a slow frame between them would stretch them apart.
 */
export async function doubleClick(page: Page, x: number, y: number) {
  const cdp = await page.context().newCDPSession(page);
  const at = Date.now() / 1000;
  const events = [["mousePressed", 0, 1], ["mouseReleased", 0.04, 1], ["mousePressed", 0.08, 2], ["mouseReleased", 0.12, 2]] as const;
  for (const [type, after, clickCount] of events) {
    await cdp.send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mousePressed" ? 1 : 0, clickCount, timestamp: at + after });
  }
  await cdp.detach();
}

/** Waits for frames to advance the game's clock, even when long wall-clock frames are capped. */
export async function waitForGameTime(page: Page, seconds: number, timeout = 120_000) {
  const until = await page.evaluate((seconds) => (globalThis as unknown as { __fly: { time: number } }).__fly.time + seconds, seconds);
  await page.waitForFunction((until) => (globalThis as unknown as { __fly: { time: number } }).__fly.time >= until, until, { timeout });
}

type Pt = [number, number];

/** A finger across the remote's touch surface (x, y in -1..1, y up), as the Apple TV host sends it. */
export async function swipe(page: Page, from: Pt, to: Pt, steps = 12) {
  for (let i = 0; i <= steps + 1; i++) {
    const k = Math.min(1, i / steps);
    const touching = i <= steps;
    await page.evaluate(([x, y, t]) => window.dispatchEvent(new CustomEvent("remotetouch", { detail: { x, y, touching: t } })), [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k, touching] as const);
    await page.waitForTimeout(16);
  }
}

/** Until the game is drawing and has published its state. */
export const gameUp = (page: Page, timeout = 30_000) => page.waitForFunction(() => !!(document.getElementById("game") as HTMLCanvasElement | null)?.dataset.screen, null, { timeout });

/** A point on the canvas (0 to 1 across and down) in the page's CSS pixels. */
export async function canvasPoint(page: Page, [x, y]: Pt) {
  const box = await page.locator("#game").boundingBox();
  if (!box) throw new Error("No canvas");
  return { x: box.x + x * box.width, y: box.y + y * box.height, width: box.width, height: box.height };
}

/** Drags the mouse between points on the canvas. */
export async function mouseDrag(page: Page, from: Pt, to: Pt, button: "left" | "right" | "middle" = "left", steps = 12) {
  const a = await canvasPoint(page, from);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down({ button });
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    const p = await canvasPoint(page, [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k]);
    await page.mouse.move(p.x, p.y);
    await page.waitForTimeout(16);
  }
  await page.mouse.up({ button });
}

/** Fingers on the screen, through the DevTools protocol (Playwright's touchscreen only taps). */
export class Fingers {
  #cdp: CDPSession;
  #page: Page;
  #active = false;

  private constructor(page: Page, cdp: CDPSession) {
    this.#page = page;
    this.#cdp = cdp;
  }

  static async on(page: Page) {
    return new Fingers(page, await page.context().newCDPSession(page));
  }

  async #send(type: "touchStart" | "touchMove" | "touchEnd" | "touchCancel", points: Pt[]) {
    const touchPoints = [];
    for (let i = 0; i < points.length; i++) {
      const p = await canvasPoint(this.#page, points[i]);
      touchPoints.push({ x: p.x, y: p.y, id: i, radiusX: 8, radiusY: 8, force: 1 });
    }
    await this.#cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" || type === "touchCancel" ? [] : touchPoints });
    this.#active = type === "touchStart" || type === "touchMove";
  }

  /** The system took the contacts; no pending press should commit. */
  async cancel() {
    await this.#send("touchCancel", []);
  }

  async tap(at: Pt, ms = 60) {
    await this.hold(at, () => this.#page.waitForTimeout(ms));
  }

  /** Keeps a tool pressed until its effect is observed, and releases it on failure too. */
  async hold<T>(at: Pt, until: () => Promise<T>): Promise<T> {
    await this.#send("touchStart", [at]);
    try {
      return await until();
    } finally {
      if (this.#active) await this.#send("touchEnd", []);
    }
  }

  async drag(from: Pt, to: Pt, ms = 400, steps = 14) {
    await this.#send("touchStart", [from]);
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      await this.#page.waitForTimeout(ms / steps);
      await this.#send("touchMove", [[from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k]]);
    }
    await this.#send("touchEnd", []);
  }

  /** Two fingers moving together at a constant spread: orbit without pinching. */
  async pan(from: Pt, to: Pt, spread = 0.2, steps = 14) {
    const pair = (x: number, y: number): Pt[] => [[x - spread / 2, y], [x + spread / 2, y]];
    await this.#send("touchStart", pair(...from));
    for (let i = 1; i <= steps; i++) {
      await this.#page.waitForTimeout(24);
      const k = i / steps;
      await this.#send("touchMove", pair(from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k));
    }
    await this.#send("touchEnd", []);
  }

  /** Two fingers either side of a point, `from` apart (a share of the width) to `to` apart. */
  async pinch(at: Pt, from: number, to: number, steps = 14) {
    const pair = (d: number): Pt[] => [[at[0] - d / 2, at[1]], [at[0] + d / 2, at[1]]];
    await this.#send("touchStart", pair(from));
    for (let i = 1; i <= steps; i++) {
      await this.#page.waitForTimeout(24);
      await this.#send("touchMove", pair(from + (to - from) * (i / steps)));
    }
    await this.#send("touchEnd", []);
  }
}

/** The middle of a target drawn on screen (0 to 1 across and down the canvas), found in the game's hit map by its kind and index. */
/** `dial`: for a kind's arrow or a label, which of the tool's dials (the Sky's weather is 1); for a row's option, which one, and for its arrows, which way; any, the last drawn, without. */
export async function targetOf(page: Page, kind: string, index?: number, dial?: number): Promise<Pt> {
  // A screen just opened may not have been drawn yet: give it a moment.
  const until = Date.now() + 60_000;
  for (;;) {
    const found = await findTarget(page, kind, index, dial);
    if (found) return found;
    if (Date.now() > until) throw new Error(`Nothing drawn on screen is a ${kind}${index === undefined ? "" : ` ${index}`}`);
    await page.waitForTimeout(100);
  }
}

function findTarget(page: Page, kind: string, index?: number, dial?: number): Promise<Pt | null> {
  return page.evaluate(
    ([kind, index, dial]) => {
      const game = (globalThis as unknown as { __fly: { overlay: { hits: { count: number; get(i: number): { kind: string; index: number; value: number; x: number; y: number; w: number; h: number } } }; shape: { design: { width: number; height: number } } } }).__fly;
      const hits = game.overlay.hits;
      for (let i = hits.count - 1; i >= 0; i--) {
        const h = hits.get(i);
        if (dial !== null && (kind === "kind" || kind === "label") && h.index !== dial) continue;
        if (dial !== null && (kind === "option" || kind === "step") && h.value !== dial) continue;
        if (h.kind === kind && (index === null || ((kind === "kind" || kind === "tab") ? h.value === index : h.index === index))) return [(h.x + h.w / 2) / game.shape.design.width, (h.y + h.h / 2) / game.shape.design.height];
      }
      return null;
    },
    [kind, index ?? null, dial ?? null] as const,
  ) as Promise<Pt | null>;
}

/** Where something in the fly's world is on the screen (0 to 1 across and down the canvas): the fly's middle, or the hand. */
export async function screenOf(page: Page, what: "fly" | "hand"): Promise<Pt> {
  return (await page.evaluate((what) => {
    type V = { x: number; y: number; z: number; project(c: unknown): V };
    const game = (globalThis as unknown as { __fly: { director: { camera: { position: { constructor: new (x: number, y: number, z: number) => V } } }; life: { body: { position: V } }; hands: { pointer: V } } }).__fly;
    const camera = game.director.camera;
    const p = what === "fly" ? game.life.body.position : game.hands.pointer;
    const v = new camera.position.constructor(p.x, p.y + (what === "fly" ? 0.75 : 0), p.z).project(camera);
    return [(v.x + 1) / 2, (1 - v.y) / 2];
  }, what)) as Pt;
}

export type OpenOptions = { url: string; width?: number; height?: number; headed?: boolean; device?: string; landscape?: boolean; steady?: boolean };

/**
 * The local hour every page's clock reads when the run starts: just after sunrise, when a fly is up and about
 * (packages/body/src/rhythm.ts) and the day is light. One shift for the whole run, so that tabs at
 * one table agree; the clocks run on from there.
 */
const MORNING = 6;
const start = new Date();
const CLOCK_SHIFT = ((((MORNING - start.getHours() - start.getMinutes() / 60 - start.getSeconds() / 3600) % 24) + 36) % 24 - 12) * 3_600_000;

/**
 * In every page the context opens, reloads included, holds still what would otherwise change under
 * a test with the machine or the hour it runs at: the picture stays at one of the levels in
 * apps/web/src/quality.ts (0, the full one) instead of following how fast this machine draws,
 * which without a GPU would draw the fly in pixels too big for the X-ray; the screensaver never
 * comes by itself (Never, as the saved setting), however long a step takes; the fly is at home,
 * as every launch is, unless `visit` takes it to a series of rooms open to everyone from the
 * first launch (a visit chosen in the game is kept across reloads, as it would be); and the clock
 * reads morning, whatever the hour, so the fly is awake rather than
 * asleep on the real night's clock. The tests check what the game does; the steps about the
 * screensaver bring it themselves.
 */
export const holdSteady = (context: BrowserContext, quality = 0, { visit = null as number | null } = {}) =>
  context.addInitScript(([quality, shift, visit]) => {
    (globalThis as { __quality?: number }).__quality = quality;
    try {
      // apps/web/src/settings.ts's key; the rest of what was saved stays as it was.
      const saved = JSON.parse(localStorage.getItem("flies.settings") ?? "{}") as Record<string, unknown>;
      const first = !("visit" in saved) && visit !== null ? { visit } : {};
      localStorage.setItem("flies.settings", JSON.stringify({ ...saved, wallpaperAfter: 0, ...first }));
    } catch {
      // A page with no storage of its own (about:blank) has no game in it either.
    }
    const Real = Date;
    class Shifted extends Real {
      constructor(...args: unknown[]) {
        if (args.length === 0) super(Real.now() + shift);
        else super(...(args as [number]));
      }
      static now() {
        return Real.now() + shift;
      }
    }
    globalThis.Date = Shifted as DateConstructor;
  }, [quality, CLOCK_SHIFT, visit] as const);

/** The browser context for a window of a size, or a device (a phone, a tablet) held either way. */
export function contextFor({ width = 1280, height = 720, device, landscape = false }: OpenOptions): BrowserContextOptions {
  if (!device) return { viewport: { width, height } };
  const d = devices[device];
  if (!d) throw new Error(`No such device: ${device}`);
  const v = d.viewport;
  const [w, h] = landscape ? [Math.max(v.width, v.height), Math.min(v.width, v.height)] : [v.width, v.height];
  return { ...d, viewport: { width: w, height: h }, screen: { width: w, height: h } };
}

export async function openGame(options: OpenOptions, own: (stop: () => Promise<void>) => void = () => {}, errors: string[] = []) {
  const { url, headed = false } = options;
  // Playwright kills a pending launch's process group on process exit too. The CLI's
  // signal deadline below reaches that hook even before launchServer returns ownership.
  const launched = await chromium.launchServer({ headless: !headed, executablePath: chromiumPath(), args: gpuFlags(), handleSIGINT: false, handleSIGTERM: false });
  let stopping: Promise<void> | undefined;
  const stop = () => stopping ??= launched.kill();
  own(stop);
  try {
    const browser = await chromium.connect(launched.wsEndpoint());
    const close = browser.close.bind(browser);
    browser.close = async (...args) => {
      let timeout: ReturnType<typeof setTimeout>;
      const forced = new Promise<void>((resolve, reject) => { timeout = setTimeout(() => void stop().then(resolve, reject), 1_000); });
      try { await Promise.race([close(...args), forced]); }
      finally { clearTimeout(timeout!); await stop(); }
    };
    const context = await browser.newContext(contextFor(options));
    if (options.steady) await holdSteady(context);
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(url);
    await gameUp(page);
    return { browser, page, errors };
  } catch (error) {
    await stop().catch((cleanupError: unknown) => console.error("Stopping browser:", cleanupError));
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  let url = "";
  let size = "";
  let headed = false;
  let device: string | undefined;
  let landscape = false;
  const steps: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--url") url = args[++i];
    else if (args[i] === "--size") size = args[++i];
    else if (args[i] === "--device") device = args[++i];
    else if (args[i] === "--landscape") landscape = true;
    else if (args[i] === "--headed") headed = true;
    else steps.push(args[i]);
  }
  let server: ChildProcess | null = null;
  let stopBrowser: (() => Promise<void>) | undefined;
  const errors: string[] = [];
  let closing: Promise<void> | undefined;
  const cleanup = () => closing ??= (async () => {
    const stopped = server ? stopServer(server) : Promise.resolve();
    try { await stopBrowser?.(); } finally { await stopped; }
  })();
  const report = () => { if (errors.length) console.log("page errors:\n" + errors.join("\n")); };
  const quit = (code: number) => {
    const exit = () => { report(); process.exit(code); };
    const deadline = setTimeout(exit, 3_000);
    void cleanup().finally(() => { clearTimeout(deadline); exit(); });
  };
  const interrupted = () => quit(130);
  const terminated = () => quit(143);
  process.once("SIGINT", interrupted);
  process.once("SIGTERM", terminated);
  try {
    if (!url) {
      const started = await startServer((owned) => { server = owned; });
      url = started.url;
    }
    const [width, height] = (size || "1280x720").split("x").map(Number);
    const { page } = await openGame({ url, width: size || !device ? width : undefined, height: size || !device ? height : undefined, headed, device, landscape }, (owned) => { stopBrowser = owned; }, errors);
    if (device && size) await page.setViewportSize({ width, height });
    const fingers = await Fingers.on(page);
    const pt = (spec: string) => spec.split(",").map(Number) as Pt;
    for (const step of steps) {
      const [kind, ...rest] = step.split(":");
      const arg = rest.join(":");
      if (kind === "wait") console.log("ok", step, JSON.stringify(await waitFor(page, arg, 90_000)));
      else if (kind === "key") {
        const [key, times] = arg.split("*");
        for (let n = 0; n < Number(times ?? 1); n++) {
          await page.keyboard.press(key === "Space" ? " " : key);
          await page.waitForTimeout(120);
        }
      } else if (kind === "hold") {
        const [key, ms] = arg.split(":");
        await page.keyboard.down(key === "Space" ? " " : key);
        await page.waitForTimeout(Number(ms));
        await page.keyboard.up(key === "Space" ? " " : key);
      } else if (kind === "swipe") {
        const [a, b] = rest.map(pt);
        await swipe(page, a, b);
      } else if (kind === "move") {
        const p = await canvasPoint(page, pt(rest[0]));
        await page.mouse.move(p.x, p.y, { steps: 8 });
      } else if (kind === "click") {
        const p = await canvasPoint(page, pt(rest[0]));
        await page.mouse.move(p.x, p.y, { steps: 4 });
        await page.mouse.down();
        await page.waitForTimeout(Number(rest[1] ?? 40));
        await page.mouse.up();
      } else if (kind === "mousedrag") await mouseDrag(page, pt(rest[0]), pt(rest[1]), rest[2] === "right" || rest[2] === "middle" ? rest[2] : "left");
      else if (kind === "dblclick") {
        const p = await canvasPoint(page, pt(rest[0]));
        await page.mouse.dblclick(p.x, p.y);
      }
      else if (kind === "wheel") {
        const p = await canvasPoint(page, pt(rest[0]));
        await page.mouse.move(p.x, p.y);
        if (rest[2] === "ctrl") await page.keyboard.down("Control");
        await page.mouse.wheel(rest[2] && rest[2] !== "ctrl" ? Number(rest[2]) : 0, Number(rest[1]));
        if (rest[2] === "ctrl") await page.keyboard.up("Control");
      } else if (kind === "tap") await fingers.tap(pt(rest[0]), Number(rest[1] ?? 60));
      else if (kind === "tapon") await fingers.tap(await targetOf(page, rest[0], rest[1] === undefined ? undefined : Number(rest[1]), rest[2] === undefined ? undefined : Number(rest[2])));
      else if (kind === "clickon") {
        const p = await canvasPoint(page, await targetOf(page, rest[0], rest[1] === undefined ? undefined : Number(rest[1]), rest[2] === undefined ? undefined : Number(rest[2])));
        await page.mouse.click(p.x, p.y);
      }
      else if (kind === "touchdrag") await fingers.drag(pt(rest[0]), pt(rest[1]), Number(rest[2] ?? 400));
      else if (kind === "twofingerdrag") await fingers.pan(pt(rest[0]), pt(rest[1]));
      else if (kind === "pinch") await fingers.pinch(pt(rest[0]), Number(rest[1]), Number(rest[2]));
      else if (kind === "resize") {
        const [w, h] = arg.split("x").map(Number);
        await page.setViewportSize({ width: w, height: h });
      } else if (kind === "sleep") await page.waitForTimeout(Number(arg));
      else if (kind === "shot") {
        await page.locator("#game").screenshot({ path: path.resolve(arg) });
        console.log("shot", path.resolve(arg));
      } else if (kind === "state") console.log(JSON.stringify(await readState(page), null, 1));
      else if (kind === "eval") console.log(JSON.stringify(await page.evaluate(arg)));
      else if (kind === "reload") {
        await page.reload();
        await gameUp(page);
      }
      else throw new Error(`Unknown step: ${step}`);
    }
  } finally {
    try { await cleanup(); } finally {
      process.off("SIGINT", interrupted);
      process.off("SIGTERM", terminated);
      report();
    }
  }
}

if (import.meta.main) await main();
