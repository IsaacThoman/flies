import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { FLY_LENGTH } from "@fly/body";
import type { FlyBody } from "@fly/body";
import { DINING_ROOM, RESTAURANT, TABLES, TABLE_TOPS, World, ZINC_BAR, createPicnic } from "@fly/world";
import { picnic } from "../src/places/picnic/index.ts";
import { SCENES } from "../src/places/index.ts";
import type { SceneCamera } from "../src/places/types.ts";
import { CameraDirector, HAND_HOLD, NARROW_KEEP, NEAREST, SHOTS, fieldOfView } from "../src/camera.ts";
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
    const director = new CameraDirector(world, 16 / 9, picnic.camera);
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
    const director = new CameraDirector(world, 16 / 9, picnic.camera);
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
    const director = new CameraDirector(world, 16 / 9, picnic.camera);
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
  const director = new CameraDirector(world, 16 / 9, picnic.camera);
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

test("a flight of a couple of seconds stays near the middle of the picture, and the fly stays big enough to see", () => {
  const director = new CameraDirector(world, 16 / 9, picnic.camera);
  const body = fakeBody(-100, -60, 0.6);
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
    const director = new CameraDirector(world, 16 / 9, picnic.camera);
    director.wallpaperStyle = style;
    director.startWallpaper();
    const body = fakeBody(-8, -8, 0.6);
    for (let t = 0; t < 240; t += 1 / 30) {
      director.update(body, 1 / 30);
      assert.equal(director.shot.around, "fly", `${style} at ${t.toFixed(0)} s`);
    }
  }
});

/** The fly's length on screen as a share of the screen's height, at whatever shape. */
function shareOfHeight(camera: THREE.PerspectiveCamera, body: FlyBody) {
  const h = FLY_LENGTH / 2;
  const fx = Math.sin(body.yaw);
  const fz = Math.cos(body.yaw);
  const y = body.position.y + 0.75;
  const a = project(camera, { x: body.position.x + fx * h, y, z: body.position.z + fz * h });
  const b = project(camera, { x: body.position.x - fx * h, y, z: body.position.z - fz * h });
  return Math.hypot(((a.x - b.x) / 2) * camera.aspect, (a.y - b.y) / 2);
}

const ASPECTS = { "an ultrawide": 21 / 9, "the TV": 16 / 9, "a 4:3 tablet": 4 / 3, "a tablet upright": 3 / 4, "a phone upright": 9 / 19.5, "a third of a tablet": 0.31 } as const;

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

test("at every shape the fly in each view is about as big as on the TV, and framed near the middle", () => {
  const body = fakeBody(-8, -8, 0.6);
  const tv: Partial<Record<View, number>> = {};
  for (const view of ["close", "follow", "wide"] as const) {
    const director = new CameraDirector(world, 16 / 9, picnic.camera);
    director.setView(view);
    settle(director, body, 8);
    tv[view] = shareOfHeight(director.camera, body);
  }
  for (const [name, aspect] of Object.entries(ASPECTS)) {
    for (const view of ["close", "follow", "wide"] as const) {
      const director = new CameraDirector(world, aspect, picnic.camera);
      director.setView(view);
      settle(director, body, 8);
      const share = shareOfHeight(director.camera, body);
      // As big for the screen: its length against the screen's height, and, on a narrower one, its width.
      const across = (share / aspect) * (16 / 9);
      if (aspect >= 16 / 9) assert.ok(Math.abs(share / tv[view]! - 1) < 0.1, `${name}, ${view}: ${share.toFixed(3)} of the height, ${tv[view]!.toFixed(3)} on the TV`);
      else assert.ok(across > tv[view]! * 0.95 && across < tv[view]! * Math.pow((16 / 9) / aspect, 1 - NARROW_KEEP) * 1.15, `${name}, ${view}: ${across.toFixed(3)} of the width against ${tv[view]!.toFixed(3)}`);
      assert.ok(share * Math.max(1, 1 / aspect) < 0.9, `${name}, ${view}: the fly fits across the screen`);
      const at = project(director.camera, { x: body.position.x, y: body.position.y + 0.75, z: body.position.z });
      assert.ok(Math.abs(at.x) < 0.5 && Math.abs(at.y) < 0.55, `${name}, ${view}: framed near the middle: ${at.x.toFixed(2)}, ${at.y.toFixed(2)}`);
    }
  }
});

