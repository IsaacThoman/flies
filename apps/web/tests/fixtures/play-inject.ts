import { spawn } from "node:child_process";
import childProcess from "node:child_process";
import { once } from "node:events";
import { syncBuiltinESMExports } from "node:module";
import { chromium } from "playwright";

const mode = process.env.PLAY_FAILURE;
const resource = new URL("./play-resource.ts", import.meta.url);
const originalSpawn = spawn;
childProcess.spawn = ((command, args, options) => {
  if (Array.isArray(args) && args.some((arg) => arg.endsWith("vite.js"))) {
    const child = originalSpawn(process.execPath, [resource.pathname, ...(mode === "server-interrupt" ? ["--silent"] : [])], { stdio: ["ignore", "pipe", "pipe", "ipc"] });
    child.on("message", (message) => { process.send?.(message); if (mode === "server-interrupt") process.send?.({ ready: true }); });
    process.on("message", () => { if (child.connected) child.send("announce"); });
    return child;
  }
  return originalSpawn(command, args, options);
}) as typeof spawn;
syncBuiltinESMExports();

chromium.launch = (async () => {
  if (mode === "launch") throw new Error("injected launch failure");
  const child = originalSpawn(process.execPath, [resource.pathname], { stdio: ["ignore", "ignore", "inherit", "ipc"] });
  const [owned] = await once(child, "message");
  const acknowledged = once(process, "message");
  process.send?.(owned);
  await acknowledged;
  const page = {
    on(event: string, listener: (error: { message: string }) => void) { if (event === "pageerror") listener({ message: "useful page diagnostic" }); },
    async goto() { if (mode === "navigation") throw new Error("injected navigation failure"); },
    async waitForFunction() {
      if (mode === "readiness") throw new Error("injected readiness failure");
      process.send?.({ ready: true });
      return new Promise(() => {});
    },
  };
  return {
    async newContext() { return { async newPage() { return page; } }; },
    async close() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exit = once(child, "exit");
      child.kill();
      await exit;
    },
  };
}) as typeof chromium.launch;
