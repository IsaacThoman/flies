// Sets several flies down at one table and watches them (a spike, see
// docs/online.md): starts the room server and the game, opens headless tabs
// that each run their own fly's brain and join the table, lets them live,
// uses the tools at set moments, records every tab's state four times a
// second, screenshots every tab at the same moments (and, with --pin, from
// one camera shared by all, so the views can be laid side by side), and
// sums up what it saw.
//
//   node scripts/room.ts [--clients 2] [--seconds 90] [--plan meet|quiet|cost] [--bots 0]
//                        [--rtt 0] [--jitter 0] [--loss 0] [--stall 0] [--lead 200] [--eyes-model]
//                        [--pin] [--size 960x540] [--out dir] [--url http://localhost:5173/]
//
//   --plan meet   (the default) one drops sugar at its fly's mouth, another throws the ball at it,
//                 blows on it and tickles it; the weather turns to rain and back; a butterfly and a
//                 ladybird come; screenshots every 10 s and after each.
//   --plan quiet  nobody touches anything: the flies alone together.
//   --plan feast  two flies set down face to face with honey between their mouths, more when it's gone.
//   --plan cost   one real tab, and --bots fake flies walking round its fly, for the cost of each.
//   --bots N      that many fake flies from Node (no brain, no browser), walking circles near tab 0's fly.
//   --net a,b,c   change the network's round trip (ms) to each in turn, an equal share of the run each.
//   --face        set tabs 0 and 1 down face to face, a few millimetres apart (the feast does).
//   --hide i@a-b  hide tab i from a to b seconds into the run, as a tab in the background is: no animation
//                 frames (so its fly stops living), timers and the socket still going.
//   --throttle i:k  slow tab i's processor k times (its frames, and its brain, fall behind).
//   --late i@a    tab i joins only a seconds into the run.
//   --liar        a fake player from Node that teleports its fly and claims bites it couldn't take.
//
// Everything it writes goes to --out (a temporary folder by default): never commit it.

import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ChildProcess } from "node:child_process";
import { chromium } from "playwright";
import type { Page } from "playwright";
import { FLY_MAX, PROTOCOL, createFlyState, encodeFly } from "@fly/net";
import { createPicnic } from "@fly/world";
import { startRoom } from "../apps/room/src/server.ts";
import type { Network } from "../apps/room/src/server.ts";
import { chromiumPath, gpuFlags, readState, startServer, waitFor } from "./play.ts";

type Args = Record<string, string>;
function parse(): Args {
  const out: Args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = "1";
    else out[key] = argv[++i];
  }
  return out;
}

const args = parse();
const CLIENTS = Number(args.clients ?? (args.plan === "cost" ? 1 : 2));
const SECONDS = Number(args.seconds ?? 90);
const PLAN = args.plan ?? "meet";
const BOTS = Number(args.bots ?? 0);
const [W, H] = (args.size ?? "960x540").split("x").map(Number);
const OUT = path.resolve(args.out ?? path.join(os.tmpdir(), `fly-room-${new Date().toISOString().replace(/[:.]/g, "-")}`));
const PORT = 8790 + Math.floor(Math.random() * 200);
const net: Network = { rtt: Number(args.rtt ?? 0), jitter: Number(args.jitter ?? 0), loss: Number(args.loss ?? 0), stall: Number(args.stall ?? 0) };
const sweep = args.net ? args.net.split(",").map(Number) : null;
mkdirSync(OUT, { recursive: true });

const log = (...m: unknown[]) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...m);
const t0 = Date.now();

const room = startRoom({ port: PORT, net, seed: Number(args.seed ?? 20261116), immediate: !!args.immediate, light: "noon", weather: "clear" });
let vite: ChildProcess | null = null;
let url = args.url ?? "";
if (!url) {
  const started = await startServer();
  url = started.url;
  vite = started.server;
}
const browser = await chromium.launch({ headless: true, executablePath: chromiumPath(), args: gpuFlags() });