test("on a phone held upright the camera keeps a walking, turning fly in the picture", () => {
  for (const view of ["close", "follow", "wide"] as const) {
    const director = new CameraDirector(world, 9 / 19.5, picnic.camera);
    director.setView(view);
    const body = fakeBody(-8, -8, 0.6);
    settle(director, body, 3);
    for (let i = 0; i < 60 * 30; i++) {
      const dt = 1 / 60;
      body.yaw += Math.sin(i * dt * 0.7) * 1.3 * dt;
      body.velocity.x = Math.sin(body.yaw) * 12;
      body.velocity.z = Math.cos(body.yaw) * 12;
      body.position.x += body.velocity.x * dt;
      body.position.z += body.velocity.z * dt;
      if (world.heightAt(body.position.x, body.position.z) > body.position.y + 0.5) {
        body.position.x -= body.velocity.x * dt;
        body.position.z -= body.velocity.z * dt;
        body.yaw += 2;
      }
      director.update(body, dt);
      const at = project(director.camera, { x: body.position.x, y: body.position.y + 0.75, z: body.position.z });
      assert.ok(Math.abs(at.x) < 0.95 && Math.abs(at.y) < 0.95 && at.z < 1, `${view}: the fly left the picture at ${(i * dt).toFixed(1)} s (${at.x.toFixed(2)}, ${at.y.toFixed(2)})`);
    }
  }
});

test("the title's room for the fly comes from its layout: on a tall screen, between the name and the menu", () => {
  const director = new CameraDirector(world, 9 / 19.5, picnic.camera);
  director.title = true;
  director.room.across = 0;
  director.room.low = -0.35;
  const body = fakeBody(-8, -8, 0.6);
  settle(director, body, 10);
  const at = project(director.camera, { x: body.position.x, y: body.position.y + 0.75, z: body.position.z });
  assert.ok(Math.abs(at.x) < 0.1 && Math.abs(at.y - 0.35) < 0.12, `${at.x.toFixed(2)}, ${at.y.toFixed(2)}`);
});

const middleOf = (body: FlyBody) => ({ x: body.position.x, y: body.position.y + 0.75, z: body.position.z });

/** Runs the camera on, watching that it never jumps (mm in a frame at most) and keeps the fly in the picture. */
function watch(director: CameraDirector, body: FlyBody, seconds: number) {
  let worst = 0;
  const last = director.camera.position.clone();
  for (let t = 0; t < seconds; t += 1 / 60) {
    director.update(body, 1 / 60);
    worst = Math.max(worst, director.camera.position.distanceTo(last));
    last.copy(director.camera.position);
    const at = project(director.camera, middleOf(body));
    assert.ok(Math.abs(at.x) < 0.9 && Math.abs(at.y) < 0.9 && at.z < 1, `the fly in the picture: ${at.x.toFixed(2)}, ${at.y.toFixed(2)}`);
  }
  return worst;
}

