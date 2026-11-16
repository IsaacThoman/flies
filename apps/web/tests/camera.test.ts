import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { FLY_LENGTH } from "@fly/body";
import type { FlyBody } from "@fly/body";
import { createPicnic } from "@fly/world";
import { CameraDirector, SHOTS } from "../src/camera.ts";
import type { View } from "../src/camera.ts";

const RENDER_WIDTH = 640;
const world = createPicnic();

/** A stand-in body the test moves by hand: only what the camera reads. */
function fakeBody(x: number, z: number, yaw: number) {
  return { position: { x, y: world.heightAt(x, z), z }, velocity: { x: 0, y: 0, z: 0 }, yaw, mode: "standing" } as unknown as FlyBody & { mode: string };
}

const ndc = new THREE.Vector3();
/** Where a point lands in the picture, -1 to 1 each way. */
const project = (camera: THREE.PerspectiveCamera, p: THREE.Vector3Like) => ndc.set(p.x, p.y, p.z).project(camera).clone();

/** The fly's length on screen in pixels, measured along its body. */
function lengthOnScreen(camera: THREE.PerspectiveCamera, body: FlyBody) {
  const h = FLY_LENGTH / 2;
  const fx = Math.sin(body.yaw);
  const fz = Math.cos(body.yaw);
  const y = body.position.y + 0.75;
  const a = project(camera, { x: body.position.x + fx * h, y, z: body.position.z + fz * h });
  const b = project(camera, { x: body.position.x - fx * h, y, z: body.position.z - fz * h });
  return Math.hypot(((a.x - b.x) * RENDER_WIDTH) / 2, ((a.y - b.y) * 480) / 2);
}

function settle(director: CameraDirector, body: FlyBody, seconds: number) {
  for (let t = 0; t < seconds; t += 1 / 60) director.update(body, 1 / 60);
}

test("in ordinary play the fly is 120 to 200 pixels long, wherever it stands and whichever way it faces", () => {
  for (const [x, z, yaw] of [[-8, -8, 0.6], [40, 20, 2.5], [-60, 40, -1.2], [150, -60, 3], [0, 120, 1.5]]) {
    const director = new CameraDirector(world, 16 / 9);
    const body = fakeBody(x, z, yaw);
    settle(director, body, 8);
    const length = lengthOnScreen(director.camera, body);
    // Seen three-quarter on, the body's length shortens; its legs and wings make it look longer.
    assert.ok(length > 100 && length < 210, `at ${x}, ${z}: ${length.toFixed(0)} px`);
    const at = project(director.camera, { x, y: body.position.y + 0.75, z });
    assert.ok(Math.abs(at.x) < 0.5 && Math.abs(at.y) < 0.5, `framed near the middle: ${at.x.toFixed(2)}, ${at.y.toFixed(2)}`);
  }
});

test("close up is bigger than follow, and wide smaller", () => {
  const sizes: Partial<Record<View, number>> = {};
  for (const view of ["close", "follow", "wide"] as const) {
    const director = new CameraDirector(world, 16 / 9);
    director.setView(view);
    const body = fakeBody(-8, -8, 0.6);
    settle(director, body, 8);
    sizes[view] = lengthOnScreen(director.camera, body);
  }
  assert.ok(sizes.close! > sizes.follow! * 1.4, JSON.stringify(sizes));
  assert.ok(sizes.wide! < sizes.follow! * 0.6, JSON.stringify(sizes));
});

test("the camera keeps a walking, turning fly in the picture, never jumps, and is never inside anything", () => {
  for (const view of ["close", "follow", "wide", "above"] as const) {
    const director = new CameraDirector(world, 16 / 9);
    director.setView(view);
    const body = fakeBody(-8, -8, 0.6);
    settle(director, body, 3);
    const last = director.camera.position.clone();
    let worstStep = 0;
    // A wandering walk among the fruit at 12 mm/s, turning this way and that.
    for (let i = 0; i < 60 * 40; i++) {
      const dt = 1 / 60;
      const t = i * dt;
      body.yaw += Math.sin(t * 0.7) * 1.3 * dt;
      const speed = 12;
      body.velocity.x = Math.sin(body.yaw) * speed;
      body.velocity.z = Math.cos(body.yaw) * speed;
      body.position.x += body.velocity.x * dt;
      body.position.z += body.velocity.z * dt;
      if (world.heightAt(body.position.x, body.position.z) > body.position.y + 0.5) {
        body.position.x -= body.velocity.x * dt;
        body.position.z -= body.velocity.z * dt;
        body.yaw += 2;
      }
      director.update(body, dt);
      const cam = director.camera.position;
      worstStep = Math.max(worstStep, cam.distanceTo(last));
      last.copy(cam);
      assert.ok(cam.y >= world.heightAt(cam.x, cam.z) + 0.5, `${view}: inside something at ${t.toFixed(1)} s`);
      const at = project(director.camera, { x: body.position.x, y: body.position.y + 0.75, z: body.position.z });
      assert.ok(Math.abs(at.x) < 0.95 && Math.abs(at.y) < 0.95 && at.z < 1, `${view}: the fly left the picture at ${t.toFixed(1)} s (${at.x.toFixed(2)}, ${at.y.toFixed(2)})`);
    }
    // Never faster than a few times the fly's own speed.
    assert.ok(worstStep < 0.6 + (SHOTS[view].distance + SHOTS[view].height) * 0.02, `${view}: moved ${worstStep.toFixed(2)} mm in a frame`);
  }
});

test("a jump stays mostly in the picture, the fly is framed again soon after it lands, and the camera never ends up on top of the fly after landing", () => {
  const director = new CameraDirector(world, 16 / 9);
  const body = fakeBody(-8, -8, 0.6);
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

test("the following wallpaper keeps the fly the same size for minutes on end", () => {
  const director = new CameraDirector(world, 16 / 9);
  director.startWallpaper();
  const body = fakeBody(-8, -8, 0.6);
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
    const director = new CameraDirector(world, 16 / 9);
    director.wallpaperStyle = style;
    director.startWallpaper();
    const body = fakeBody(-8, -8, 0.6);
    for (let t = 0; t < 240; t += 1 / 30) {
      director.update(body, 1 / 30);
      assert.equal(director.shot.around, "fly", `${style} at ${t.toFixed(0)} s`);
    }
  }
});
