import assert from "node:assert/strict";
import { test } from "node:test";
import type { BrainRequest, BrainResponse, BrainSenses, BrainState } from "@fly/brain";
import { REGION_RATE_NAMES, RESTING_SENSES } from "@fly/brain";
import { COMMAND_ORDER, SENSE_ORDER, STATE_STATS } from "@fly/contracts";
import type { BrainStatus, NativeBrainBridge } from "@fly/contracts";
import { createBrainHost } from "../src/brain/host.ts";
import { BrainMeter } from "../src/brain/meter.ts";
import { NativeBrainDriver } from "../src/brain/native-driver.ts";
import { BrainLoadError } from "../src/brain/download.ts";
import { LOAD_TIMEOUT_MS, MAX_TICK_MS, MAX_WAIT_STEP_MS, STALL_MS, WorkerBrainDriver } from "../src/brain/worker-driver.ts";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const state = (walk = 0.5): BrainState => ({ command: { walk, turn: 0, back: 0, escape: 0, wings: 0, groom: 0, feed: 0 }, stats: { simMs: 10, wallMs: 1, spikes: 500, active: 100, rates: {} } });

function fakeWorker() {
  const sent: { request: BrainRequest; transfer?: Transferable[] }[] = [];
  let onMessage: (response: BrainResponse) => void = () => {};
  let onError: (message: string) => void = () => {};
  let terminated = false;
  return {
    sent,
    get terminated() {
      return terminated;
    },
    reply: (response: BrainResponse) => onMessage(response),
    crash: (message: string) => onError(message),
    factory: (m: typeof onMessage, e: typeof onError) => {
      onMessage = m;
      onError = e;
      return { post: (request: BrainRequest, transfer?: Transferable[]) => sent.push({ request, transfer }), terminate: () => void (terminated = true) };
    },
  };
}

/** A connectome source that hands over `data`, or fails as `error` says, as told. */
function fakeSource(load: () => Promise<ArrayBuffer>) {
  const source = {
    received: 0,
    total: 100,
    from: "network" as "cache" | "network" | null,
    storageFull: false,
    loads: 0,
    discarded: 0,
    load: async (onProgress: () => void) => {
      source.loads++;
      source.received = 50;
      onProgress();
      return load();
    },
    discard: async () => void source.discarded++,
  };
  return source;
}

test("the worker driver loads the connectome, transfers it and runs once the worker is ready", async () => {
  const worker = fakeWorker();
  let now = 0;
  const data = new ArrayBuffer(16);
  const source = fakeSource(async () => data);
  const driver = new WorkerBrainDriver({ createWorker: worker.factory, source, now: () => now });
  assert.equal(driver.status, "loading");
  assert.equal(driver.progress, 0.5, "half the bytes are in");
  await flush();
  assert.equal(driver.phase, "build");
  assert.equal(driver.progress, 1);
  assert.equal(worker.sent[0].request.type, "init");
  assert.deepEqual(worker.sent[0].transfer, [data]);
  worker.reply({ type: "ready", neurons: 166700, connections: 6, eyes: null });
  assert.equal(driver.status, "running");
  assert.equal(driver.neurons, 166700);
  driver.tick(16, RESTING_SENSES);
  assert.equal(worker.sent.length, 2);
  now = 5;
  const regions = driver.regionRates;
  assert.equal(regions.length, REGION_RATE_NAMES.length);
  const answer = state();
  answer.stats.rates["region.mouthparts"] = 12.5;
  worker.reply({ type: "state", state: answer });
  assert.equal(driver.state?.command.walk, 0.5);
  assert.equal(driver.stateAt, 5);
  assert.equal(driver.regionRates, regions, "filled in place");
  assert.equal(regions[REGION_RATE_NAMES.indexOf("region.mouthparts")], 12.5);
  assert.equal(regions.reduce((sum, x) => sum + x, 0), 12.5, "a region the brain doesn't report reads 0");
});

const running = async (now: () => number = () => 0) => {
  const worker = fakeWorker();
  const driver = new WorkerBrainDriver({ createWorker: worker.factory, source: fakeSource(async () => new ArrayBuffer(8)), now });
  await flush();
  worker.reply({ type: "ready", neurons: 1, connections: 1, eyes: null });
  return { worker, driver };
};

test("one tick at a time: time spent waiting goes out with the next, up to a cap", async () => {
  const { worker, driver } = await running();
  driver.tick(16, RESTING_SENSES);
  for (let i = 0; i < 20; i++) driver.tick(16, RESTING_SENSES);
  assert.equal(worker.sent.length, 2, "busy: nothing more sent");
  worker.reply({ type: "state", state: state() });
  driver.tick(16, RESTING_SENSES);
  const last = worker.sent.at(-1)!.request as { type: "tick"; dtMs: number };
  assert.equal(last.dtMs, MAX_TICK_MS);
});

