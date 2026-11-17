import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
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

for (const mode of ["launch", "navigation", "readiness", "interrupt", "server-interrupt"]) {
  test(`${mode} leaves no owned processes or listeners within five seconds`, { timeout: 15_000 }, async (t) => {
    const owned: { pid: number; port: number }[] = [];
    const child = fork(path.join(root, "scripts/play.ts"), [], {
      execArgv: ["--import", new URL("./fixtures/play-inject.ts", import.meta.url).href],
      env: { ...process.env, PLAY_FAILURE: mode }, stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    let output = "";
    child.stdout!.on("data", (chunk) => { output += chunk; });
    child.stderr!.on("data", (chunk) => { output += chunk; });
    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) { const exit = once(child, "exit"); child.kill("SIGKILL"); await exit; }
      for (const resource of owned) if (alive(resource.pid)) process.kill(resource.pid, "SIGKILL");
    });
    const exit = once(child, "exit");
    child.on("message", (message: { pid?: number; port?: number; ready?: boolean }) => {
      if (message.pid && message.port) { owned.push({ pid: message.pid, port: message.port }); child.send("acknowledged"); }
      if (message.ready) child.kill("SIGINT");
    });
    const deadline = Date.now() + 5_000;
    const [code, signal] = await exit;
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