type Tab = { i: number; page: Page; errors: string[] };
const tabs: Tab[] = [];
const samples: { t: number; i: number; s: Record<string, string> }[] = [];
const shots: { name: string; files: string[] }[] = [];
const bots: WebSocket[] = [];
const picnic = createPicnic();

/** Two flies face to face round (-8, -8): far enough apart that their bodies don't touch, near enough that honey between them reaches both mouths. */
const FACE = [[-5.15, -8, -Math.PI / 2], [-10.85, -8, Math.PI / 2]];
const face = !!args.face || PLAN === "feast";
const late = args.late ? { i: Number(args.late.split("@")[0]), at: Number(args.late.split("@")[1]) } : null;

async function open(i: number): Promise<Tab> {
  const context = await browser.newContext({ viewport: { width: W, height: H } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  const q = new URLSearchParams({ room: `ws://localhost:${PORT}` });
  if (args.lead) q.set("lead", args.lead);
  if (args["eyes-model"]) q.set("eyesSee", "model");
  if (face && FACE[i]) q.set("spawn", FACE[i].join(","));
  await page.goto(`${url}?${q}`);
  return { i, page, errors };
}

/** Steps along the shelf to a tool, as the remote would, a step at a time as the game shows each (its state is published every 200 ms). */
async function tool(tab: Tab, id: string) {
  for (let n = 0; n < 12; n++) {
    const at = (await readState(tab.page)).tool;
    if (at === id) return;
    await tab.page.keyboard.press("ArrowRight");
    await waitFor(tab.page, `tool~^(?!${at}$)`, 2000);
  }
}

/** Puts a tab's hand on the table at a point (where a finger on the touch surface would take it). */
const point = (tab: Tab, x: number, z: number) =>
  tab.page.evaluate(([x, z]) => {
    const g = (globalThis as unknown as { __fly: { hands: { movePointer(p: unknown, n: unknown): void }; life: { world: { heightAt(x: number, z: number): number } } } }).__fly;
    g.hands.movePointer({ x, y: g.life.world.heightAt(x, z), z }, { x: 0, y: 1, z: 0 });
  }, [x, z]);

/** Hand back to following its own fly. */
const release = (tab: Tab) => tab.page.evaluate(() => (globalThis as unknown as { __fly: { hands: { release(): void } } }).__fly.hands.release());

/** Where a tab sees another player's fly (or its own, with id 0). */
async function flyAt(tab: Tab, id: number) {
  const s = await readState(tab.page);
  if (id === 0) {
    const [x, y, z, yaw] = s.me.split(",").map(Number);
    return { x, y, z, yaw };
  }
  for (const o of s.others.split(";")) {
    const [oid, , , p] = o.split(":");
    if (Number(oid) === id) {
      const [x, y, z, yaw] = p.split(",").map(Number);
      return { x, y, z, yaw };
    }
  }
  return null;
}

async function shoot(name: string, pin: boolean | "close") {
  const files = tabs.map((t) => path.join(OUT, `${name}-c${t.i}${pin ? "-pinned" : ""}.png`));
  if (pin) {
    // One camera for all: above and beside the middle of the flies, as tab 0 sees them.
    const me = await flyAt(tabs[0], 0);
    if (!me) return;
    const ids = (await readState(tabs[0].page)).others.split(";").filter(Boolean).map((o) => Number(o.split(":")[0]));
    let cx = me.x;
    let cz = me.z;
    let n = 1;
    for (const id of ids) {
      const o = await flyAt(tabs[0], id);
      if (o && Math.hypot(o.x - me.x, o.z - me.z) < 40) {
        cx += o.x;
        cz += o.z;
        n++;
      }
    }
    cx /= n;
    cz /= n;
    const k = pin === "close" ? 0.3 : 1;
    const pinAt = { x: cx + 22 * k, y: 26 * k, z: cz + 30 * k, tx: cx, ty: 0.8, tz: cz };
    await Promise.all(tabs.map((t) => t.page.evaluate((p) => ((globalThis as unknown as { __flyPin: unknown }).__flyPin = p), pinAt)));
    await tabs[0].page.waitForTimeout(150);
  }
  await Promise.all(tabs.map((t, k) => t.page.locator("#game").screenshot({ path: files[k] })));
  if (pin) await Promise.all(tabs.map((t) => t.page.evaluate(() => ((globalThis as unknown as { __flyPin: unknown }).__flyPin = null))));
  shots.push({ name: `${name}${pin ? " (one camera)" : ""}`, files });
}

/** Each tab's camera close on its own fly, from behind and above, to see the dab on its back. */
async function closeOwn(name: string) {
  const files = tabs.map((t) => path.join(OUT, `${name}-c${t.i}-own.png`));
  await Promise.all(tabs.map(async (t) => {
    const me = await flyAt(t, 0);
    if (!me) return;
    const pinAt = { x: me.x - Math.sin(me.yaw) * 7, y: me.y + 6, z: me.z - Math.cos(me.yaw) * 7, tx: me.x, ty: me.y + 0.7, tz: me.z };
    await t.page.evaluate((p) => ((globalThis as unknown as { __flyPin: unknown }).__flyPin = p), pinAt);
  }));
  await tabs[0].page.waitForTimeout(150);
  await Promise.all(tabs.map((t, k) => t.page.locator("#game").screenshot({ path: files[k] })));
  await Promise.all(tabs.map((t) => t.page.evaluate(() => ((globalThis as unknown as { __flyPin: unknown }).__flyPin = null))));
  shots.push({ name: `${name} (each its own, close)`, files });
}

/** A fake fly from Node: no brain, no browser, walking slow circles round a point it is told. */
function bot(k: number, centre: { x: number; z: number }) {
  const ws = new WebSocket(`ws://localhost:${PORT}`);
  ws.binaryType = "arraybuffer";
  const s = createFlyState();
  const view = new DataView(new ArrayBuffer(FLY_MAX));
  let offset = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  ws.onopen = () => ws.send(JSON.stringify({ type: "hello", v: PROTOCOL }));
  ws.onmessage = (e) => {
    if (typeof e.data !== "string") return;
    const m = JSON.parse(e.data);
    if (m.type !== "welcome") return;
    offset = m.now - performance.now();
    const r = 5 + (k % 6) * 2.2;
    const a0 = k * 2.1;
    let seq = 0;
    timer = setInterval(() => {
      const t = performance.now() + offset;
      const a = a0 + (t / 1000) * (2.5 / r);
      s.seq = ++seq & 0xffff;
      s.t = t;
      s.x = centre.x + Math.cos(a) * r;
      s.z = centre.z + Math.sin(a) * r;
      s.y = picnic.heightAt(s.x, s.z);
      s.yaw = Math.atan2(-Math.sin(a), Math.cos(a));
      s.vx = -Math.sin(a) * 2.5;
      s.vz = Math.cos(a) * 2.5;
      s.pose.speed = 1;
      s.pose.turn = 2.5 / r;
      const n = encodeFly(view, s);
      ws.send(new Uint8Array(view.buffer, 0, n));
    }, 50);
  };
  ws.onclose = () => timer && clearInterval(timer);
  bots.push(ws);
}

/** A player whose device lies: its fly jumps about the table and it claims bites of food it isn't at, faster than a fly eats. */
function liar() {
  const ws = new WebSocket(`ws://localhost:${PORT}`);
  ws.binaryType = "arraybuffer";
  const s = createFlyState();
  const view = new DataView(new ArrayBuffer(64));
  ws.onopen = () => ws.send(JSON.stringify({ type: "hello", v: PROTOCOL }));
  ws.onmessage = (e) => {
    if (typeof e.data !== "string") return;
    const m = JSON.parse(e.data);
    if (m.type !== "welcome") return;
    const offset = m.now - performance.now();
    const honey = m.foods.find((f: unknown[]) => f[2] === "honey");
    let n = 0;
    const timer = setInterval(() => {
      if (ws.readyState !== ws.OPEN) return clearInterval(timer);
      n++;
      s.seq = n & 0xffff;
      s.t = performance.now() + offset;
      // Every second it says it is somewhere else on the table.
      s.x = n % 20 < 10 ? 100 : -100;
      s.z = 0;
      s.y = 0;
      const k = encodeFly(view, s);
      ws.send(new Uint8Array(view.buffer, 0, k));
      // And it claims a big bite of the honey, which is nowhere near it.
      if (honey && n % 2 === 0) {
        const b = new DataView(new ArrayBuffer(12));
        b.setUint8(0, 3);
        b.setUint16(1, n & 0xffff, true);
        b.setUint8(3, 1);
        b.setUint32(4, honey[0], true);
        b.setFloat32(8, 0.2, true);
        ws.send(new Uint8Array(b.buffer));
      }
    }, 50);
  };
  bots.push(ws);
}

async function sample() {
  const t = (Date.now() - t0) / 1000;
  await Promise.all(tabs.map(async (tab) => samples.push({ t, i: tab.i, s: await readState(tab.page) })));
}

let finished = false;
try {
  log(`room ws://localhost:${PORT}, game ${url}, ${CLIENTS} tabs, ${BOTS} bots, plan ${PLAN}, out ${OUT}`);
  const join = async (tab: Tab) => {
    await waitFor(tab.page, "brain=running,screen=title", 240_000);
    await tab.page.keyboard.press("Enter");
    await waitFor(tab.page, "online=joined,screen=play", 30_000);
  };
  for (let i = 0; i < CLIENTS; i++) if (late?.i !== i) tabs.push(await open(i));
  for (const tab of tabs) await join(tab);
  log("joined");
  if (args.throttle) {
    const [i, k] = args.throttle.split(":").map(Number);
    const cdp = await tabs[i].page.context().newCDPSession(tabs[i].page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: k });
    log(`tab ${i} slowed ${k} times`);
  }
  if (args.liar) liar();
  const centre = { x: -8, z: -8 };
  for (let k = 0; k < BOTS; k++) bot(k, centre);
  const sampler = setInterval(() => void sample().catch(() => {}), 250);
  // When two flies come close, a sequence of shots from one camera: the meeting, as each tab saw it.
  let meetShots = 0;
  let meetAt = 0;
  let shooting = false;
  const meeter = setInterval(async () => {
    if (shooting || meetShots >= 16 || tabs.length < 2 || Date.now() - meetAt < 1500) return;
    const c = Number((await readState(tabs[0].page).catch(() => ({ closest: "" }))).closest);
    if (!(c < 4)) return;
    shooting = true;
    meetAt = Date.now();
    await shoot(`meet${String(++meetShots).padStart(2, "0")}-${((Date.now() - t0) / 1000).toFixed(1)}s`, "close").catch(() => {});
    shooting = false;
  }, 300);
  const statsLog: unknown[] = [];
  const statser = setInterval(() => statsLog.push({ t: (Date.now() - t0) / 1000, ...room.room.stats() }), 5000);
  const startedAt = Date.now();
  const at = (s: number) => new Promise((r) => setTimeout(r, Math.max(0, startedAt + s * 1000 - Date.now())));
  const events: { t: number; what: string }[] = [];
  const mark = (what: string) => {
    events.push({ t: (Date.now() - t0) / 1000, what });
    log(what);
  };
  const timeline: [number, () => Promise<void>][] = [];
  for (let s = 0; s <= SECONDS; s += 10) timeline.push([s, () => shoot(`t${String(s).padStart(3, "0")}`, !!args.pin)]);
  timeline.push([1, () => closeOwn("dab")]);
  if (sweep) sweep.forEach((rtt, k) => timeline.push([(k * SECONDS) / sweep.length, async () => {
    net.rtt = rtt;
    mark(`network: rtt ${rtt} ms`);
  }]));
  if (late) timeline.push([late.at, async () => {
    const tab = await open(late.i);
    tabs.push(tab);
    tabs.sort((x, y) => x.i - y.i);
    await join(tab);
    mark(`tab ${late.i} joins late`);
    await shoot("late join", true);
  }]);
  if (args.hide) {
    // Headless tabs are never hidden (and Chrome freezes only hidden ones), so the page is told it is, and its animation frames stop, as a browser does.
    const [i, span] = args.hide.split("@");
    const [from, to] = span.split("-").map(Number);
    const tab = () => tabs.find((t) => t.i === Number(i))!;
    const hide = async () => {
      await tab().page.evaluate(() => {
        const w = window as unknown as { __raf: typeof requestAnimationFrame; __held: FrameRequestCallback[] };
        w.__raf = window.requestAnimationFrame;
        w.__held = [];
        window.requestAnimationFrame = (cb) => (w.__held.push(cb), 0);
        Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      mark(`tab ${i} hidden`);
    };
    const show = async () => {
      await tab().page.evaluate(() => {
        const w = window as unknown as { __raf: typeof requestAnimationFrame; __held: FrameRequestCallback[] };
        window.requestAnimationFrame = w.__raf;
        delete (document as unknown as Record<string, unknown>).hidden;
        delete (document as unknown as Record<string, unknown>).visibilityState;
        document.dispatchEvent(new Event("visibilitychange"));
        for (const cb of w.__held.splice(0)) window.requestAnimationFrame(cb);
      });
      mark(`tab ${i} shown again`);
    };
    timeline.push([from, hide], [from + 3, () => shoot("hidden", true)], [to, show], [to + 3, () => shoot("shown again", true)]);
  }
  // Face to face: at the start, and in the quiet plan every 20 s, for meeting after meeting.
  if (face && PLAN !== "feast") for (let s = 0.5; s < SECONDS - 5; s += PLAN === "quiet" ? 20 : SECONDS) timeline.push([s, async () => {
    await Promise.all(tabs.slice(0, 2).map((t) => t.page.evaluate((f) => (globalThis as unknown as { __fly: { life: { body: { place(x: number, z: number, yaw: number): void } } } }).__fly.life.body.place(f[0], f[1], f[2]), FACE[t.i])));
    mark("the two flies set down face to face");
  }]);
  if (PLAN === "feast") {
    // Each round: the two flies are set down face to face again (as a hand might put them), and honey falls between their mouths.
    const round = async () => {
      await Promise.all(tabs.filter((t) => t.i < 2).map((t) => t.page.evaluate((f) => (globalThis as unknown as { __fly: { life: { body: { place(x: number, z: number, yaw: number): void } } } }).__fly.life.body.place(f[0], f[1], f[2]), FACE[t.i])));
      const [a] = tabs;
      await tool(a, "feed");
      if ((await readState(a.page)).variant !== "honey") await a.page.keyboard.press("ArrowDown");
      await point(a, -8, -8);
      await a.page.waitForTimeout(700);
      await a.page.keyboard.press("Enter");
      mark("the two flies face to face, and honey between their mouths");
    };
    for (let s = 1; s < SECONDS - 5; s += 25) timeline.push([s, round], [s + 3, () => shoot(`feast ${s}s`, "close")]);
  }
  if (PLAN === "cost") {
    // Bots follow tab 0's fly, so they stay in its view and its eyes' view.
    timeline.push([0, async () => {
      const follow = setInterval(async () => {
        const me = await flyAt(tabs[0], 0).catch(() => null);
        if (me) Object.assign(centre, { x: me.x, z: me.z });
      }, 1000);
      setTimeout(() => clearInterval(follow), SECONDS * 1000);
    }]);
  }
  if (PLAN === "meet" && tabs.length >= 2) {
    const [a, b] = tabs;
    timeline.push(
      [5, async () => {
        mark("tab 0 drops honey at its own fly's mouth");
        await tool(a, "feed");
        await a.page.keyboard.press("ArrowDown");
        await waitFor(a.page, "variant=honey", 2000);
        await a.page.keyboard.press("Enter");
        await a.page.waitForTimeout(400);
        await shoot("honey", true);
      }],
      [17, () => tool(b, "swoop")],
      [20, async () => {
        const target = await flyAt(b, 1);
        if (!target) return;
        mark(`tab 1 throws the ball at fly 1 (seen at ${target.x.toFixed(1)}, ${target.z.toFixed(1)})`);
        await point(b, target.x, target.z);
        await b.page.keyboard.press("Enter");
        // The dive starts LEAD ms after the press, the same moment on both, and lasts about a third of a second.
        await b.page.waitForTimeout(Number(args.lead ?? 200) + 220);
        await shoot("ball diving", true);
        await shoot("ball diving, each its own view", false);
      }],
      [30, async () => {
        await tool(a, "blow");
        await a.page.keyboard.press("ArrowDown");
        await waitFor(a.page, "variant=strong", 2000);
      }],
      [34, async () => {
        const target = await flyAt(a, 2);
        if (!target) return;
        mark("tab 0 blows hard at fly 2");
        await point(a, target.x - 6, target.z - 6);
        await a.page.keyboard.down("Enter");
        await a.page.waitForTimeout(700);
        await shoot("puff", true);
        await a.page.waitForTimeout(800);
        await a.page.keyboard.up("Enter");
      }],
      [41, () => tool(b, "feather")],
      [45, async () => {
        const target = await flyAt(b, 1);
        if (!target) return;
        mark("tab 1 tickles fly 1 with the feather");
        await point(b, target.x, target.z);
        await b.page.keyboard.down("Enter");
        await b.page.waitForTimeout(800);
        await shoot("feather", true);
        await b.page.waitForTimeout(1200);
        await b.page.keyboard.up("Enter");
      }],
      [55, async () => {
        mark("tab 0 makes it rain");
        await tool(a, "weather");
        for (let n = 0; n < 4; n++) {
          await a.page.keyboard.press("ArrowDown");
          await a.page.waitForTimeout(250);
        }
      }],
      [62, async () => {
        await shoot("rain", false);
        mark("a ladybird and then a butterfly come (the room, asked), and the sky clears");
        await fetch(`http://localhost:${PORT}/happen?kind=ladybird`, { method: "POST" });
        await fetch(`http://localhost:${PORT}/world?weather=clear`, { method: "POST" });
      }],
      [66, async () => void (await fetch(`http://localhost:${PORT}/happen?kind=butterfly`, { method: "POST" }))],
      [70, async () => {
        await release(a);
        await release(b);
        await tool(a, "feed");
        await tool(b, "feed");
      }],
      [75, () => shoot("visitors", true)],
    );
  }
  timeline.sort((x, y) => x[0] - y[0]);
  for (const [s, step] of timeline) {
    if (s > SECONDS) continue;
    await at(s);
    await step().catch((e) => log("step failed:", e));
  }
  await at(SECONDS);
  clearInterval(sampler);
  clearInterval(meeter);
  clearInterval(statser);
  await sample();
  writeFileSync(path.join(OUT, "samples.json"), JSON.stringify(samples));
  writeFileSync(path.join(OUT, "events.json"), JSON.stringify(events));
  writeFileSync(path.join(OUT, "stats.json"), JSON.stringify({ final: room.room.stats(), log: statsLog, seconds: (Date.now() - startedAt) / 1000, clients: CLIENTS, bots: BOTS, net, sweep }));
  writeFileSync(path.join(OUT, "shots.json"), JSON.stringify(shots));
  for (const tab of tabs) if (tab.errors.length) log(`tab ${tab.i} errors:`, tab.errors.slice(0, 8));
  log("summary:", JSON.stringify(summarise(), null, 1));
  if (shots.length) await sheet();
  finished = true;
} finally {
  for (const b of bots) b.close();
  await browser.close();
  vite?.kill();
  room.close();
  if (!finished) process.exitCode = 1;
}

/** Every moment's screenshots side by side in one picture, a row each, for looking at. */
async function sheet() {
  const page = await browser.newPage({ viewport: { width: Math.min(2400, W * tabs.length * 0.5 + 40), height: 400 } });
  const { readFileSync } = await import("node:fs");
  const rows = shots.map((s) => `<div class="row"><div class="name">${s.name}</div>${s.files.map((f, k) => `<figure><img src="data:image/png;base64,${readFileSync(f).toString("base64")}"><figcaption>tab ${k}</figcaption></figure>`).join("")}</div>`).join("");
  await page.setContent(`<style>body{margin:0;background:#111;color:#ddd;font:13px system-ui} .row{display:flex;gap:8px;padding:6px 10px;align-items:flex-start} .name{width:120px} figure{margin:0} img{width:${Math.round(W * 0.5)}px;display:block} figcaption{text-align:center}</style>${rows}`);
  await page.screenshot({ path: path.join(OUT, "sheet.png"), fullPage: true });
  await page.close();
}

function summarise() {
  const num = (v: string | undefined) => (v === undefined || v === "" ? NaN : Number(v));
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
  const per = tabs.map((tab) => {
    const mine = samples.filter((x) => x.i === tab.i).map((x) => x.s);
    const last = mine.at(-1) ?? {};
    const others = mine.flatMap((s) => (s.others ?? "").split(";").filter(Boolean).map((o) => o.split(":")));
    const closest = mine.map((s) => num(s.closest)).filter(Number.isFinite);
    return {
      tab: tab.i,
      player: last.player,
      frameMs: +mean(mine.map((s) => num(s.frameMs))).toFixed(2),
      calls: +mean(mine.map((s) => num(s.calls))).toFixed(1),
      maxCalls: Math.max(...mine.map((s) => num(s.calls)).filter(Number.isFinite)),
      triangles: Math.round(mean(mine.map((s) => num(s.triangles)))),
      eyesMs: +mean(mine.map((s) => num(s.eyesMs))).toFixed(2),
      rtt: +mean(mine.map((s) => num(s.rtt))).toFixed(1),
      drawnBehindMs: +mean(others.map((o) => Number(o[4]))).toFixed(0),
      starvedPct: +mean(others.map((o) => Number(o[5]))).toFixed(1),
      closestMm: closest.length ? +Math.min(...closest).toFixed(2) : null,
      overlappedSamples: closest.filter((c) => c < -0.05).length,
      contactSamples: mine.filter((s) => num(s.contact) > 0).length,
      bumpSamples: mine.filter((s) => /bump (0\.[1-9]|1\.)/.test(s.senses ?? "")).length,
      predicted: num(last.predicted),
      granted: num(last.granted),
      lostBites: num(last.lostBites),
      takeoffs: num(last.takeoffs),
      meals: num(last.meals),
      fps: +mean(mine.map((s) => num(s.fps)).filter(Number.isFinite)).toFixed(1),
      netIn: num(last.netIn),
      netOut: num(last.netOut),
      errors: tab.errors.length,
    };
  });
  // Do the tabs agree on the table? The bubbles' cycles, sampled at the same moments.
  const times = [...new Set(samples.map((s) => s.t))];
  let agree = 0;
  let compared = 0;
  for (const t of times) {
    const at = samples.filter((s) => s.t === t && s.s.bubbles);
    if (at.length < 2) continue;
    compared++;
    // The same cycle in each slot (start times may differ by the network's lag in a pop).
    const cycles = at.map((s) => s.s.bubbles.split(",").map((c) => c.split("@")[0]).join(","));
    if (cycles.every((c) => c === cycles[0])) agree++;
  }
  const stats: Partial<ReturnType<typeof room.room.stats>> = room.room.stats();
  delete stats.bubbles;
  return { per, bubblesAgree: compared ? `${agree}/${compared}` : "n/a", room: stats };
}
