import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import type { EyeMap } from "@fly/brain";
import { Eyes } from "../src/eyes/eyes.ts";
import type { Life } from "../src/life.ts";
import type { Stage } from "../src/stage.ts";

function setup(companionEyes?: number) {
  const map: EyeMap = {
    left: { directions: new Float32Array([0, 1, 0]) },
    right: { directions: new Float32Array([0, 1, 0]) },
    acceptance: 0.1,
  };
  const brain = { eyes: map as EyeMap | null, status: "running" };
  const life = {
    brain,
    body: { position: { x: 0, y: 0, z: 0 }, yaw: 0, up: { x: 0, y: 1, z: 0 } },
    light: null,
  } as unknown as Life;
  const reads: { target: THREE.WebGLRenderTarget; finish(): void; fail(): void }[] = [];
  const renderer = {
    info: { render: { calls: 0 } },
    setRenderTarget() {},
    clear() {},
    render() { this.info.render.calls++; },
    readRenderTargetPixelsAsync(target: THREE.WebGLRenderTarget, _x: number, _y: number, _w: number, _h: number, pixels: Uint8Array) {
      return new Promise<Uint8Array>((resolve, reject) => {
        reads.push({ target, finish() { pixels.fill(255); resolve(pixels); }, fail() { reject(Error("read failed")); } });
      });
    },
  };
  const stage = {
    renderer,
    scene: new THREE.Scene(),
    table: { seen: [] },
    hemi: new THREE.HemisphereLight(),
    sun: new THREE.DirectionalLight(),
    light: {},
    current: { camera: {}, companionEyes },
  } as unknown as Stage;
  return { eyes: new Eyes(stage, life), life, reads, stage, brain };
}

const settled = () => new Promise<void>((resolve) => setImmediate(resolve));

test("eyes keep the last complete light and allow only one asynchronous read in flight", async () => {
  const { eyes, life, reads } = setup();
  eyes.render(1 / 20, false);
  eyes.beforeStep();
  assert.equal(life.light, null, "unread pixels must not be sent as a dark picture");
  assert.equal(eyes.updates, 0);
  for (let i = 0; i < 120; i++) eyes.render(1 / 60, false, true);
  assert.equal(reads.length, 1, "a stalled GPU cannot queue more reads");
  reads[0].finish();
  await settled();
  eyes.beforeStep();
  assert.equal(life.light!.left[0], 1);
  assert.equal(life.light!.right[0], 1);
  assert.equal(eyes.updates, 1);
  eyes.render(1 / 60, false, true);
  assert.equal(reads.length, 2);
  assert.equal(life.light!.left[0], 1, "the brain keeps completed light during the next read");
  reads[1].finish();
  await settled();
});

test("an eye detail change waits for readback before disposing its render target", async () => {
  const { eyes, reads, life } = setup();
  eyes.render(1, false);
  let disposed = false;
  reads[0].target.addEventListener("dispose", () => { disposed = true; });
  eyes.detail = "high";
  eyes.render(1, false);
  assert.equal(disposed, false);
  reads[0].finish();
  await settled();
  eyes.render(1, false);
  assert.equal(disposed, true);
  assert.equal(reads[1].target.height, 32);
  eyes.beforeStep();
  assert.equal(life.light!.left[0], 1, "a resolution change retains the last complete light");
  eyes.detail = "off";
  reads[1].finish();
  await settled();
  eyes.beforeStep();
  assert.equal(life.light, null, "a completed read does not reopen switched-off eyes");
});

test("a rejected eye read can recover on the next refresh", async (t) => {
  const warning = t.mock.method(console, "warn", () => {});
  const { eyes, reads } = setup();
  eyes.render(1, false);
  reads[0].fail();
  await settled();
  assert.equal(warning.mock.calls.length, 1);
  assert.equal(eyes.updates, 0);
  eyes.render(1, false);
  reads[1].finish();
  await settled();
  assert.equal(eyes.updates, 1);
});

test("eyes refresh a frame late rather than in a frame that rebuilt the reflections", async () => {
  const { eyes, reads, stage } = setup();
  eyes.render(1 / 60, false);
  reads[0].finish();
  await settled();
  stage.reflected = true;
  eyes.render(1, false);
  assert.equal(reads.length, 1, "not in the reflections' frame");
  stage.reflected = false;
  eyes.render(1 / 60, false);
  assert.equal(reads.length, 2, "the next frame");
  reads[1].finish();
  await settled();
});

test("eyes with no picture yet refresh even in a frame that rebuilt the reflections", () => {
  const { eyes, reads, stage } = setup();
  stage.reflected = true;
  eyes.render(1 / 60, false);
  assert.equal(reads.length, 1);
});


test("an arriving brain never receives a picture sampled for stand-in eyes", async () => {
  const { eyes, life, reads, brain } = setup();
  const actual = life.brain.eyes;
  brain.eyes = null;
  brain.status = "loading";
  eyes.render(1, false, false, true);
  reads[0].finish();
  await settled();
  assert.ok(eyes.light, "the loading inset has a complete stand-in picture");
  brain.eyes = actual;
  brain.status = "running";
  eyes.beforeStep();
  assert.equal(life.light, null, "stand-in facet counts cannot reach the brain");
  eyes.render(1, false);
  reads[1].finish();
  await settled();
  eyes.beforeStep();
  assert.equal(life.light!.left.length, actual!.left.directions.length / 3);
});

