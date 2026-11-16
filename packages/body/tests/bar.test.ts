// The bar's promises to a fly: it can walk onto the coasters and over a
// fallen peanut, climb out of the cocktail onto the rim, and never reach the
// candle's flame; its food lies where it is drawn.

import assert from "node:assert/strict";
import { test } from "node:test";
import { BAR, BAR_PATCHES, BAR_SOLIDS, Pantry, createBar } from "@fly/world";
import { FlyBody, createIntent } from "../src/index.ts";
import type { Forces, Intent } from "../src/index.ts";

const DT = 1 / 60;
const still: Forces = { air: { x: 0, y: 0, z: 0 }, threat: null, meal: null };
const walk: Intent = { ...createIntent(), live: true, speed: 6, walking: true };
const solid = (name: string) => BAR_SOLIDS.find((s) => s.name === name)!;
const circle = (name: string) => solid(name).footprint as { x: number; z: number; r: number };

/** Walks for a while; the highest it got, and whether it ever left its feet. */
function stroll(body: FlyBody, seconds: number) {
  let peak = -Infinity;
  let fell = false;
  for (let t = 0; t < seconds; t += DT) {
    body.step(walk, still, DT);
    peak = Math.max(peak, body.position.y);
    fell ||= body.mode === "airborne";
  }
  return { peak, fell };
}

test("walking, it climbs onto a coaster over its bevelled edge", () => {
  const glass = circle("beer");
  const coaster = BAR_SOLIDS.filter((s) => s.name === "coaster").map((s) => s.footprint as { x: number; z: number; r: number }).find((c) => Math.hypot(c.x - glass.x, c.z - glass.z) < 10)!;
  // From the counter in front of the beer, facing it.
  const body = new FlyBody(createBar(), { x: coaster.x, z: coaster.z + coaster.r + 4, yaw: Math.PI });
  const { fell } = stroll(body, 2);
  assert.equal(fell, false, "never falls");
  assert.ok(Math.abs(body.position.y - 1.4) < 1e-6, `on the coaster at ${body.position.y}`);
});

test("walking, it climbs over a peanut that fell out of the bowl", () => {
  const nut = solid("peanut").footprint as { x: number; z: number };
  const body = new FlyBody(createBar(), { x: nut.x - 12, z: nut.z, yaw: Math.PI / 2 });
  const { peak } = stroll(body, 4);
  assert.ok(peak > 2.5, `reached ${peak.toFixed(2)} mm`);
  assert.ok(body.position.x > nut.x + 3, "and on past it");
});

test("a fly in the cocktail walks up out of the drink onto the rim", () => {
  const glass = circle("cocktail");
  const well = (solid("cocktail").top as { well: number }).well;
  // In the drink, facing out across it, away from the ice and the lime.
  const body = new FlyBody(createBar(), { x: glass.x + 6, z: glass.z - 22, yaw: Math.PI });
  assert.equal(body.position.y, well);
  const { peak } = stroll(body, 4);
  assert.ok(peak > well + 2.8, `up the meniscus to the rim: ${peak.toFixed(2)} mm`);
  assert.ok(Math.hypot(body.position.x - glass.x, body.position.z - glass.z) > glass.r * 0.9, "out of the drink");
});

test("the candle's flame is out of reach: the lantern's chimney stands round it, capped above it", () => {
  const world = createBar();
  const lantern = circle("lantern");
  const cap = solid("lantern").top as { base: number };
  // The flame stands about 70 mm up inside; the fly can only ever be on the cap, well above it.
  assert.ok(world.heightAt(lantern.x, lantern.z) >= cap.base);
  assert.ok(cap.base > 120);
  // Walking at it, it stops at the glass.
  const body = new FlyBody(world, { x: lantern.x + lantern.r + 5, z: lantern.z, yaw: -Math.PI / 2 });
  stroll(body, 3);
  assert.equal(body.position.y, 0);
  assert.ok(Math.hypot(body.position.x - lantern.x, body.position.z - lantern.z) > lantern.r - 0.5);
});

test("the bar's food lies where it is drawn: the drink in the glass, the head on the beer, the lime on its peel", () => {
  const world = createBar();
  const pantry = new Pantry(world, BAR.patches);
  const at = (name: string) => pantry.foods.find((f) => f.name === name)!;
  assert.equal(at("cocktail").y, (solid("cocktail").top as { well: number }).well);
  assert.equal(at("cocktail").pool, true);
  const head = solid("beer").top as { base: number; height: number };
  assert.ok(Math.abs(at("beer foam").y - (head.base + head.height)) < 1e-9);
  const lime = solid("lime").top as { base: number; height: number };
  assert.ok(Math.abs(at("lime").y - (lime.base + lime.height)) < 1e-9);
  // The spilt beer lies on the counter, and rings spread on it.
  const beer = BAR_PATCHES.find((p) => p.name === "beer")!;
  assert.equal(world.heightAt(beer.x, beer.z), 0);
  assert.equal(beer.pool, true);
});
