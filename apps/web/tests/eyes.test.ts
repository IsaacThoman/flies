import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import type { EyeMap } from "@fly/brain";
import { Eyes } from "../src/eyes/eyes.ts";
import type { Life } from "../src/life.ts";
import type { Stage } from "../src/stage.ts";

function setup() {
  const map: EyeMap = {
    left: { directions: new Float32Array([0, 1, 0]) },
    right: { directions: new Float32Array([0, 1, 0]) },
    acceptance: 0.1,
  };
  const life = {
    brain: { eyes: map, status: "running" },
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
    current: { camera: {} },
  } as unknown as Stage;
  return { eyes: new Eyes(stage, life), life, reads };
}

const settled = () => new Promise<void>((resolve) => setImmediate(resolve));

test("eyes keep the last complete light and allow only one asynchronous read in flight", async () => {
  const { eyes, life, reads } = setup();
  eyes.render(1 / 20, false, false);
  eyes.beforeStep();
  assert.equal(life.light, null, "unread pixels must not be sent as a dark picture");
  assert.equal(eyes.updates, 0);
  for (let i = 0; i < 120; i++) eyes.render(1 / 60, false, false, true);
  assert.equal(reads.length, 1, "a stalled GPU cannot queue more reads");
  reads[0].finish();
  await settled();
  eyes.beforeStep();
  assert.equal(life.light!.left[0], 1);
  assert.equal(life.light!.right[0], 1);
  assert.equal(eyes.updates, 1);
  eyes.render(1 / 60, false, false, true);
  assert.equal(reads.length, 2);
  assert.equal(life.light!.left[0], 1, "the brain keeps completed light during the next read");
  reads[1].finish();
  await settled();
});

test("an eye detail change waits for readback before disposing its render target", async () => {
  const { eyes, reads, life } = setup();
  eyes.render(1, false, false);
  let disposed = false;
  reads[0].target.addEventListener("dispose", () => { disposed = true; });
  eyes.detail = "high";
  eyes.render(1, false, false);
  assert.equal(disposed, false);
  reads[0].finish();
  await settled();
  eyes.render(1, false, false);
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
  eyes.render(1, false, false);
  reads[0].fail();
  await settled();
  assert.equal(warning.mock.calls.length, 1);
  assert.equal(eyes.updates, 0);
  eyes.render(1, false, true);
  assert.equal(reads.length, 1, "paused eyes do not start reads");
  eyes.render(1, false, false);
  reads[1].finish();
  await settled();
  assert.equal(eyes.updates, 1);
});
