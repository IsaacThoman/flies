// Activity belongs only at an anatomically supported place; unplaced rates
// remain available to inspect without being assigned an invented location.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { REGIONS } from "@fly/brain";
import { NERVE_PARTS } from "@fly/fly";
import { GLOW_FALL, GLOW_RISE, NerveGlow, glowTarget } from "../src/nerves/glow.ts";
import { REGION_PARTS, UNLIT_PARTS, partRegions } from "../src/nerves/regions.ts";
import { XRAY_PIXELS, xrayForSize, xrayWanted } from "../src/nerves/xray.ts";
import { DEFAULT_SETTINGS } from "../src/settings.ts";

const SENSORY = /^(retina|antenna-smell|johnston|head-bristles|mouthparts|head-sensory-other|leg-sensory|thorax-sensory|abdomen-sensory|proprioceptors|bristles)/;
const MOTOR = /(motor|endocrine|efferent)/;

test("placed regions have unique anatomy; unplaced neurons light no anatomical part", () => {
  const parts = new Map(NERVE_PARTS.map((p) => [p.id, p]));
  const owner = new Map<string, string>();
  for (const region of REGIONS) {
    const ids = REGION_PARTS[region.id];
    assert.ok(ids, `${region.id} has a mapping`);
    assert.equal(ids.length === 0, region.id === "unplaced", `${region.id}: only unplaced lacks a location`);
    for (const id of ids) {
      assert.ok(parts.has(id), `${region.id}: no part ${id}`);
      assert.ok(!owner.has(id), `${id} lit by both ${owner.get(id)} and ${region.id}`);
      owner.set(id, region.id);
    }
  }
  for (const id of UNLIT_PARTS) {
    assert.ok(parts.has(id), `${id} is drawn`);
    assert.ok(!owner.has(id), `${id} has no assignable rate`);
  }
  for (const part of NERVE_PARTS) assert.ok(owner.has(part.id) || UNLIT_PARTS.some((id) => id === part.id), `${part.id} is accounted for`);
  assert.deepEqual(Object.keys(REGION_PARTS).sort(), REGIONS.map((r) => r.id).sort(), "no place for a region the brain doesn't report");
  assert.equal([...partRegions()].filter((r) => r < 0).length, UNLIT_PARTS.length);
});

test("unplaced activity is retained as a rate but cannot light the neck or another location", () => {
  const parts = new Float32Array(NERVE_PARTS.length), glow = new NerveGlow(parts);
  const rates = new Float32Array(REGIONS.length);
  const unplaced = REGIONS.findIndex((r) => r.id === "unplaced");
  rates[unplaced] = REGIONS[unplaced].fullHz;
  for (let i = 0; i < 120; i++) glow.update(rates, 1 / 60);
  assert.ok(glow.regions[unplaced] > 0.99, "the measured rate is preserved");
  assert.ok(parts.every((g) => g === 0), "unknown location never illuminates an anatomical place");
  parts[NERVE_PARTS.findIndex((p) => p.id === "connective-midline")] = 1;
  glow.update(rates, 0);
  assert.ok(parts.every((g) => g === 0), "a prior display value cannot leave the context lit");
});

test("a region is drawn on its own side, in its role's parts", () => {
  for (const region of REGIONS) {
    const parts = REGION_PARTS[region.id].map((id) => NERVE_PARTS.find((p) => p.id === id)!);
    const role = SENSORY.test(region.id) ? "sensory" : MOTOR.test(region.id) ? "motor" : "central";
    for (const part of parts) {
      assert.equal(part.role, role, `${region.id} on ${part.id}`);
      if (region.side === "left" || region.side === "right") assert.equal(part.side, region.side, `${region.id} on ${part.id}`);
    }
  }
});

