import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { RESTAURANT, World, createPicnic } from "@fly/world";
import { picnic } from "../src/places/picnic/index.ts";
import type { SceneCamera } from "../src/places/types.ts";
import { CameraDirector, WALLPAPER } from "../src/camera.ts";
import { fieldOfView } from "../src/display.ts";
import { fakeBody, lengthOnScreen, middleOf, project, settle } from "./camera-probe.ts";

const world = createPicnic();

test("in the screensaver a jump stays mostly in the picture, the fly is framed again soon after it lands, and the camera never ends up on top of the fly after landing", () => {
  const director = new CameraDirector(world, 16 / 9, picnic.camera);
  director.startWallpaper();
  const body = fakeBody(world, -8, -8, 0.6);
  settle(director, body, 3);
  body.mode = "airborne";
  body.velocity.x = 250;
  body.velocity.y = 500;
  body.velocity.z = 120;
  let inPicture = 0;
  let frames = 0;
  let landedFor = 0;
  for (let i = 0; i < 60 * 4; i++) {
    const dt = 1 / 60;
    if (body.mode === "airborne") {
      body.velocity.y -= 9810 * dt * 0.4;
      body.position.x += body.velocity.x * dt;
      body.position.y += body.velocity.y * dt;
      body.position.z += body.velocity.z * dt;
      const floor = world.heightAt(body.position.x, body.position.z);
      if (body.position.y <= floor) {
        body.position.y = floor;
        body.velocity.x = body.velocity.y = body.velocity.z = 0;
        body.mode = "standing";
      }
      const at = project(director.camera, body.position);
      frames++;
      if (Math.abs(at.x) < 1 && Math.abs(at.y) < 1 && at.z < 1) inPicture++;
    }
    director.update(body, dt);
    if (body.mode === "standing") {
      landedFor += dt;
      const at = project(director.camera, { x: body.position.x, y: body.position.y + 0.75, z: body.position.z });
      if (landedFor > 1.5) assert.ok(Math.abs(at.x) < 0.5 && Math.abs(at.y) < 0.5, `framed again after landing: ${at.x.toFixed(2)}, ${at.y.toFixed(2)}`);
    }
    const gap = director.camera.position.distanceTo(new THREE.Vector3(body.position.x, body.position.y + 0.75, body.position.z));
    assert.ok(gap > 6, `${gap.toFixed(1)} mm from the fly at ${(i / 60).toFixed(2)} s`);
  }
  assert.equal(body.mode, "standing");
  // A hop is over in a quarter of a second; the camera whips round after it but can't be there at once.
  assert.ok(inPicture / frames > 0.6, `in the picture ${inPicture} of ${frames} frames in the air`);
});

test("in the screensaver a flight of a couple of seconds stays near the middle of the picture, and the fly stays big enough to see", () => {
  const director = new CameraDirector(world, 16 / 9, picnic.camera);
  director.startWallpaper();
  const body = fakeBody(world, -100, -60, 0.6);
  settle(director, body, 3);
  body.mode = "airborne";
  // The tarsal reflex's flight: about 0.28 m/s along its heading, a little up.
  body.velocity.x = Math.sin(body.yaw) * 270;
  body.velocity.z = Math.cos(body.yaw) * 270;
  body.velocity.y = 20;
  let worst = 0;
  let smallest = Infinity;
  for (let i = 0; i < 60 * 2; i++) {
    const dt = 1 / 60;
    body.position.x += body.velocity.x * dt;
    body.position.y += body.velocity.y * dt;
    body.position.z += body.velocity.z * dt;
    director.update(body, dt);
    // Once it has been up long enough to be a flight, not a hop.
    if (i < 45) continue;
    const at = project(director.camera, { x: body.position.x, y: body.position.y + 0.75, z: body.position.z });
    worst = Math.max(worst, Math.abs(at.x), Math.abs(at.y));
    smallest = Math.min(smallest, lengthOnScreen(director.camera, body));
  }
  assert.ok(worst < 0.5, `as far as ${worst.toFixed(2)} from the middle`);
  // Trailing behind it on springs alone, the camera lets it shrink to a speck of 2 px.
  assert.ok(smallest > 8, `${smallest.toFixed(0)} px long`);
});

test("the following wallpaper keeps the fly the same size for minutes on end", () => {
  const director = new CameraDirector(world, 16 / 9, picnic.camera);
  director.startWallpaper();
  const body = fakeBody(world, -8, -8, 0.6);
  settle(director, body, 8);
  const first = lengthOnScreen(director.camera, body);
  for (let minute = 0; minute < 3; minute++) {
    settle(director, body, 20);
    const length = lengthOnScreen(director.camera, body);
    assert.ok(Math.abs(length - first) < first * 0.05, `${first.toFixed(0)} px, then ${length.toFixed(0)} px`);
  }
});

test("the wallpaper's round of shots never leaves the fly for the whole table", () => {
  for (const style of ["calm", "lively"] as const) {
    const director = new CameraDirector(world, 16 / 9, picnic.camera);
    director.wallpaperStyle = style;
    director.startWallpaper();
    const body = fakeBody(world, -8, -8, 0.6);
    for (let t = 0; t < 240; t += 1 / 30) {
      director.update(body, 1 / 30);
      assert.equal(director.shot.around, "fly", `${style} at ${t.toFixed(0)} s`);
    }
  }
});

