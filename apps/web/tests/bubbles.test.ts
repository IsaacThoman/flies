import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { createPicnic } from "@fly/world";
import { BUBBLE_TOUCH, Bubbles } from "../src/scene/bubbles.ts";

const camera = new THREE.PerspectiveCamera();
const sun = new THREE.Vector3(0, 1, 0);
const still = new THREE.Vector3();

test("low bubbles drift past the fly, some settle on the table as domes, and one that reaches the fly bursts on it and is felt", () => {
  const world = createPicnic();
  const bubbles = new Bubbles(new THREE.Group(), world);
  const fly = new THREE.Vector3(-8, 0.75, -8);
  let felt = 0;
  let settled = 0;
  for (let i = 0; i < 60 * 120; i++) {
    bubbles.update(i / 60, 1 / 60, camera, sun, still, fly);
    felt = Math.max(felt, bubbles.brushed);
    // A dome sits with its middle on the table: its looming point is at the surface.
    for (const l of bubbles.looming) if (l.position.y > -1 && l.position.y < 0.05 && l.r > 2) settled++;
  }
  assert.equal(felt, BUBBLE_TOUCH, "a bubble burst on the fly");
  assert.ok(settled > 0, "some settled on the table");
});

test("a bubble bursting on the fly is felt for that frame only", () => {
  const world = createPicnic();
  const bubbles = new Bubbles(new THREE.Group(), world);
  const fly = new THREE.Vector3(5000, 0, 5000);
  for (let i = 0; i < 600; i++) {
    bubbles.update(i / 60, 1 / 60, camera, sun, still, fly);
    assert.equal(bubbles.brushed, 0);
  }
});