test("turned by hand the camera goes round the fly at once, stays where it was put for a while after, then the cameraman takes it on from there, smoothly", () => {
  const director = new CameraDirector(world, 16 / 9, picnic.camera);
  const body = fakeBody(-8, -8, 0.6);
  settle(director, body, 6);
  const before = director.camera.position.clone();
  director.hand.held = true;
  director.turnBy(1.2, 0.3);
  director.update(body, 1 / 60);
  const turned = director.camera.position.clone();
  assert.ok(turned.distanceTo(before) > 4, `it went round at once: ${turned.distanceTo(before).toFixed(1)} mm`);
  watch(director, body, 2);
  assert.ok(director.camera.position.distanceTo(turned) < 0.3, "held, it stays put");
  director.hand.held = false;
  watch(director, body, HAND_HOLD - 0.5);
  assert.ok(director.camera.position.distanceTo(turned) < 0.3, "let go, it stays a while");
  assert.ok(director.handled);
  const worst = watch(director, body, 10);
  assert.ok(!director.handled, "and then it is the cameraman's again");
  // Where it likes to be, give or take one of the placings it tries.
  assert.ok(director.camera.position.distanceTo(before) < 0.32 * director.reach, `back where it likes to be: ${director.camera.position.distanceTo(before).toFixed(2)} mm off`);
  assert.ok(worst < 0.5, `smoothly: ${worst.toFixed(2)} mm in a frame at most`);
});

test("put somewhere by a mouse, the camera orbits freely: it stays at that angle and height round the fly however the fly turns, and zooms straight in, until it is handed back or a view is chosen", () => {
  const director = new CameraDirector(world, 16 / 9, picnic.camera);
  const body = fakeBody(-8, -8, 0.6);
  settle(director, body, 6);
  const middle = new THREE.Vector3(body.position.x, body.position.y + 0.3 * FLY_LENGTH, body.position.z);
  const way = () => director.camera.position.clone().sub(middle).normalize();
  director.hand.held = true;
  director.hand.kept = true;
  director.turnBy(1.2, 0.35);
  director.hand.held = false;
  director.update(body, 1 / 60);
  const put = director.camera.position.clone();
  // The fly turns right round where it stands, and the cameraman would have followed it round.
  body.yaw += 2.5;
  watch(director, body, HAND_HOLD * 4);
  assert.ok(director.handled, "still the player's");
  assert.ok(director.camera.position.distanceTo(put) < 0.3, `left where it was put: ${director.camera.position.distanceTo(put).toFixed(2)} mm off`);
  // Brought in from Follow to Close up, which the cameraman films from another side: straight in, not round.
  const from = way();
  for (let i = 0; i < 3; i++) {
    director.zoomBy(1 / 1.2);
    assert.ok(watch(director, body, 0.3) < 1, "no jumps");
  }
  watch(director, body, 2);
  assert.ok(way().angleTo(from) < 0.03, `the same way round: ${way().angleTo(from).toFixed(3)} rad`);
  // Handed back, the cameraman has it again: its own side, its own height.
  director.handBack(true);
  watch(director, body, 4);
  assert.ok(!director.handled && way().angleTo(from) > 0.3, `the cameraman's again: ${way().angleTo(from).toFixed(2)} rad round`);
  // A named view chosen on the View tool is the cameraman's shot too.
  director.hand.kept = true;
  director.turnBy(-1, 0.2);
  director.update(body, 1 / 60);
  director.setView("wide");
  assert.ok(watch(director, body, 6) < 2, "smoothly");
  assert.ok(!director.handled, "the chosen view, not where the hand left it");
});

