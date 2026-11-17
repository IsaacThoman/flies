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
  return originalSpawn(command, args ?? [], options ?? {});
}) as typeof spawn;
syncBuiltinESMExports();

let browserChild: ReturnType<typeof spawn>;
const realLaunch = chromium.launchServer.bind(chromium);
chromium.launchServer = (async (options: Parameters<typeof chromium.launchServer>[0]) => {
  if (mode === "launch") { process.send?.({ failed: true }); throw new Error("injected launch failure"); }
  if (mode === "launch-interrupt") return realLaunch(options);
  browserChild = originalSpawn(process.execPath, [resource.pathname], { stdio: ["ignore", "ignore", "inherit", "ipc"] });
  const [owned] = await once(browserChild, "message");
  const acknowledged = once(process, "message");
  process.send?.(owned);
  await acknowledged;
  return {
    wsEndpoint: () => "fixture",
    once(event: string, listener: () => void) { browserChild.once(event === "close" ? "exit" : event, listener); },
    async kill() {
      if (browserChild.exitCode !== null || browserChild.signalCode !== null) return;
      const exit = once(browserChild, "exit");
      browserChild.kill("SIGKILL");
      await exit;
    },
  };
}) as unknown as typeof chromium.launchServer;

chromium.connect = (async () => {
  const page = {
    on(event: string, listener: (error: { message: string }) => void) { if (event === "pageerror") listener({ message: "useful page diagnostic" }); },
    async goto() { if (mode === "navigation") { process.send?.({ failed: true }); throw new Error("injected navigation failure"); } },
    async waitForFunction() {
      if (mode === "readiness" || mode === "stuck-close") { process.send?.({ failed: true }); throw new Error(`injected ${mode} failure`); }
      process.send?.({ ready: true });
      return new Promise(() => {});
    },
  };
  return {
    async newContext() { return { async newPage() { return page; } }; },
    async close() { return new Promise(() => {}); },
  };
}) as unknown as typeof chromium.connect;