test("the senses are copied, light arrays included, so the caller can reuse them", async () => {
  const { worker, driver } = await running();
  const left = new Float32Array([0.1, 0.2]);
  const senses: BrainSenses = { ...RESTING_SENSES, sweet: 1, light: { left, right: new Float32Array([0.3]) } };
  driver.tick(16, senses);
  left[0] = 9;
  senses.sweet = 0;
  const sent = (worker.sent.at(-1)!.request as { senses: BrainSenses }).senses;
  assert.equal(sent.sweet, 1);
  assert.ok(Math.abs(sent.light!.left[0] - 0.1) < 1e-6);
});

test("a brain that stops answering while the game runs fails; a page asleep for an hour doesn't count", async () => {
  let now = 0;
  const { worker, driver } = await running(() => now);
  driver.tick(16, RESTING_SENSES);
  now += 3_600_000;
  driver.tick(16, RESTING_SENSES);
  assert.equal(driver.status, "running", "the gap was the page asleep, not the brain");
  for (let t = 0; t <= STALL_MS + MAX_WAIT_STEP_MS; t += 16) {
    now += 16;
    driver.tick(16, RESTING_SENSES);
  }
  assert.equal(driver.status, "failed");
  assert.equal(driver.failure, "brain");
  assert.equal(worker.terminated, true);
});

test("a crash, a missing or damaged connectome and a slow build each fail as what they are", async () => {
  const crash = fakeWorker();
  const crashing = new WorkerBrainDriver({ createWorker: crash.factory, source: fakeSource(async () => new ArrayBuffer(8)) });
  await flush();
  crash.crash("boom");
  assert.equal(crashing.status, "failed");
  assert.equal(crashing.error, "boom");
  assert.equal(crashing.failure, "brain");

  const missing = new WorkerBrainDriver({ createWorker: fakeWorker().factory, source: fakeSource(() => Promise.reject(new BrainLoadError("missing", "not here"))) });
  await flush();
  assert.equal(missing.status, "failed");
  assert.equal(missing.error, "not here");
  assert.equal(missing.failure, "missing");

  const damaged = fakeWorker();
  const unpacking = new WorkerBrainDriver({ createWorker: damaged.factory, source: fakeSource(async () => new ArrayBuffer(8)) });
  await flush();
  damaged.reply({ type: "error", message: "The fly's brain arrived damaged (it doesn't unzip)." });
  assert.equal(unpacking.failure, "damaged");

  const noWorkers = new WorkerBrainDriver({
    createWorker: () => {
      throw new Error("Worker is not defined");
    },
    source: fakeSource(async () => new ArrayBuffer(8)),
  });
  await flush();
  assert.equal(noWorkers.failure, "unsupported");

  const slow = fakeWorker();
  let t = 0;
  const slowDriver = new WorkerBrainDriver({ createWorker: slow.factory, source: fakeSource(async () => new ArrayBuffer(8)), now: () => t });
  await flush();
  for (let ms = 0; ms <= LOAD_TIMEOUT_MS + MAX_WAIT_STEP_MS; ms += 100) {
    t += 100;
    slowDriver.tick(16, RESTING_SENSES);
  }
  assert.equal(slowDriver.status, "failed");
});

test("trying again loads again, and a kept copy the brain couldn't be built from is forgotten first", async () => {
  let fail = true;
  const source = fakeSource(() => (fail ? Promise.reject(new BrainLoadError("offline", "You're offline.")) : Promise.resolve(new ArrayBuffer(8))));
  const worker = fakeWorker();
  const driver = new WorkerBrainDriver({ createWorker: worker.factory, source });
  await flush();
  assert.equal(driver.failure, "offline");
  fail = false;
  driver.retry();
  assert.equal(driver.status, "loading");
  await flush();
  assert.equal(source.loads, 2);
  worker.reply({ type: "error", message: "Corrupt connectome: ptr does not span the connections" });
  assert.equal(driver.failure, "damaged");
  source.from = "cache";
  driver.retry();
  await flush();
  await flush();
  assert.equal(source.discarded, 1);
  assert.equal(source.loads, 3);
  worker.reply({ type: "ready", neurons: 1, connections: 1, eyes: null });
  assert.equal(driver.status, "running");
});

test("the worker host builds the brain once and answers every tick", () => {
  const posted: BrainResponse[] = [];
  const host = createBrainHost(() => ({ neurons: 3, connections: 2, eyes: null, tick: () => state(0.25) }), (r) => posted.push(r));
  host({ type: "tick", dtMs: 10, senses: RESTING_SENSES });
  assert.equal(posted[0].type, "error");
  host({ type: "init", data: new ArrayBuffer(1) });
  assert.deepEqual(posted[1], { type: "ready", neurons: 3, connections: 2, eyes: null });
  host({ type: "tick", dtMs: 10, senses: RESTING_SENSES });
  assert.equal(posted[2].type, "state");
  host({ type: "init", data: new ArrayBuffer(1) });
  assert.equal(posted[3].type, "error");
});