test("brought in or taken out by hand it goes smoothly along one range, from the eyes' facets to the whole table, and stays where it is left", () => {
  const director = new CameraDirector(world, 16 / 9, picnic.camera);
  // Well away from the table's middle, so the fly is in the picture only if the camera keeps it there.
  const body = fakeBody(150, -60, 3);
  settle(director, body, 6);
  const follow = director.reach;
  let size = lengthOnScreen(director.camera, body);
  // In, a wheel's click at a time: the fly grows each time, and the View tool's name follows.
  const names = new Set<string>();
  for (let i = 0; i < 12; i++) {
    director.zoomBy(1 / 1.2);
    assert.ok(watch(director, body, 0.4) < 1, "no jumps");
    const now = lengthOnScreen(director.camera, body);
    if (director.reach > NEAREST) assert.ok(now > size, `bigger: ${size.toFixed(0)} → ${now.toFixed(0)} px`);
    size = now;
    names.add(director.view);
  }
  assert.equal(director.reach, NEAREST, "no nearer than the nearest");
  assert.ok(size > 640, `close enough for the facets, the fly longer than the picture is wide: the fly ${size.toFixed(0)} px long`);
  assert.deepEqual([...names], ["follow", "close"]);
  // Left there, it stays there.
  watch(director, body, 8);
  assert.equal(director.reach, NEAREST);
  // Out, all the way, the fly in the picture throughout (watch says so): the whole table, where the View tool's Whole table puts it.
  for (let i = 0; i < 40; i++) {
    director.zoomBy(1.2);
    watch(director, body, 0.25);
  }
  watch(director, body, 3);
  assert.equal(director.view, "table");
  const chosen = new CameraDirector(world, 16 / 9, picnic.camera);
  chosen.setView("table");
  settle(chosen, body, 12);
  settle(director, body, 6);
  // The same shot round the table's middle (it drifts slowly round, so not from the same angle).
  const round = (c: THREE.PerspectiveCamera) => [Math.hypot(c.position.x - body.position.x * 0.35, c.position.z - body.position.z * 0.35), c.position.y, c.fov];
  const [a, b] = [round(director.camera), round(chosen.camera)];
  assert.ok(a.every((v, i) => Math.abs(v - b[i]) < Math.abs(b[i]) * 0.03), `the whole table's own shot: ${a.map((v) => v.toFixed(1))} against ${b.map((v) => v.toFixed(1))}`);
  // And Follow, chosen on the View tool, is where it was.
  director.setView("follow");
  assert.equal(director.reach, follow);
});

test("handed back, the cameraman takes the camera at once: its own place round the fly, and the named view nearest the zoom", () => {
  const director = new CameraDirector(world, 16 / 9, picnic.camera);
  const body = fakeBody(-8, -8, 0.6);
  settle(director, body, 6);
  const before = director.camera.position.clone();
  director.hand.held = true;
  director.turnBy(1.4, 0.5);
  director.zoomBy(1.15);
  director.hand.held = false;
  settle(director, body, 0.5);
  assert.equal(director.view, "follow");
  director.handBack();
  assert.equal(director.reach, Math.hypot(SHOTS.follow.distance, SHOTS.follow.height));
  const worst = watch(director, body, 4);
  assert.ok(director.camera.position.distanceTo(before) < 1, `back: ${director.camera.position.distanceTo(before).toFixed(2)} mm off`);
  assert.ok(worst < 0.6, `smoothly: ${worst.toFixed(2)} mm in a frame`);
});

test("the wallpaper takes the camera from the hand, and gives the zoom back when it ends", () => {
  const director = new CameraDirector(world, 16 / 9, picnic.camera);
  const body = fakeBody(-8, -8, 0.6);
  settle(director, body, 3);
  director.hand.held = true;
  director.turnBy(1, 0.4);
  director.zoomBy(0.7);
  const reach = director.reach;
  director.startWallpaper();
  assert.ok(!director.hand.held, "let go");
  settle(director, body, 3);
  director.stopWallpaper();
  assert.equal(director.reach, reach);
});

test("swung up by hand past where it can go, it comes back down the moment it is swung back", () => {
  const director = new CameraDirector(world, 16 / 9, picnic.camera);
  const body = fakeBody(-8, -8, 0.6);
  settle(director, body, 6);
  director.hand.held = true;
  director.turnBy(0, 5);
  settle(director, body, 0.1);
  const top = director.camera.position.y;
  director.turnBy(0, -0.3);
  settle(director, body, 0.1);
  assert.ok(director.camera.position.y < top - 0.5, `${top.toFixed(2)} → ${director.camera.position.y.toFixed(2)} mm`);
});

