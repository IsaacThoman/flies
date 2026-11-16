import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { createPicnic, createSurface } from "@fly/world";
import { BUBBLE_TOUCH, Bubbles } from "../src/scene/bubbles.ts";

const camera = new THREE.PerspectiveCamera();
const sun = new THREE.Vector3(0, 1, 0);
const still = new THREE.Vector3();

test("bubbles keep drifting at the picnic without settling, and few low ones end on the table", (t) => {
  const world = createPicnic();
  const bubbles = new Bubbles(new THREE.Group(), world);
  const fly = new THREE.Vector3(-8, 0.75, -8);
  const surface = createSurface();
  const previous = Array.from({ length: 4 }, () => new THREE.Vector3(Infinity, 0, 0));
  const visible = new Array<boolean>(4).fill(false);
  const tracking = new Array<boolean>(4).fill(false);
  const passedFly = new Array<boolean>(4).fill(false);
  let felt = 0;
  let passed = 0;
  let tablePops = 0;
  let completed = 0;
  for (let i = 0; i < 60 * 600; i++) {
    bubbles.update(i / 60, 1 / 60, camera, sun, still, fly);
    felt = Math.max(felt, bubbles.brushed);
    let airborne = 0;
    for (let k = 0; k < bubbles.looming.length; k++) {
      const l = bubbles.looming[k];
      const p = l.position;
      world.surface(p.x, p.z, surface);
      const inAir = p.y > -1000;
      if (inAir) {
        airborne++;
        assert.ok(p.y - l.r >= surface.y, `bubble ${l.id} intersects a surface at ${i / 60}s`);
      }
      if (k >= 4) continue;
      const burst = visible[k] && !inAir;
      const renewed = i > 0 && inAir && (!visible[k] || p.x < previous[k].x);
      // Count complete lives only, excluding the initial bubbles already partway along their path.
      if (tracking[k] && (burst || renewed)) {
        completed++;
        if (passedFly[k]) passed++;
        if (burst) {
          const last = previous[k];
          world.surface(last.x, last.z, surface);
          // The last in-air position is at most one frame's vertical bob above the burst.
          if (surface.onTable && surface.solid === -1 && last.y - l.r < surface.y + 0.5 + 0.6 / 60) tablePops++;
        }
        tracking[k] = false;
      }
      if (renewed) {
        tracking[k] = true;
        passedFly[k] = false;
      }
      if (inAir && previous[k].x <= fly.x && p.x > fly.x) passedFly[k] = true;
      if (inAir) previous[k].copy(p);
      visible[k] = inAir;
    }
    assert.ok(airborne > 0, "there are always bubbles in the air");
  }
  assert.equal(felt, BUBBLE_TOUCH, "a bubble burst on the fly");
  assert.ok(completed > 300, "low bubbles keep coming throughout ten minutes");
  assert.ok(passed > completed / 2, "most low bubbles drift past the fly");
  assert.ok(tablePops > 0, "an occasional low bubble dips onto the table and pops");
  const share = tablePops / completed;
  t.diagnostic(`${completed} low bubbles: ${passed} passed the fly, ${tablePops} popped on the table (${(share * 100).toFixed(1)}%)`);
  assert.ok(share <= 1 / 6, "at most one low bubble in six ends on the table rather than passing the fly");
});

test("a bubble bursting on the fly is felt for that frame only", () => {
  const world = createPicnic();
  const bubbles = new Bubbles(new THREE.Group(), world);
  const fly = new THREE.Vector3(5000, 0, 5000);
  bubbles.update(0, 0, camera, sun, still, fly);
  const bubble = bubbles.looming.find((l) => l.position.y > 0)!;
  fly.copy(bubble.position);
  bubbles.update(0, 0, camera, sun, still, fly);
  assert.equal(bubbles.brushed, BUBBLE_TOUCH, "the bubble burst where it touched the fly");
  assert.ok(bubble.position.y < -1000, "a popped bubble cannot loom at the fly");
  fly.set(5000, 0, 5000);
  bubbles.update(1 / 60, 1 / 60, camera, sun, still, fly);
  assert.equal(bubbles.brushed, 0);
});
