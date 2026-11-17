import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { KITCHEN, World } from "@fly/world";
import { buildSet } from "../src/places/kitchen/set.ts";
import { buildBackdrop } from "../src/places/kitchen/backdrop.ts";
import { PALETTES } from "../src/places/kitchen/palettes.ts";
import { Daylight } from "../src/scene/light.ts";
import { WeatherNow } from "../src/scene/weather.ts";
import { disposeAll } from "../src/scene/build.ts";

test("the bowl's drawn inner slope meets its felt surface beside the banana", () => {
  const set = buildSet();
  const world = new World(KITCHEN);
  const ray = new THREE.Raycaster();
  set.group.updateMatrixWorld(true);
  for (const [x, z] of [
    [-76.41666666666669, -59.95537044259771],
    [-76.14910950675657, -59.82629426003556],
  ]) {
    ray.set(new THREE.Vector3(x, 40.5, z), new THREE.Vector3(0, -1, 0));
    const drawn = ray.intersectObject(set.group, true)[0];
    assert.ok(drawn);
    assert.ok(Math.abs(drawn.point.y - world.heightAt(x, z, 40.5)) < 0.1);
  }
  disposeAll(set.group);
  for (const object of set.seen) disposeAll(object);
});

test("the kitchen shows snowfall outside and heavier rain deepens the window's haze", () => {
  const backdrop = buildBackdrop();
  const camera = new THREE.PerspectiveCamera();
  const light = new Daylight("noon", PALETTES, 0.45);
  const weather = new WeatherNow();
  const flakes = backdrop.scene.children.find((o) => o instanceof THREE.Mesh && o.geometry instanceof THREE.InstancedBufferGeometry);
  assert.ok(flakes instanceof THREE.Mesh);
  weather.choose("rain", true);
  light.update(0, weather);
  backdrop.update(0, camera, light, weather);
  const rainFar = (backdrop.scene.fog as THREE.Fog).far;
  assert.equal(flakes.visible, false);
  weather.choose("heavyRain", true);
  light.update(0, weather);
  backdrop.update(1, camera, light, weather);
  assert.ok((backdrop.scene.fog as THREE.Fog).far < rainFar);
  for (const kind of ["snow", "sleet", "clear"] as const) {
    weather.choose(kind, true);
    light.update(0, weather);
    backdrop.update(2, camera, light, weather);
    assert.equal(flakes.visible, kind !== "clear");
  }
  disposeAll(backdrop.scene);
});

test("kitchen set merges mixed glass geometry and keeps its meshes finite and frozen", () => {
  const set = buildSet();
  assert.equal(set.group.children.length, 2);
  for (const object of set.group.children) {
    assert.ok(object instanceof THREE.Mesh);
    assert.equal(object.matrixAutoUpdate, false);
    const positions = object.geometry.getAttribute("position");
    assert.ok(positions.count > 0);
    for (const n of positions.array) assert.ok(Number.isFinite(n));
  }
  assert.ok(set.seen.length > 0);
  disposeAll(set.group);
  for (const object of set.seen) disposeAll(object);
});

test("the coarse eyes see the jar body, the tumbler's wall and raised caddy lid", () => {
  const set = buildSet();
  const ray = new THREE.Raycaster(
    new THREE.Vector3(354, 40, 200),
    new THREE.Vector3(0, 0, -1),
  );
  const jar = ray.intersectObjects(set.seen, false)[0];
  assert.ok(
    jar && Math.abs(jar.distance - 52) < 0.1,
    "the jar's lower body blocks the eye before the wall",
  );
  ray.set(new THREE.Vector3(186, 40, 100), new THREE.Vector3(0, 0, -1));
  const cup = ray.intersectObjects(set.seen, false)[0];
  assert.ok(
    cup && Math.abs(cup.distance - 125) < 0.1,
    "the tumbler's wall is visible from beside it",
  );
  ray.set(new THREE.Vector3(-369, 250, -170), new THREE.Vector3(0, -1, 0));
  const lid = ray.intersectObjects(set.seen, false)[0];
  assert.ok(
    lid && lid.point.y > 180 && lid.point.y < 190,
    "the raised lid hides the compost from above",
  );
  ray.set(new THREE.Vector3(0, 30, 250), new THREE.Vector3(0, -1, 0));
  assert.equal(ray.intersectObjects(set.seen, false)[0]?.point.y, 0, "the counter is visible under the fly");
  ray.set(new THREE.Vector3(-240, 400, -250), new THREE.Vector3(0, 0, -1));
  assert.equal(ray.intersectObjects(set.seen, false).length, 0, "the glazed opening shows the sky to the eyes");
  ray.set(new THREE.Vector3(-80, 400, -250), new THREE.Vector3(0, 0, -1));
  assert.ok(ray.intersectObjects(set.seen, false).length > 0, "the window mullion remains visible");
  disposeAll(set.group);
  for (const object of set.seen) disposeAll(object);
});