test("the field of view is the TV's at 16:9 and wider, and opens up on a narrower screen; the whole table keeps its width", () => {
  assert.equal(fieldOfView(30, 16 / 9), 30);
  assert.equal(fieldOfView(30, 21 / 9), 30, "wider: the same height, more to the sides");
  let last = 30;
  for (const aspect of [1.6, 4 / 3, 1, 3 / 4, 9 / 19.5]) {
    const fov = fieldOfView(30, aspect);
    assert.ok(fov > last, `${aspect.toFixed(2)}: ${fov.toFixed(1)}°`);
    last = fov;
  }
  // Keeping the width: the horizontal field is the TV's.
  const across = (fov: number, aspect: number) => Math.atan(Math.tan((fov * Math.PI) / 360) * aspect);
  assert.ok(Math.abs(across(fieldOfView(40, 0.5, 1), 0.5) - across(40, 16 / 9)) < 1e-9);
});

test("the title's room for the fly comes from its layout: on a tall screen, between the name and the menu", () => {
  // As the game has it: the title is the screensaver's camera, with the title's own shot.
  const director = new CameraDirector(world, 9 / 19.5, picnic.camera);
  director.startWallpaper();
  director.title = true;
  director.room.across = 0;
  director.room.low = -0.35;
  const body = fakeBody(world, -8, -8, 0.6);
  settle(director, body, 10);
  const at = project(director.camera, { x: body.position.x, y: body.position.y + 0.75, z: body.position.z });
  assert.ok(Math.abs(at.x) < 0.1 && Math.abs(at.y - 0.35) < 0.12, `${at.x.toFixed(2)}, ${at.y.toFixed(2)}`);
});

test("the title's menu fading into the wallpaper eases the fly from beside the menu to the middle, as play's wallpaper has it, and back when the menu returns", () => {
  for (const style of ["follow", "calm"] as const) {
    // As the game has it: the title is the wallpaper's camera, with the title's own shot.
    const director = new CameraDirector(world, 16 / 9, picnic.camera);
    director.wallpaperStyle = style;
    director.startWallpaper();
    director.title = true;
    const body = fakeBody(world, -8, -8, 0.6);
    settle(director, body, 10);
    const across = () => project(director.camera, middleOf(body)).x;
    assert.ok(Math.abs(across() - director.room.across) < 0.1, `${style}, the menu showing: ${across().toFixed(2)}`);

    // The menu fades, and the wallpaper starts as it does in play.
    director.startWallpaper();
    director.title = false;
    let worst = 0;
    let last = across();
    for (let t = 0; t < 8; t += 1 / 60) {
      director.update(body, 1 / 60);
      worst = Math.max(worst, Math.abs(across() - last));
      last = across();
    }
    // Over seconds, as the menu fades: the aim's own quick spring alone would take it there in a few tenths of one.
    assert.ok(worst < 0.006, `${style}: eased, not cut (${worst.toFixed(3)} of the half-width in a frame)`);
    const played = new CameraDirector(world, 16 / 9, picnic.camera);
    played.wallpaperStyle = style;
    played.startWallpaper();
    settle(played, body, 18);
    const centred = Math.abs(project(played.camera, middleOf(body)).x) + 0.1;
    assert.ok(Math.abs(across()) < centred, `${style}, the menu faded: ${across().toFixed(2)}, as play's wallpaper (${(centred - 0.1).toFixed(2)})`);
    assert.ok(style === "follow" ? director.shot === played.shot : WALLPAPER.includes(director.shot), `${style}: one of play's wallpaper's shots`);

    director.title = true;
    settle(director, body, 10);
    assert.ok(Math.abs(across() - director.room.across) < 0.1, `${style}, the menu back: ${across().toFixed(2)}`);
  }
});

/** The restaurant, filmed as a room: the whole of it from about a corner. */
const room = new World(RESTAURANT);
const ROOM_CAMERA: SceneCamera = { whole: { around: "table", distance: 3000, height: 1300, side: 0.6, low: 0, fov: 50, settle: 1.6 }, vista: { x: 0, z: 1 } };

test("in the restaurant every screensaver shot keeps the camera out of everything, with the fly in the picture", () => {
  const { x, z, yaw, y } = RESTAURANT.start;
  const body = fakeBody(room, x, z, yaw, y!);
  const director = new CameraDirector(room, 16 / 9, ROOM_CAMERA);
  const check = (what: string) => {
    settle(director, body, 6);
    const eye = director.camera.position;
    assert.ok(room.solidAt(eye.x, eye.y, eye.z) < 0 && eye.y >= room.heightAt(eye.x, eye.z, eye.y) + 0.5, `${what}: inside something`);
    const at = project(director.camera, { x, y: body.position.y + 0.75, z });
    assert.ok(Math.abs(at.x) < 1 && Math.abs(at.y) < 1 && at.z < 1, `${what}: the fly is out of the picture`);
  };
  director.wallpaperStyle = "calm";
  director.startWallpaper();
  for (let i = 0; i < 5; i++) {
    check(`wallpaper shot ${i}`);
    director.startWallpaper();
  }
});