/** The restaurant, filmed as a room: the whole of it from about a corner. */
const room = new World(RESTAURANT);
const ROOM_CAMERA: SceneCamera = { whole: { around: "table", distance: 3000, height: 1300, side: 0.6, low: 0, fov: 50, settle: 1.6 }, vista: { x: 0, z: 1 } };
/** A fly standing in the restaurant on the surface at or below `y`. */
const roomBody = (x: number, z: number, yaw: number, y: number) => ({ position: { x, y: room.heightAt(x, z, y), z }, velocity: { x: 0, y: 0, z: 0 }, yaw, mode: "standing" }) as unknown as FlyBody & { mode: string };

/** The camera is out of everything, in the room, and nothing stands between it and the fly. */
function inRoomAndInSight(director: CameraDirector, body: FlyBody, what: string) {
  const eye = director.camera.position;
  assert.equal(room.solidAt(eye.x, eye.y, eye.z), -1, `${what}: inside ${room.solids[room.solidAt(eye.x, eye.y, eye.z)]?.name}`);
  assert.ok(Math.abs(eye.x) < DINING_ROOM.hx && Math.abs(eye.z) < DINING_ROOM.hz && eye.y > 0 && eye.y < DINING_ROOM.height, `${what}: out of the room at ${eye.x.toFixed(0)}, ${eye.y.toFixed(0)}, ${eye.z.toFixed(0)}`);
  const p = body.position;
  const middle = { x: p.x, y: p.y + 0.75, z: p.z };
  const length = Math.hypot(eye.x - middle.x, eye.y - middle.y, eye.z - middle.z);
  const dir = { x: (eye.x - middle.x) / length, y: (eye.y - middle.y) / length, z: (eye.z - middle.z) / length };
  const hit = room.raycast(middle, dir, { point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 0 }, solid: -1, t: 0 }, length);
  assert.equal(hit, null, `${what}: ${room.solids[hit?.solid ?? -1]?.name} between the camera and the fly`);
}

test("under a table, the camera stays under it, out of everything, with the fly in sight, even swung up by hand", () => {
  const table = TABLES.find((t) => t.id === "middle-left")!;
  for (const view of ["close", "follow", "wide"] as const) {
    const director = new CameraDirector(room, 16 / 9, ROOM_CAMERA);
    director.setView(view);
    const body = roomBody(table.x, table.z, 0.4, 0);
    settle(director, body, 6);
    inRoomAndInSight(director, body, view);
    director.hand.held = true;
    director.turnBy(0.3, 1.4);
    director.zoomBy(40);
    settle(director, body, 3);
    inRoomAndInSight(director, body, `${view}, swung up and out`);
    const eye = director.camera.position;
    assert.ok(eye.y < TABLE_TOPS.four.bottom, `${view}: up through the table top to ${eye.y.toFixed(0)}`);
  }
});

test("zoomed out by hand by a wall, the camera stops in front of it, whichever way round the fly it is turned", () => {
  for (let k = 0; k < 8; k++) {
    const director = new CameraDirector(room, 16 / 9, ROOM_CAMERA);
    const body = roomBody(-500, -2960, Math.PI, 0);
    settle(director, body, 4);
    director.hand.held = true;
    director.turnBy((k * Math.PI) / 4, 0);
    // Out past Wide, where the range is still the fly's (beyond, it turns to the whole room).
    director.zoomBy(150 / director.reach);
    settle(director, body, 3);
    inRoomAndInSight(director, body, `turned ${k} eighths round`);
  }
});

/** What the camera must never pass through between one frame and the next (it goes past a chair leg or a bottle as the cameraman would, and is never inside one). */
const BIG = new Set(["wall", "glass", "ceiling", "table"]);