function companion(life: Life): Life {
  return { ...life, body: { ...life.body, position: { x: 10, y: 0, z: 10 } }, light: null } as Life;
}

test("several flies refresh one per frame, the most overdue first, with equal rates and their own light", async () => {
  const { eyes, reads, life } = setup();
  const lives = [life, companion(life), companion(life)];
  eyes.company(lives.slice(1));
  const hidden: number[] = [];
  eyes.standIns = { hideFromEyes(index) { hidden.push(index); } };
  for (let frame = 0; frame < 180; frame++) {
    hidden.length = 0;
    const before = reads.length;
    eyes.render(1 / 60, false);
    assert.ok(reads.length - before <= 1, "only one GPU read per ordinary frame");
    if (reads.length > before) {
      assert.deepEqual(hidden, [frame % 3, -1], "oldest sight looks, excluding itself, then restores the stand-ins");
      reads.at(-1)!.finish();
      await settled();
    } else assert.deepEqual(hidden, [-1]);
  }
  assert.deepEqual([eyes.updates, eyes.companyUpdates(0), eyes.companyUpdates(1)], [60, 60, 60]);
  eyes.beforeStep();
  assert.ok(lives.every((l) => l.light?.left[0] === 1));
  assert.equal(new Set(lives.map((l) => l.light)).size, 3, "each brain receives its own facet picture");
});

test("while a ball comes the followed fly's eyes refresh every frame and nobody else's that frame; the others look again once it has passed", async () => {
  const { eyes, reads, life } = setup();
  eyes.company([companion(life), companion(life)]);
  // Everyone has a first picture, so nobody's is owed at once.
  for (let frame = 0; frame < 3; frame++) {
    const before = reads.length;
    eyes.render(1 / 60, false);
    for (const read of reads.slice(before)) read.finish();
    await settled();
  }
  const companions = () => [eyes.companyUpdates(0), eyes.companyUpdates(1)];
  const before = companions();
  for (let frame = 0; frame < 60; frame++) {
    const reading = reads.length;
    eyes.render(1 / 60, false, true);
    assert.equal(reads.length - reading, 1, "one refresh a frame, even while a ball comes");
    for (const read of reads.slice(reading)) read.finish();
    await settled();
  }
  assert.equal(eyes.updates, 61, "the followed fly sees an approaching threat every frame");
  assert.deepEqual(companions(), before, "the others wait while it comes");
  for (let frame = 0; frame < 60; frame++) {
    const reading = reads.length;
    eyes.render(1 / 60, false);
    assert.ok(reads.length - reading <= 1);
    for (const read of reads.slice(reading)) read.finish();
    await settled();
  }
  const after = companions();
  assert.ok(after[0] > before[0] && after[1] > before[1], "they take their turns again");
  assert.ok(Math.abs(after[0] - after[1]) <= 1);
});

test("dropping a companion waits for its pending read before disposing its target", async () => {
  const { eyes, life, reads } = setup();
  eyes.company([companion(life)]);
  eyes.render(1 / 60, false);
  reads[0].finish();
  await settled();
  eyes.render(1 / 60, false);
  let disposed = 0;
  reads[1].target.addEventListener("dispose", () => { disposed++; });
  eyes.company([]);
  assert.equal(disposed, 0, "the GPU still owns the target");
  reads[1].finish();
  await settled();
  assert.equal(disposed, 1);
  assert.equal(eyes.companyUpdates(0), 0);
});

test("where the place slows the others' eyes, theirs refresh that much less often, a fly at a time, and the followed fly's keep their full rate", async () => {
  const { eyes, reads, life } = setup(0.25);
  eyes.company([companion(life), companion(life)]);
  let drawn = 0;
  const followedAt: number[] = [];
  for (let frame = 0; frame < 600; frame++) {
    const before = reads.length;
    const own = eyes.updates;
    eyes.render(1 / 60, false);
    assert.ok(reads.length - before <= 1, "never more than one fly's eyes a frame");
    if (reads.length > before) drawn++;
    for (const read of reads.slice(before)) read.finish();
    await settled();
    if (eyes.updates > own) followedAt.push(frame);
  }
  // Ten seconds at 60 frames a second, Low eyes: the followed fly at 20 Hz, each of the others at 5.
  assert.ok(Math.abs(eyes.updates - 200) <= 1, `followed fly: ${eyes.updates} pictures`);
  for (const i of [0, 1]) assert.ok(Math.abs(eyes.companyUpdates(i) - 50) <= 2, `companion ${i}: ${eyes.companyUpdates(i)} pictures`);
  assert.ok(drawn <= 302, `the eyes drew in ${drawn} frames of 600, against every frame at the others' full rate`);
  const gaps = new Set(followedAt.slice(2).map((f, i) => f - followedAt[i + 1]));
  assert.deepEqual([...gaps], [3], "the followed fly's eyes never wait for the others'");
});

test("elsewhere the others' eyes keep the followed fly's rate", async () => {
  const { eyes, reads, life } = setup(1);
  eyes.company([companion(life), companion(life)]);
  for (let frame = 0; frame < 180; frame++) {
    const before = reads.length;
    eyes.render(1 / 60, false);
    for (const read of reads.slice(before)) read.finish();
    await settled();
  }
  assert.deepEqual([eyes.updates, eyes.companyUpdates(0), eyes.companyUpdates(1)], [60, 60, 60]);
});
