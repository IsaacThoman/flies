// What every place must get right, whatever it looks like: the fly starts
// standing on its table, its food can be tasted where it lies, it has all
// five times of day, and the camera's shots of it work there.

import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { FlyBody, createIntent } from "@fly/body";
import { Pantry, World, createSurface } from "@fly/world";
import { CameraDirector, WALLPAPER } from "../src/camera.ts";
import { PLACES, nextPlace } from "../src/places/catalog.ts";
import { SCENES } from "../src/places/index.ts";
import { TIMES } from "../src/scene/light.ts";

/** cos 65°: the steepest surface the fly can stand on (packages/body, MAX_SLOPE). */
const STANDABLE = Math.cos((65 * Math.PI) / 180);

test("every place in the catalog has a scene of the same id, and they take turns round all of them", () => {
  for (const info of PLACES) assert.equal(SCENES[info.id].id, info.id);
  let id = PLACES[0].id;
  const seen = new Set<string>();
  for (let i = 0; i < PLACES.length; i++) {
    seen.add(id);
    id = nextPlace(id);
  }
  assert.equal(seen.size, PLACES.length);
  assert.equal(id, PLACES[0].id);
});

for (const info of PLACES) {
  const scene = SCENES[info.id];
  const place = scene.place;

  test(`${info.name}: the fly starts standing on the table, and stays there standing still`, () => {
    const world = new World(place);
    const { x, z, yaw } = place.start;
    assert.ok(world.onTable(x, z), "the start is over the table");
    assert.ok(world.surface(x, z, createSurface()).normal.y >= STANDABLE, "level enough to stand on");
    const body = new FlyBody(world, place.start);
    const intent = createIntent();
    for (let i = 0; i < 60; i++) body.step(intent, { air: { x: 0, y: 0, z: 0 }, threat: null, meal: null }, 1 / 60);
    assert.equal(body.mode, "standing");
    assert.ok(Math.hypot(body.position.x - x, body.position.z - z) < 1e-6 && body.yaw === yaw);
  });

  test(`${info.name}: its food lies on the table and can be tasted where it lies`, () => {
    const world = new World(place);
    const pantry = new Pantry(world, place.patches);
    for (const patch of place.patches) {
      assert.ok(world.onTable(patch.x, patch.z), `${patch.name} is over the table`);
      const y = world.heightAt(patch.x, patch.z);
      assert.ok(pantry.touching(patch.x, y, patch.z, 0.3), `${patch.name} can be tasted at ${patch.x}, ${patch.z}`);
    }
  });

  test(`${info.name}: it has light for every time of day, and the place's view is a direction`, () => {
    for (const time of TIMES) assert.ok(scene.palettes[time], time);
    assert.ok(Math.abs(Math.hypot(scene.camera.vista.x, scene.camera.vista.z) - 1) < 1e-6);
    assert.ok(place.ceiling > 0);
  });

  test(`${info.name}: the whole-place view and every wallpaper shot keep the camera out of everything, with the fly in the picture`, () => {
    const world = new World(place);
    const { x, z, yaw } = place.start;
    const body = { position: { x, y: world.heightAt(x, z), z }, velocity: { x: 0, y: 0, z: 0 }, yaw, mode: "standing" } as unknown as FlyBody;
    const director = new CameraDirector(world, 16 / 9, scene.camera);
    const check = (what: string) => {
      for (let t = 0; t < 10; t += 1 / 30) director.update(body, 1 / 30);
      const cam = director.camera.position;
      assert.ok(cam.y >= world.heightAt(cam.x, cam.z) + 0.5, `${what}: the camera is inside something at ${cam.x.toFixed(0)}, ${cam.y.toFixed(0)}, ${cam.z.toFixed(0)}`);
      const at = new THREE.Vector3(x, body.position.y + 0.75, z).project(director.camera);
      assert.ok(Math.abs(at.x) < 1 && Math.abs(at.y) < 1 && at.z < 1, `${what}: the fly is out of the picture (${at.x.toFixed(2)}, ${at.y.toFixed(2)})`);
    };
    director.setView("table");
    check("whole place");
    director.startWallpaper();
    director.wallpaperStyle = "follow";
    check("wallpaper, following");
    director.wallpaperStyle = "calm";
    for (let i = 0; i < WALLPAPER.length; i++) {
      check(`wallpaper shot ${i}`);
      director.startWallpaper();
    }
  });
}
