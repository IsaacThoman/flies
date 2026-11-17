// A capture-only entry point: fixed-step real games, including their real brains.
// No requestAnimationFrame, worker timing, invented commands or synthetic region rates.
import { REGION_RATE_NAMES } from "@fly/brain";
import type { Brain, BrainSenses, BrainState } from "@fly/brain";
import { WasmBrainModule } from "@fly/brain-native";
import type { BrainDriver, TableSocket } from "@fly/contracts";
import type { TableStart } from "@fly/net";
import { BRAIN_FILE, BRAIN_MODULE } from "./brain/create.ts";
import { BrainDownload, BrainFiles } from "./brain/download.ts";
import { unpackConnectome } from "./brain/wire.ts";
import { Display } from "./display.ts";
import { Game } from "./game.ts";
import { Devices, Remote } from "./input.ts";
import { Online } from "./online/online.ts";
import type { TableHost } from "./online/online.ts";
import { TOOLS } from "./tools/hands.ts";

export const STORE_STORIES = ["01-portrait", "02-feeding", "03-flight", "04-inside", "05-eyes", "06-rain", "07-night", "08-together"] as const;
export type StoreStory = typeof STORE_STORIES[number];

let now = 0;
Object.defineProperty(performance, "now", { value: () => now });

class CaptureBrain implements BrainDriver {
  readonly status = "running";
  readonly error = null;
  readonly engine = "wasm";
  readonly neurons: number;
  readonly connections: number;
  readonly eyes: Brain["eyes"];
  state: BrainState | null = null;
  stateAt = 0;
  readonly regionRates = new Float32Array(REGION_RATE_NAMES.length);
  readonly brain: Brain;
  constructor(brain: Brain) {
    this.brain = brain;
    this.neurons = brain.neurons;
    this.connections = brain.connections;
    this.eyes = brain.eyes;
  }
  tick(dt: number, senses: BrainSenses) {
    this.state = this.brain.tick(dt, senses);
    this.stateAt = now;
    REGION_RATE_NAMES.forEach((name, i) => this.regionRates[i] = this.state!.stats.rates[name] ?? 0);
  }
  dispose() {}
}

export type StoreWire = string | number[];
export type StoreRoomRequest = { kind: "start"; seats: [number, number, number, number][] } | { kind: "step"; now: number; outgoing: { key: string; data: StoreWire }[] };
export type StoreRoomReply = Record<string, { packets: StoreWire[]; closed?: { code: number; reason: string } }>;
const room = (request: StoreRoomRequest) => (globalThis as unknown as { __storeRoom(request: StoreRoomRequest): Promise<StoreRoomReply> }).__storeRoom(request);
const outgoing: { key: string; data: StoreWire }[] = [];
const incoming: StoreRoomReply = {};

// Only the transport is local: Node runs the production Table and its protocol.
function connection(key: string): TableSocket {
  let closed = false;
  return {
    get status() { return closed || incoming[key]?.closed ? "closed" : "open"; },
    get closeCode() { return incoming[key]?.closed?.code ?? 1000; },
    get closeReason() { return incoming[key]?.closed?.reason ?? ""; },
    send(data) { outgoing.push({ key, data: typeof data === "string" ? data : Array.from(data) }); },
    drain(text, binary) {
      for (const data of incoming[key]?.packets.splice(0) ?? []) {
        if (typeof data === "string") text(data);
        else binary(new DataView(new Uint8Array(data).buffer));
      }
    },
    close() { closed = true; },
  };
}