test("a glow is the rate on its region's own full scale, and nothing else", () => {
  assert.equal(glowTarget(0, 5), 0);
  assert.equal(glowTarget(2.5, 5), 0.5);
  assert.equal(glowTarget(500, 5), 1);
  assert.equal(glowTarget(-1, 5), 0);
  assert.equal(glowTarget(Number.NaN, 5), 0);

  const parts = new Float32Array(NERVE_PARTS.length + 3);
  const glow = new NerveGlow(parts);
  const rates = new Float32Array(REGIONS.length);
  const lamina = REGIONS.findIndex((r) => r.id === "lamina-left");
  rates[lamina] = REGIONS[lamina].fullHz * 0.5;
  const step = (seconds: number) => {
    for (let t = 0; t < seconds - 1e-9; t += 1 / 60) glow.update(rates, 1 / 60);
  };
  step(GLOW_RISE);
  assert.ok(Math.abs(glow.regions[lamina] - 0.5 * (1 - Math.exp(-1))) < 0.03, `rises with ${GLOW_RISE} s: ${glow.regions[lamina]}`);
  step(1);
  assert.ok(Math.abs(glow.regions[lamina] - 0.5) < 1e-3);
  // Its parts, and only its parts, light.
  const regionOf = partRegions();
  for (let p = 0; p < NERVE_PARTS.length; p++) assert.equal(parts[p], regionOf[p] === lamina ? glow.regions[lamina] : 0, NERVE_PARTS[p].id);
  // A burst of 40 ms is still seen after a quarter of a second, and gone after two.
  rates.fill(0);
  step(2);
  rates[lamina] = REGIONS[lamina].fullHz;
  step(0.04);
  rates[lamina] = 0;
  const peak = glow.regions[lamina];
  step(0.25);
  assert.ok(glow.regions[lamina] > 0.5 * peak, `falls with ${GLOW_FALL} s: ${glow.regions[lamina]} of ${peak}`);
  step(2);
  assert.ok(glow.regions[lamina] < 0.01);
});

test("the X-ray: asked for by the setting or the View tool, and only where the fly is big enough to see inside", () => {
  assert.equal(xrayWanted("off", "play", true, false), false);
  assert.equal(xrayWanted("wallpaper", "play", false, false), false);
  assert.equal(xrayWanted("wallpaper", "play", true, false), true);
  assert.equal(xrayWanted("always", "settings", false, false), true, "behind the menus, the fly as it is");
  assert.equal(xrayWanted("off", "play", false, true), true, "View → Inside it");
  assert.equal(xrayWanted("off", "play", true, true), false, "the wallpaper goes by the setting");
  assert.equal(xrayWanted("always", "loading", true, false), false);
  assert.equal(xrayForSize(XRAY_PIXELS.from - 1), 0, "a smudge: the ordinary fly");
  assert.equal(xrayForSize(XRAY_PIXELS.full + 1), 1);
  assert.ok(xrayForSize((XRAY_PIXELS.from + XRAY_PIXELS.full) / 2) > 0.3);
  // The follow shot (about 170 pixels long) and closer show it all; the wide one (about 57) not at all.
  assert.equal(xrayForSize(170), 1);
  assert.equal(xrayForSize(57), 0);
  assert.equal(DEFAULT_SETTINGS.xray, "off");
  assert.equal(DEFAULT_SETTINGS.nerves, "wallpaper");
});

// As the fly's own probe does: the game's part of drawing the nervous system
// runs every frame on the TV's JavaScript, so it must allocate nothing.
test("the nervous system's per-frame work allocates nothing but boxed numbers, even without a JIT", () => {
  const probe = fileURLToPath(new URL("nerves-probe.ts", import.meta.url));
  const result = spawnSync(process.execPath, ["--no-opt", "--no-maglev", "--no-sparkplug", probe], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const { micros, numberSize, sizes } = JSON.parse(result.stdout) as { micros: number; numberSize: number; sizes: Record<string, string[]> };
  console.log(`  glow, X-ray and corners: ${micros.toFixed(0)} µs a frame in V8's interpreter (no JIT)`);
  const others = Object.entries(sizes).filter(([size]) => Number(size) !== numberSize);
  assert.deepEqual(others, [], `allocations other than ${numberSize}-byte numbers`);
});