function fakeBridge() {
  let status: BrainStatus = "loading";
  let count = 0;
  const submitted: { dt: number; scalars: number[]; left: Float32Array | null }[] = [];
  // Two regions, not in the catalog's order: the driver finds them by name.
  const rates = ["DNg100", "MN9", "region.mouthparts", "region.retina-left"];
  const values = new Float32Array(COMMAND_ORDER.length + STATE_STATS.length + rates.length);
  const bridge: NativeBrainBridge = {
    start: () => {},
    status: () => status,
    error: () => (status === "failed" ? "native trouble" : ""),
    neurons: () => 166700,
    connections: () => 6242118,
    eyeDirections: (side) => (side === 0 ? new Float32Array([1, 0, 0, 0, 1, 0]) : new Float32Array([-1, 0, 0])),
    eyeAcceptance: () => 0.05,
    rateNames: () => rates,
    submit: (dt, scalars, left) => void submitted.push({ dt, scalars: [...scalars], left: left ? Float32Array.from(left) : null }),
    read: (out) => {
      out.set(values);
      return count;
    },
  };
  return {
    bridge,
    submitted,
    setStatus: (s: BrainStatus) => void (status = s),
    produce: (walk: number) => {
      values[0] = walk;
      values[COMMAND_ORDER.length + 2] = 1234;
      values[COMMAND_ORDER.length + STATE_STATS.length] = 33;
      values[COMMAND_ORDER.length + STATE_STATS.length + 2] = walk * 10;
      values[COMMAND_ORDER.length + STATE_STATS.length + 3] = 7;
      count++;
    },
  };
}

test("the native driver waits for the host, then packs senses in order and decodes states in place", () => {
  const fake = fakeBridge();
  let now = 100;
  const driver = new NativeBrainDriver(fake.bridge, { now: () => now });
  driver.tick(16, RESTING_SENSES);
  assert.equal(driver.status, "loading");
  assert.equal(fake.submitted.length, 0);
  fake.setStatus("running");
  const senses: BrainSenses = { ...RESTING_SENSES, sweet: 0.75, bumpLeft: 0.5, grounded: false };
  driver.tick(16, senses);
  assert.equal(driver.status, "running");
  assert.equal(driver.neurons, 166700);
  assert.equal(driver.eyes?.left.directions.length, 6);
  const sent = fake.submitted[0];
  assert.equal(sent.scalars[SENSE_ORDER.indexOf("sweet")], 0.75);
  assert.equal(sent.scalars[SENSE_ORDER.indexOf("bumpLeft")], 0.5);
  assert.equal(sent.scalars[SENSE_ORDER.indexOf("grounded")], 0);
  const latest = (): BrainState | null => driver.state;
  assert.equal(latest(), null, "no state yet");
  fake.produce(0.6);
  now = 120;
  driver.tick(16, senses);
  const first = latest();
  assert.ok(first);
  assert.ok(Math.abs(first.command.walk - 0.6) < 1e-6);
  assert.equal(first.stats.spikes, 1234);
  assert.equal(first.stats.rates.DNg100, 33);
  assert.equal(driver.stateAt, 120);
  const regions = driver.regionRates;
  const mouthparts = REGION_RATE_NAMES.indexOf("region.mouthparts");
  assert.ok(Math.abs(regions[mouthparts] - 6) < 1e-5);
  assert.equal(regions[REGION_RATE_NAMES.indexOf("region.retina-left")], 7);
  assert.ok(Math.abs(regions.reduce((sum, x) => sum + x, 0) - 13) < 1e-5, "a region the brain doesn't report reads 0");
  now = 140;
  driver.tick(16, senses);
  assert.equal(driver.stateAt, 120, "the same state isn't new");
  fake.produce(0.2);
  driver.tick(16, senses);
  assert.equal(latest(), first, "decoded into the same object");
  assert.ok(Math.abs(first.command.walk - 0.2) < 1e-6);
  assert.equal(driver.regionRates, regions, "and the regions into the same array");
  assert.ok(Math.abs(regions[mouthparts] - 2) < 1e-5);
});

test("the native driver passes the eyes' light through its own arrays, and reports a failing host", () => {
  const fake = fakeBridge();
  fake.setStatus("running");
  const driver = new NativeBrainDriver(fake.bridge);
  driver.tick(16, { ...RESTING_SENSES, light: { left: [0.5, 0.25], right: [1] } });
  assert.deepEqual([...fake.submitted.at(-1)!.left!], [0.5, 0.25]);
  fake.setStatus("failed");
  driver.tick(16, RESTING_SENSES);
  assert.equal(driver.status, "failed");
  assert.equal(driver.error, "native trouble");
});

test("the meter measures spikes per second of fly time", () => {
  const meter = new BrainMeter();
  const driver = { status: "running", state: state(), stateAt: 0 } as unknown as WorkerBrainDriver;
  for (let t = 0; t <= 1100; t += 10) {
    (driver as { stateAt: number }).stateAt = t;
    meter.update(driver, t);
  }
  // 500 spikes per 10 ms of fly time.
  assert.ok(Math.abs(meter.spikesPerSecond - 50_000) < 1);
  assert.ok(meter.speed > 0.9 && meter.speed < 1.1);
});