test("zoomed by hand from the fly out to the whole room and back, a wheel's click at a time, the camera never goes into anything, nor through a wall or a table", () => {
  const scene = SCENES.restaurant.camera;
  const under = TABLES.find((t) => t.id === "middle-left")!;
  const { zinc } = ZINC_BAR;
  const flies: [string, number, number, number, number][] = [
    ["on its table", RESTAURANT.start.x, RESTAURANT.start.z, RESTAURANT.start.yaw, RESTAURANT.start.y!],
    ["under a table", under.x, under.z, 0.4, 0],
    ["by a wall", -500, -2960, Math.PI, 0],
    ["on the bar", zinc.x, zinc.z, 1.2, zinc.top],
  ];
  const last = new THREE.Vector3();
  const way = { x: 0, y: 0, z: 0 };
  const hit = { point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 0 }, solid: -1, t: 0 };
  for (const [what, x, z, yaw, y] of flies) {
    const director = new CameraDirector(room, 16 / 9, scene);
    const body = roomBody(x, z, yaw, y);
    settle(director, body, 4);
    last.copy(director.camera.position);
    for (let i = 0; i < 80; i++) {
      director.zoomBy(i < 40 ? 1.2 : 1 / 1.2);
      for (let t = 0; t < 0.3; t += 1 / 30) {
        director.update(body, 1 / 30);
        const eye = director.camera.position;
        const at = `${what}, zoomed to ${director.reach.toFixed(0)} mm, at ${eye.x.toFixed(0)}, ${eye.y.toFixed(0)}, ${eye.z.toFixed(0)}`;
        assert.ok(Math.abs(eye.x) < DINING_ROOM.hx && Math.abs(eye.z) < DINING_ROOM.hz && eye.y < DINING_ROOM.height, `${at}: out of the room`);
        assert.ok(room.solidAt(eye.x, eye.y, eye.z) < 0 && eye.y >= room.heightAt(eye.x, eye.z, eye.y) + 0.5, `${at}: inside ${room.solids[room.solidAt(eye.x, eye.y, eye.z)]?.name ?? "the floor"}`);
        let moved = last.distanceTo(eye);
        if (moved > 1e-6) {
          way.x = (eye.x - last.x) / moved;
          way.y = (eye.y - last.y) / moved;
          way.z = (eye.z - last.z) / moved;
          for (let k = 0; k < 8 && room.raycast(last, way, hit, moved); k++) {
            const name = room.solids[hit.solid]?.name ?? "the floor";
            assert.ok(!BIG.has(name) && hit.solid >= 0, `${at}: through ${name}`);
            last.addScaledVector(way, hit.t + 0.01);
            moved -= hit.t + 0.01;
          }
        }
        last.copy(eye);
      }
      if (i === 39) assert.equal(director.view, "table", `${what}: all the way out is the whole room`);
    }
    inRoomAndInSight(director, body, `${what}, back in`);
  }
});

test("in the restaurant every view and wallpaper shot keeps the camera out of everything, with the fly in the picture", () => {
  const { x, z, yaw, y } = RESTAURANT.start;
  const body = roomBody(x, z, yaw, y!);
  const director = new CameraDirector(room, 16 / 9, ROOM_CAMERA);
  const check = (what: string) => {
    settle(director, body, 6);
    const eye = director.camera.position;
    assert.ok(room.solidAt(eye.x, eye.y, eye.z) < 0 && eye.y >= room.heightAt(eye.x, eye.z, eye.y) + 0.5, `${what}: inside something`);
    const at = project(director.camera, { x, y: body.position.y + 0.75, z });
    assert.ok(Math.abs(at.x) < 1 && Math.abs(at.y) < 1 && at.z < 1, `${what}: the fly is out of the picture`);
  };
  for (const view of ["close", "follow", "wide", "above", "table"] as const) {
    director.setView(view);
    check(view);
  }
  director.startWallpaper();
  director.wallpaperStyle = "calm";
  for (let i = 0; i < 5; i++) {
    check(`wallpaper shot ${i}`);
    director.startWallpaper();
  }
});