async function capture(story: StoreStory, tv = false) {
  if (!BRAIN_FILE || !BRAIN_MODULE) throw new Error("Run npm run brain:fetch first");
  const env = { fetch: window.fetch.bind(window), caches: null, subtle: crypto.subtle, online: () => true };
  const source = new BrainFiles(new BrainDownload(BRAIN_FILE, document.baseURI, env), new BrainDownload(BRAIN_MODULE, document.baseURI, env));
  const { data, module } = await source.load();
  if (!module) throw new Error("Missing brain module");
  let random = 719;
  Math.random = () => { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; return random / 4294967296; };
  const games: Game[] = [];
  const make = async (index: number) => {
    const wasm = await WasmBrainModule.instantiate(module);
    await unpackConnectome(data.slice(0), bytes => wasm.connectomeSpace(bytes));
    const driver = new CaptureBrain(wasm.create(179 + index));
    localStorage.clear();
    const place = story === "06-rain" ? "windowsill" : story === "07-night" ? "bar" : "picnic";
    localStorage.setItem("flies.settings", JSON.stringify({ place, scene: place, wallpaperAfter: 0, hints: false, stats: false, eyesInset: "off", nerves: story === "04-inside" ? "always" : "off", statsPanel: "off", xray: story === "04-inside" ? "always" : "off", realWeather: false }));
    localStorage.setItem("flies.shelf", JSON.stringify({ light: { kind: story === "04-inside" ? "dusk" : story === "07-night" ? "night" : "noon", at: Date.now() }, weather: { kind: story === "06-rain" ? "rain" : "clear", at: Date.now() } }));
    const canvas = index === 0 ? document.getElementById("game") as HTMLCanvasElement : document.body.appendChild(document.createElement("canvas"));
    if (index) canvas.className = "peer";
    const display = new Display(tv);
    const devices = new Devices(tv ? "remote" : "touch");
    const remote = new Remote(window, undefined, devices);
    const game = new Game(canvas, remote, driver, display, { devices });
    // Each visual sample must reach the next fixed step, independent of GPU fence timing.
    const renderer = game.stage.renderer;
    renderer.readRenderTargetPixelsAsync = async (...args) => {
      renderer.readRenderTargetPixels(...args);
      return args[5];
    };
    game.play();
    games.push(game);
    return game;
  };
  const game = await make(0);
  const tool = (id: string, kind?: string) => {
    const index = TOOLS.findIndex(t => t.id === id);
    game.hands.chooseTool(index);
    if (kind) game.hands.variants[index] = TOOLS[index].variants.findIndex(v => v.id === kind);
  };
  if (story === "08-together") {
    await make(1); await make(2);
    const start: TableStart = { place: "picnic", light: "morning", weather: "clear", zone: "UTC", offset: 0 };
    // Stage initial positions on real fruit; each brain then chooses normally.
    await room({ kind: "start", seats: games.map((g, i) => {
      const angle = i * Math.PI * 2 / 3;
      const x = 18 + Math.sin(angle) * 2.8, z = 52 + Math.cos(angle) * 2.8;
      return [x, g.life.world.heightAt(x, z), z, angle + Math.PI];
    }) });
    games.forEach((g, i) => {
      const host: TableHost = {
        scene: g.stage.scene, stage: g.stage, life: g.life, hands: g.hands, fly: g.fly, eyes: g.eyes, bubbles: g.bubbles,
        felt: { air: { x: 0, y: 0, z: 0 }, touch: 0, looming: [] },
        here: () => g.here, moving: () => false, moveTo: id => g.moveTo(id),
        onWorld: () => { g.stage.setTime("morning"); g.stage.weather.choose("clear", true); },
      };
      g.online = new Online(host, () => connection(`capture-${i}`), location.href, "abcd1234", `capture-${i}`, i ? null : start);
    });
  }
  if (story === "02-feeding" || story === "04-inside") {
    // Set down at a real fruit patch; taste and the brain must decide whether to feed.
    game.life.body.place(18, 52, 0.6);
    if (story === "02-feeding") tool("feed", "honey");
  }
  if (story === "03-flight") tool("swoop");
  if (story === "05-eyes") {
    game.hands.chooseView("eyes");
    game.director.setView("follow");
    tool("view", "eyes");
  } else {
    const view = story === "07-night" || story === "06-rain" ? "table" : story === "08-together" ? "wide" : "close";
    game.hands.chooseView(view); game.director.setView(view);
  }
  if (story === "04-inside") tool("view", "inside");
  const observing = ["07-night", "08-together"].includes(story);
  if (observing) for (const g of games) g.watch();
  if (story === "08-together") {
    const update = game.director.update.bind(game.director);
    game.director.update = (body, dt) => {
      update(body, dt);
      const positions = games.map(g => g.life.body.position);
      const middle = positions.reduce((p, q) => ({ x: p.x + q.x / 3, y: p.y + q.y / 3, z: p.z + q.z / 3 }), { x: 0, y: 0, z: 0 });
      const radius = Math.max(4.5, ...positions.map(p => Math.hypot(p.x - middle.x, p.z - middle.z) + 2));
      const camera = game.director.camera;
      const distance = radius / (Math.tan(Math.PI / 12) * camera.aspect) * 1.25;
      camera.position.set(middle.x + distance * 0.18, middle.y + distance * 0.4, middle.z + distance);
      camera.fov = 30;
      camera.lookAt(middle.x, middle.y + 0.65, middle.z);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
    };
  }
  let captured = false;
  for (let frame = 0; frame < 1800; frame++) {
    now = (frame + 1) * (1000 / 60);
    if (story === "03-flight" && frame === 220) game.director.turnBy(-0.5, 0.2);
    if (story === "03-flight" && frame >= 240 && frame % 180 === 60) {
      game.hands.release();
      game.hands.update(0, { use: true, holding: false, eye: game.director.camera.position }, game.life.body, game.life.pantry);
    }
    for (const g of games) g.frame(1 / 60, now);
    if (story === "08-together") Object.assign(incoming, await room({ kind: "step", now, outgoing: outgoing.splice(0) }));
    // Complete the eyes' sample/cleanup promise chain before advancing game time.
    for (let i = 0; i < 4; i++) await Promise.resolve();
    const ready = frame >= (story === "03-flight" ? 240 : observing ? 420 : 300);
    const chosen = story === "02-feeding" ? game.life.eating && game.fly.pose.feed > 0.15 : story === "03-flight" ? game.life.body.mode === "airborne" && game.fly.model.rig.wingHaze > 0.4 && game.canvas.dataset.activity === "flying" : true;
    if (ready && chosen) { captured = true; break; }
  }
  if (!captured) throw new Error(`The brain did not choose ${story} within 30 seconds`);
  if (story === "08-together" && game.online!.others.list.filter(o => o.present).length !== 2) throw new Error("Missing real peers");
  const body = game.life.body;
  const state = JSON.stringify({ position: body.position, yaw: body.yaw, velocity: body.velocity, command: game.brain.state?.command, rates: Array.from(game.brain.regionRates), light: game.life.light });
  let fingerprint = 2166136261;
  for (let i = 0; i < state.length; i++) fingerprint = Math.imul(fingerprint ^ state.charCodeAt(i), 16777619) >>> 0;
  return { story, wallpaper: game.wallpaper, staging: story === "08-together" ? "three initial positions on existing strawberry juice" : null, fingerprint: fingerprint.toString(16), frames: Math.round(now * 60 / 1000), neurons: game.brain.neurons, activity: game.life.activity, eaten: game.life.eaten, takeOffs: game.life.takeOffs, eyeUpdates: game.eyes.updates, peers: game.online?.others.list.filter(o => o.present).length ?? 0 };
}
(globalThis as unknown as { __store: unknown }).__store = { capture, ready: true };
