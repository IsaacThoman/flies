import assert from "node:assert/strict";
import { test } from "node:test";
import type { BrainRequest, BrainResponse, BrainSenses, BrainState } from "@fly/brain";
import { RESTING_SENSES } from "@fly/brain";
import { COMMAND_ORDER, SENSE_ORDER, STATE_STATS } from "@fly/contracts";
import type { BrainStatus, NativeBrainBridge } from "@fly/contracts";
import { createBrainHost } from "../src/brain/host.ts";
import { BrainMeter } from "../src/brain/meter.ts";
import { NativeBrainDriver } from "../src/brain/native-driver.ts";
import { LOAD_TIMEOUT_MS, MAX_TICK_MS, STALL_MS, WorkerBrainDriver } from "../src/brain/worker-driver.ts";

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

test("the worker driver loads the connectome, transfers it and runs once the worker is ready", async () => {
  const worker = fakeWorker();
  let now = 0;
  const data = new ArrayBuffer(16);
  const driver = new WorkerBrainDriver({ createWorker: worker.factory, load: async (progress) => (progress(0.5), data), now: () => now });
  assert.equal(driver.status, "loading");
  await flush();
  assert.equal(driver.phase, "build");
  assert.equal(worker.sent[0].request.type, "init");
  assert.deepEqual(worker.sent[0].transfer, [data]);
  worker.reply({ type: "ready", neurons: 166700, connections: 6, eyes: null });
  assert.equal(driver.status, "running");
  assert.equal(driver.neurons, 166700);
  driver.tick(16, RESTING_SENSES);
  assert.equal(worker.sent.length, 2);
  now = 5;
  worker.reply({ type: "state", state: state() });
  assert.equal(driver.state?.command.walk, 0.5);
  assert.equal(driver.stateAt, 5);
});

test("one tick at a time: time spent waiting goes out with the next, up to a cap", async () => {
  const worker = fakeWorker();
  const driver = new WorkerBrainDriver({ createWorker: worker.factory, load: async () => new ArrayBuffer(8), now: () => 0 });
  await flush();
  worker.reply({ type: "ready", neurons: 1, connections: 1, eyes: null });
  driver.tick(16, RESTING_SENSES);
  for (let i = 0; i < 20; i++) driver.tick(16, RESTING_SENSES);
  assert.equal(worker.sent.length, 2, "busy: nothing more sent");
  worker.reply({ type: "state", state: state() });
  driver.tick(16, RESTING_SENSES);
  const last = worker.sent.at(-1)!.request as { type: "tick"; dtMs: number };
  assert.equal(last.dtMs, MAX_TICK_MS);
});

test("the senses are copied, light arrays included, so the caller can reuse them", async () => {
  const worker = fakeWorker();
  const driver = new WorkerBrainDriver({ createWorker: worker.factory, load: async () => new ArrayBuffer(8), now: () => 0 });
  await flush();
  worker.reply({ type: "ready", neurons: 1, connections: 1, eyes: null });
  const left = new Float32Array([0.1, 0.2]);
  const senses: BrainSenses = { ...RESTING_SENSES, sweet: 1, light: { left, right: new Float32Array([0.3]) } };
  driver.tick(16, senses);
  left[0] = 9;
  senses.sweet = 0;
  const sent = (worker.sent.at(-1)!.request as { senses: BrainSenses }).senses;
  assert.equal(sent.sweet, 1);
  assert.ok(Math.abs(sent.light!.left[0] - 0.1) < 1e-6);
});

test("a stalled, crashed or erroring brain fails, and so does a missing connectome", async () => {
  const worker = fakeWorker();
  let now = 0;
  const driver = new WorkerBrainDriver({ createWorker: worker.factory, load: async () => new ArrayBuffer(8), now: () => now });
  await flush();
  worker.reply({ type: "ready", neurons: 1, connections: 1, eyes: null });
  driver.tick(16, RESTING_SENSES);
  now = STALL_MS + 1;
  driver.tick(16, RESTING_SENSES);
  assert.equal(driver.status, "failed");
  assert.equal(worker.terminated, true);

  const crash = fakeWorker();
  const crashing = new WorkerBrainDriver({ createWorker: crash.factory, load: async () => new ArrayBuffer(8) });
  await flush();
  crash.crash("boom");
  assert.equal(crashing.status, "failed");
  assert.equal(crashing.error, "boom");

  const missing = new WorkerBrainDriver({ createWorker: fakeWorker().factory, load: async () => Promise.reject(new Error("not installed")) });
  await flush();
  assert.equal(missing.status, "failed");
  assert.equal(missing.error, "not installed");

  const slow = fakeWorker();
  let t = 0;
  const slowDriver = new WorkerBrainDriver({ createWorker: slow.factory, load: async () => new ArrayBuffer(8), now: () => t });
  await flush();
  t = LOAD_TIMEOUT_MS + 1;
  slowDriver.tick(16, RESTING_SENSES);
  assert.equal(slowDriver.status, "failed");
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
  const rates = ["DNg100", "MN9"];
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
  assert.equal(driver.state, null, "no state yet");
  fake.produce(0.6);
  now = 120;
  driver.tick(16, senses);
  const first = driver.state;
  assert.ok(first);
  assert.ok(Math.abs(first.command.walk - 0.6) < 1e-6);
  assert.equal(first.stats.spikes, 1234);
  assert.equal(first.stats.rates.DNg100, 33);
  assert.equal(driver.stateAt, 120);
  now = 140;
  driver.tick(16, senses);
  assert.equal(driver.stateAt, 120, "the same state isn't new");
  fake.produce(0.2);
  driver.tick(16, senses);
  assert.equal(driver.state, first, "decoded into the same object");
  assert.ok(Math.abs(first.command.walk - 0.2) < 1e-6);
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
