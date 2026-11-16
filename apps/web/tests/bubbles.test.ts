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
  const previousX = new Float64Array(4).fill(Infinity);
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
      const pop = bubbles.popped.find((pop) => pop.x === p.x && pop.z === p.z);
      const renewed = i > 0 && inAir && (!visible[k] || p.x < previousX[k]);
      // Count complete lives only, excluding the initial bubbles already partway along their path.
      if (tracking[k] && (pop || renewed)) {
        completed++;
        if (passedFly[k]) passed++;
        if (pop && surface.onTable && surface.solid === -1 && pop.y - l.r < surface.y + 0.5) tablePops++;
        tracking[k] = false;
      }
      if (renewed) {
        tracking[k] = true;
        passedFly[k] = false;
      }
      if (inAir && previousX[k] <= fly.x && p.x > fly.x) passedFly[k] = true;
      previousX[k] = p.x;
      visible[k] = inAir;
    }
    assert.ok(airborne > 0, "there are always bubbles in the air");
    const matrices = bubbles.mesh.instanceMatrix.array;
    for (let o = 0; o < matrices.length; o += 16) {
      const x = matrices[o + 12];
      const y = matrices[o + 13];
      const z = matrices[o + 14];
      if (y < -1000) continue;
      if (y - matrices[o + 5] >= world.heightAt(x, z)) continue;
      // The rendered burst can overlap for its contact frame, but must vanish on the next.
      assert.ok(bubbles.popped.some((p) => Math.abs(p.x - x) < 0.001 && Math.abs(p.z - z) < 0.001), "only a bubble bursting this frame may intersect a surface");
    }
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
  assert.equal(bubbles.brushed, BUBBLE_TOUCH);
  assert.ok(bubbles.popped.some((p) => p.equals(fly)), "the bubble burst where it touched the fly");
  assert.ok(bubble.position.y < -1000, "a popped bubble cannot loom at the fly");
  fly.set(5000, 0, 5000);
  bubbles.update(1 / 60, 1 / 60, camera, sun, still, fly);
  assert.equal(bubbles.brushed, 0);
});
