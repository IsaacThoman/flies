import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import net from "node:net";
import path from "node:path";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";

const root = path.join(import.meta.dirname, "../../..");
function alive(pid: number) { try { process.kill(pid, 0); return true; } catch { return false; } }
const listening = (port: number) => new Promise<boolean>((resolve) => {
  const socket = net.connect(port, "127.0.0.1");
  socket.on("connect", () => { socket.destroy(); resolve(true); });
  socket.on("error", () => resolve(false));
});

for (const mode of ["launch", "navigation", "readiness", "interrupt", "server-interrupt", "launch-interrupt", "stuck-close"]) {
  test(`${mode} leaves no owned processes or listeners within five seconds`, { timeout: 15_000 }, async (t) => {
    const dir = mkdtempSync(path.join(tmpdir(), "flies-play-"));
    const resourceFile = path.join(dir, "browser.json");
    const owned: { pid: number; port: number }[] = [];
    const child = fork(path.join(root, "scripts/play.ts"), [], {
      execArgv: ["--import", new URL("./fixtures/play-inject.ts", import.meta.url).href],
      env: { ...process.env, PLAY_FAILURE: mode, PLAY_RESOURCE_FILE: resourceFile, CHROMIUM_PATH: path.join(import.meta.dirname, "fixtures/play-fake-browser.ts") }, stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    let output = "";
    child.stdout!.on("data", (chunk) => { output += chunk; });
    child.stderr!.on("data", (chunk) => { output += chunk; });
    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) { const exit = once(child, "exit"); child.kill("SIGKILL"); await exit; }
      for (const resource of owned) if (alive(resource.pid)) process.kill(resource.pid, "SIGKILL");
      rmSync(dir, { recursive: true, force: true });
    });
    const exit = once(child, "exit");
    let trigger: () => void;
    const triggered = new Promise<void>((resolve) => { trigger = resolve; });
    child.on("message", (message: { pid?: number; port?: number; ready?: boolean; failed?: boolean }) => {
      if (message.pid && message.port) { owned.push({ pid: message.pid, port: message.port }); child.send("acknowledged"); }
      if (message.ready) { trigger(); child.kill("SIGINT"); }
      if (message.failed) trigger();
    });
    if (mode === "launch-interrupt") {
      while (!existsSync(resourceFile)) await setTimeout(20);
      owned.push(JSON.parse(readFileSync(resourceFile, "utf8")) as { pid: number; port: number });
      trigger!();
      child.kill("SIGINT");
    }
    await triggered;
    const deadline = Date.now() + 5_000;
    let timer: ReturnType<typeof globalThis.setTimeout>;
    const expired = new Promise<never>((_resolve, reject) => { timer = globalThis.setTimeout(() => reject(new Error(`cleanup exceeded five seconds: ${output}`)), 5_000); });
    const [code, signal] = await Promise.race([exit, expired]).finally(() => clearTimeout(timer));
    while (owned.some((resource) => alive(resource.pid)) && Date.now() < deadline) await setTimeout(20);
    assert.ok(owned.length > 0, output);
    for (const resource of owned) {
      assert.equal(alive(resource.pid), false, `process ${resource.pid} leaked: ${output}`);
      assert.equal(await listening(resource.port), false, `port ${resource.port} leaked`);
    }
    if (mode.endsWith("interrupt")) assert.ok(code === 130 || signal === "SIGINT", output);
    else {
      assert.equal(code, 1, output);
      assert.match(output, new RegExp(`injected ${mode} failure`));
      if (mode !== "launch") assert.match(output, /useful page diagnostic/);
    }
  });
}
