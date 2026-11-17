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
//   tapon:<kind>[:<index>]    a finger taps the middle of a target drawn on screen (from the game's hit map: tool, kind, label, go, menu, row, step, tab, back...)
//   clickon:<kind>[:<index>]  the mouse clicks one
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
import type { BrowserContextOptions, CDPSession, Page } from "playwright";

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

/** Starts Vite on a free port; resolves with its URL. */
export function startServer(): Promise<{ url: string; server: ChildProcess }> {
  return new Promise((resolve, reject) => {
    const server = spawn(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "--port", "0", "--strictPort", "false"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      // eslint-disable-next-line no-control-regex
      const match = output.replace(/\x1b\[[0-9;]*m/g, "").match(/Local:\s+(http:\/\/\S+)/);
      if (match) resolve({ url: match[1], server });
    };
    server.stdout.on("data", onData);
    server.stderr.on("data", onData);
    server.on("exit", (code) => reject(new Error(`vite exited (${code}): ${output}`)));
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
export const gameUp = (page: Page) => page.waitForFunction(() => !!(document.getElementById("game") as HTMLCanvasElement | null)?.dataset.screen, null, { timeout: 30_000 });

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

  private constructor(page: Page, cdp: CDPSession) {
    this.#page = page;
    this.#cdp = cdp;
  }

  static async on(page: Page) {
    return new Fingers(page, await page.context().newCDPSession(page));
  }

  async #send(type: "touchStart" | "touchMove" | "touchEnd", points: Pt[]) {
    const touchPoints = [];
    for (let i = 0; i < points.length; i++) {
      const p = await canvasPoint(this.#page, points[i]);
      touchPoints.push({ x: p.x, y: p.y, id: i, radiusX: 8, radiusY: 8, force: 1 });
    }
    await this.#cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : touchPoints });
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
      await this.#send("touchEnd", []);
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
export async function targetOf(page: Page, kind: string, index?: number): Promise<Pt> {
  // A screen just opened may not have been drawn yet: give it a moment.
  const until = Date.now() + 60_000;
  for (;;) {
    const found = await findTarget(page, kind, index);
    if (found) return found;
    if (Date.now() > until) throw new Error(`Nothing drawn on screen is a ${kind}${index === undefined ? "" : ` ${index}`}`);
    await page.waitForTimeout(100);
  }
}

function findTarget(page: Page, kind: string, index?: number): Promise<Pt | null> {
  return page.evaluate(
    ([kind, index]) => {
      const game = (globalThis as unknown as { __fly: { overlay: { hits: { count: number; get(i: number): { kind: string; index: number; value: number; x: number; y: number; w: number; h: number } } }; shape: { design: { width: number; height: number } } } }).__fly;
      const hits = game.overlay.hits;
      for (let i = hits.count - 1; i >= 0; i--) {
        const h = hits.get(i);
        if (h.kind === kind && (index === null || ((kind === "kind" || kind === "tab") ? h.value === index : h.index === index))) return [(h.x + h.w / 2) / game.shape.design.width, (h.y + h.h / 2) / game.shape.design.height];
      }
      return null;
    },
    [kind, index ?? null] as const,
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

export type OpenOptions = { url: string; width?: number; height?: number; headed?: boolean; device?: string; landscape?: boolean };

/** The browser context for a window of a size, or a device (a phone, a tablet) held either way. */
export function contextFor({ width = 1280, height = 720, device, landscape = false }: OpenOptions): BrowserContextOptions {
  if (!device) return { viewport: { width, height } };
  const d = devices[device];
  if (!d) throw new Error(`No such device: ${device}`);
  const v = d.viewport;
  const [w, h] = landscape ? [Math.max(v.width, v.height), Math.min(v.width, v.height)] : [v.width, v.height];
  return { ...d, viewport: { width: w, height: h }, screen: { width: w, height: h } };
}

export async function openGame(options: OpenOptions) {
  const { url, headed = false } = options;
  const browser = await chromium.launch({ headless: !headed, executablePath: chromiumPath(), args: gpuFlags() });
  const context = await browser.newContext(contextFor(options));
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(url);
  await gameUp(page);
  return { browser, page, errors };
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
  if (!url) {
    const started = await startServer();
    url = started.url;
    server = started.server;
  }
  const [width, height] = (size || "1280x720").split("x").map(Number);
  const { browser, page, errors } = await openGame({ url, width: size || !device ? width : undefined, height: size || !device ? height : undefined, headed, device, landscape });
  if (device && size) await page.setViewportSize({ width, height });
  const fingers = await Fingers.on(page);
  const pt = (spec: string) => spec.split(",").map(Number) as Pt;
  try {
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
      else if (kind === "tapon") await fingers.tap(await targetOf(page, rest[0], rest[1] === undefined ? undefined : Number(rest[1])));
      else if (kind === "clickon") {
        const p = await canvasPoint(page, await targetOf(page, rest[0], rest[1] === undefined ? undefined : Number(rest[1])));
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
    if (errors.length) console.log("page errors:\n" + errors.join("\n"));
    await browser.close();
    server?.kill();
  }
}

if (import.meta.main) await main();
