// Drives the web game in a GPU-rendered headless Chromium, step by step, for
// looking at it and for scripted checks. Starts its own Vite server unless
// --url is given.
//
//   node scripts/play.ts [--url http://localhost:5173/] [--size 1280x720] [--headed] <step>...
//
// Steps run in order:
//   wait:<cond>[,<cond>...]   until the canvas's data-* state matches: key=value, key~regex, key>n, key<n
//   key:<Key>[*n]             press a key (Enter, Escape, ArrowLeft, " ", ...), n times
//   hold:<Key>:<ms>           hold a key down
//   drag:<x0>,<y0>:<x1>,<y1>  drag the mouse (the touch surface) between points in -1..1 surface units
//   sleep:<ms>                wait
//   shot:<file.png>           screenshot the game as shown (16:9)
//   state                     print the data-* state
//   eval:<js>                 evaluate in the page and print the result
// Paths are relative to the current directory.

import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import type { Page } from "playwright";

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

/** Drags the mouse across the canvas, as a finger across the touch surface (x, y in -1..1, y up). */
export async function drag(page: Page, from: [number, number], to: [number, number], steps = 12) {
  const box = await page.locator("#game").boundingBox();
  if (!box) throw new Error("No canvas");
  const at = ([x, y]: [number, number]) => [box.x + ((x + 1) / 2) * box.width, box.y + ((1 - y) / 2) * box.height] as const;
  await page.mouse.move(...at(from));
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    await page.mouse.move(...at([from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k]));
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
}

export async function openGame({ url, width = 1280, height = 720, headed = false }: { url: string; width?: number; height?: number; headed?: boolean }) {
  const browser = await chromium.launch({ headless: !headed, executablePath: chromiumPath(), args: gpuFlags() });
  const page = await browser.newPage({ viewport: { width, height } });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(url);
  await page.waitForFunction(() => !!(document.getElementById("game") as HTMLCanvasElement | null)?.dataset.screen, null, { timeout: 30_000 });
  return { browser, page, errors };
}

async function main() {
  const args = process.argv.slice(2);
  let url = "";
  let size = "1280x720";
  let headed = false;
  const steps: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--url") url = args[++i];
    else if (args[i] === "--size") size = args[++i];
    else if (args[i] === "--headed") headed = true;
    else steps.push(args[i]);
  }
  let server: ChildProcess | null = null;
  if (!url) {
    const started = await startServer();
    url = started.url;
    server = started.server;
  }
  const [width, height] = size.split("x").map(Number);
  const { browser, page, errors } = await openGame({ url, width, height, headed });
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
      } else if (kind === "drag") {
        const [a, b] = arg.split(":").map((p) => p.split(",").map(Number) as [number, number]);
        await drag(page, a, b);
      } else if (kind === "sleep") await page.waitForTimeout(Number(arg));
      else if (kind === "shot") {
        await page.locator("#game").screenshot({ path: path.resolve(arg) });
        console.log("shot", path.resolve(arg));
      } else if (kind === "state") console.log(JSON.stringify(await readState(page), null, 1));
      else if (kind === "eval") console.log(JSON.stringify(await page.evaluate(arg)));
      else throw new Error(`Unknown step: ${step}`);
    }
  } finally {
    if (errors.length) console.log("page errors:\n" + errors.join("\n"));
    await browser.close();
    server?.kill();
  }
}

if (import.meta.main) await main();
