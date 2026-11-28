import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import type { FlyBody } from "@fly/body";
import { World, createPicnic } from "@fly/world";
import { picnic } from "../src/places/picnic/index.ts";
import { SCENES } from "../src/places/index.ts";
import { CameraDirector, NEAREST, PITCH, PRESETS } from "../src/camera.ts";
import type { View } from "../src/camera.ts";
import { DRAG_ROUND, DRAG_UP, NOTCH_ZOOM, PlayControls } from "../src/controls.ts";
import type { PlayTarget } from "../src/controls.ts";
import type { Gesture } from "../src/input.ts";
import { fakeBody, lengthOnScreen, middleOf, project, settle, sizeOnScreen } from "./camera-probe.ts";

const world = createPicnic();
const forward = (director: CameraDirector) => director.camera.getWorldDirection(new THREE.Vector3());
/** How far round and up the camera is from the fly's middle, as it is in the picture. */
function placeOf(director: CameraDirector, body: FlyBody) {
  const m = middleOf(body);
  const eye = director.camera.position;
  const d = Math.hypot(eye.x - m.x, eye.y - m.y, eye.z - m.z);
  return { yaw: Math.atan2(eye.x - m.x, eye.z - m.z), pitch: Math.asin((eye.y - m.y) / d), distance: d };
}
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** The game's play target, as far as the camera goes: what the pointer's gestures ask of it. */
function cameraTarget(director: CameraDirector): PlayTarget {
  return {
    tool: () => "once",
    hudAt: () => null,
    // The upper third is air; the rest is the table.
    aim: (_x, y) => y > 1 / 3,
    unaim: () => {},
    under: () => "world",
    use: () => {},
    grab: () => false,
    offerFinger: () => {},
    putAway: () => {},
    pressHud: () => {},
    trayOpen: () => false,
    closeTray: () => {},
    hoverHud: () => {},
    turn: (yaw, pitch) => director.turnBy(yaw, pitch),
    zoom: (factor) => director.zoomBy(factor),
    holdCamera: (held) => {
      director.held = held;
    },
    home: () => director.home(),
  };
}

/** A pointer's drag, as the game hears it: down, moved in steps, and up. */
function dragGestures(from: [number, number], to: [number, number], steps: number, touch = false, button = 0): Gesture[] {
  const out: Gesture[] = [{ type: "down", x: from[0], y: from[1], button, touch }];
  for (let i = 1; i <= steps; i++) out.push({ type: "drag", x: from[0] + ((to[0] - from[0]) * i) / steps, y: from[1] + ((to[1] - from[1]) * i) / steps, far: true });
  out.push({ type: "up", x: to[0], y: to[1], tap: false, double: false });
  return out;
}

test("in Follow the fly is 120 to 200 pixels long and in the middle of the picture, wherever it stands and whichever way it faces; Close up is bigger and Wide smaller", () => {
  for (const [x, z, yaw] of [[-8, -8, 0.6], [40, 20, 2.5], [-60, 40, -1.2], [150, -60, 3], [0, 120, 1.5]]) {
    const director = new CameraDirector(world, 16 / 9, picnic.camera);
    const body = fakeBody(world, x, z, yaw);
    settle(director, body, 2);
    const size = sizeOnScreen(director.camera, body);
    assert.ok(size > 120 && size < 200, `at ${x}, ${z}: ${size.toFixed(0)} px`);
    const at = project(director.camera, middleOf(body));
    assert.ok(Math.abs(at.x) < 1e-3 && Math.abs(at.y) < 1e-3, `in the middle: ${at.x.toFixed(4)}, ${at.y.toFixed(4)}`);
  }
  const sizes: Partial<Record<View, number>> = {};
  for (const view of ["close", "follow", "wide"] as const) {
    const director = new CameraDirector(world, 16 / 9, picnic.camera);
    director.setView(view);
    const body = fakeBody(world, -8, -8, 0.6);
    settle(director, body, 2);
    sizes[view] = sizeOnScreen(director.camera, body);
  }
  assert.ok(sizes.close! > sizes.follow! * 1.4 && sizes.wide! < sizes.follow! * 0.6, JSON.stringify(sizes));
});

test("a drag of so many pixels turns the camera by exactly that much times one rate, at every zoom, in every place, and the same again the second time", () => {
  const width = 1280;
  const height = 720;
  for (const [id, scene] of Object.entries(SCENES)) {
    const place = new World(scene.place);
    const { x, z, yaw, y } = scene.place.start;
    for (const view of ["close", "follow", "wide", "table"] as const) {
      const director = new CameraDirector(place, 16 / 9, scene.camera);
      const body = fakeBody(place, x, z, yaw, y);
      director.setView(view);
      settle(director, body, 2);
      const controls = new PlayControls();
      const target = cameraTarget(director);
      for (let k = 0; k < 2; k++) {
        const before = { yaw: director.yaw, pitch: director.pitch };
        const looked = forward(director);
        // 160 pixels right and 72 down, from the air, in eight steps.
        for (const g of dragGestures([0.4, 0.2], [0.4 + 160 / width, 0.2 + 72 / height], 8)) controls.gesture(g, target, true);
        settle(director, body, 1);
        const turned = wrap(director.yaw - before.yaw);
        assert.ok(Math.abs(turned + (160 / width) * DRAG_ROUND) < 1e-9, `${id}, ${view}, drag ${k + 1}: round by ${turned}`);
        const pitch = Math.min(PITCH[1], before.pitch + (72 / height) * DRAG_UP) - before.pitch;
        assert.ok(Math.abs(director.pitch - before.pitch - pitch) < 1e-9, `${id}, ${view}, drag ${k + 1}: up by ${director.pitch - before.pitch}`);
        // And the picture with it: the camera looks at the fly from that much further round and up.
        const now = forward(director);
        const yawSeen = wrap(Math.atan2(-now.x, -now.z) - Math.atan2(-looked.x, -looked.z));
        assert.ok(Math.abs(yawSeen - turned) < 1e-6, `${id}, ${view}: the picture turned ${yawSeen} for ${turned}`);
      }
    }
  }
});

test("left alone, the camera never turns: not as the fly walks and turns, nor as it jumps and flies, nor after a while; it only goes along with it", () => {
  const director = new CameraDirector(world, 16 / 9, picnic.camera);
  const body = fakeBody(world, 0, 120, 0.6);
  settle(director, body, 2);
  director.turnBy(0.9, 0.2);
  settle(director, body, 1);
  const looked = forward(director);
  const yaw = director.yaw;
  const pitch = director.pitch;
  const reach = director.reach;
  let worstDistance = 0;
  const dt = 1 / 60;
  for (let i = 0; i < 60 * 30; i++) {
    const t = i * dt;
    if (t < 20) {
      // Round and round on the open cloth at 12 mm/s, turning all the while, now one way, now the other.
      body.mode = "standing";
      body.yaw += (t < 10 ? 1 : -1) * 0.8 * dt;
      body.velocity.x = Math.sin(body.yaw) * 12;
      body.velocity.z = Math.cos(body.yaw) * 12;
      body.velocity.y = 0;
    } else if (t < 21) {
      // Off into the air, flying up and on at a fifth of a metre a second.
      body.mode = "airborne";
      body.velocity.x = Math.sin(body.yaw) * 150;
      body.velocity.z = Math.cos(body.yaw) * 150;
      body.velocity.y = 120;
    } else {
      // Hovering, turning on the spot.
      body.velocity.x = body.velocity.y = body.velocity.z = 0;
      body.yaw += 2 * dt;
    }
    body.position.x += body.velocity.x * dt;
    body.position.y += body.velocity.y * dt;
    body.position.z += body.velocity.z * dt;
    if (t < 20) assert.equal(world.heightAt(body.position.x, body.position.z), 0, "on the open cloth");
    director.update(body, dt);
    assert.equal(director.yaw, yaw);
    assert.equal(director.pitch, pitch);
    assert.equal(director.reach, reach);
    const now = forward(director);
    assert.ok(now.angleTo(looked) < 1e-7, `turned ${now.angleTo(looked)} rad at ${t.toFixed(2)} s`);
    // Over the open table, nothing in the way: as far from the fly's middle as it was put, but for following it.
    const m = middleOf(body);
    const off = Math.abs(director.camera.position.distanceTo(new THREE.Vector3(m.x, m.y, m.z)) - reach);
    worstDistance = Math.max(worstDistance, off);
    const at = project(director.camera, m);
    assert.ok(Math.abs(at.x) < 0.5 && Math.abs(at.y) < 0.5 && at.z < 1, `the fly in the picture at ${t.toFixed(2)} s: ${at.x.toFixed(2)}, ${at.y.toFixed(2)}`);
  }
  assert.ok(worstDistance < 0.05 * reach, `the distance changed by ${worstDistance.toFixed(2)} mm`);
});

test("zooming changes only the distance: the same way round, the same field of view, the fly in the middle", () => {
  const director = new CameraDirector(world, 16 / 9, picnic.camera);
  const body = fakeBody(world, 150, -60, 3);
  settle(director, body, 2);
  director.turnBy(-0.7, 0.15);
  settle(director, body, 1);
  const looked = forward(director);
  const fov = director.camera.fov;
  const controls = new PlayControls();
  const target = cameraTarget(director);
  let size = lengthOnScreen(director.camera, body);
  let last = director.camera.position.clone();
  const zoom = (g: Gesture, frames: number) => {
    controls.gesture(g, target, true);
    for (let i = 0; i < frames; i++) {
      director.update(body, 1 / 60);
      assert.ok(forward(director).angleTo(looked) < 1e-7, "the same way round");
      assert.equal(director.camera.fov, fov);
      const at = project(director.camera, middleOf(body));
      assert.ok(Math.abs(at.x) < 1e-6 && Math.abs(at.y) < 1e-6, `in the middle: ${at.x}, ${at.y}`);
      assert.ok(director.camera.position.distanceTo(last) < 0.25 * director.reach, "smoothly");
      last = director.camera.position.clone();
    }
  };
  // A mouse wheel's clicks in, all the way: bigger each time, then no nearer.
  for (let i = 0; i < 12; i++) {
    zoom({ type: "wheel", x: 0.5, y: 0.5, dx: 0, dy: -100, notch: true, zoom: false }, 30);
    const now = lengthOnScreen(director.camera, body);
    if (director.reach > NEAREST) assert.ok(now > size, `bigger: ${size.toFixed(0)} → ${now.toFixed(0)} px`);
    size = now;
  }
  assert.equal(director.reach, NEAREST);
  assert.equal(director.view, "close");
  // A trackpad's pinch (a wheel with Ctrl, or Safari's) and a touch screen's, out all the way to the whole table.
  for (let i = 0; i < 40; i++) zoom({ type: "wheel", x: 0.5, y: 0.5, dx: 0, dy: 40, notch: false, zoom: true }, 4);
  for (let i = 0; i < 20; i++) zoom({ type: "pinch", scale: 0.8, dx: 0, dy: 0 }, 4);
  zoom({ type: "pinchEnd" }, 60);
  assert.equal(director.view, "table");
  // A wheel's click is the same step wherever it is.
  const out = director.reach;
  zoom({ type: "wheel", x: 0.5, y: 0.5, dx: 0, dy: -100, notch: true, zoom: false }, 60);
  assert.ok(Math.abs(director.reach * NOTCH_ZOOM - out) < 1e-9, `${out} → ${director.reach}`);
});

test("a view chosen goes to its distance and pitch over a moment, and the player has the camera again at once", () => {
  for (const view of ["close", "follow", "wide", "above", "table"] as const) {
    const director = new CameraDirector(world, 16 / 9, picnic.camera);
    const body = fakeBody(world, 0, 120, 0.6);
    settle(director, body, 1);
    director.setView(view === "follow" ? "wide" : "follow");
    settle(director, body, 2);
    const last = director.camera.position.clone();
    director.setView(view);
    let worst = 0;
    for (let t = 0; t < 3; t += 1 / 60) {
      director.update(body, 1 / 60);
      worst = Math.max(worst, director.camera.position.distanceTo(last));
      last.copy(director.camera.position);
    }
    const place = placeOf(director, body);
    const preset = view === "table" ? { distance: director.reach, pitch: Math.atan2(picnic.camera.whole.height, picnic.camera.whole.distance) } : PRESETS[view];
    assert.ok(Math.abs(director.reach - preset.distance) < 1e-9 && Math.abs(director.pitch - preset.pitch) < 1e-9, `${view}: ${director.reach}, ${director.pitch}`);
    assert.ok(Math.abs(place.distance / preset.distance - 1) < 0.01 && Math.abs(place.pitch - preset.pitch) < 0.01, `${view}: seen from ${place.distance.toFixed(1)} mm, ${place.pitch.toFixed(3)} rad up`);
    if (view === "above") assert.ok(Math.abs(wrap(place.yaw - (body.yaw + Math.PI))) < 0.01, "from above, behind the fly");
    if (view === "table") assert.ok(Math.abs(wrap(place.yaw - picnic.camera.whole.side)) < 0.01, "the whole table, from its own side");
    assert.ok(worst < 0.2 * Math.max(preset.distance, 11), `${view}: smoothly, ${worst.toFixed(2)} mm in a frame at most`);
    // Turned by hand right after: it goes where it is turned, and stays.
    director.turnBy(0.5, -0.05);
    settle(director, body, 8);
    const turned = placeOf(director, body);
    settle(director, body, 10);
    const later = placeOf(director, body);
    assert.ok(Math.abs(wrap(later.yaw - turned.yaw)) < 1e-9 && Math.abs(later.pitch - turned.pitch) < 1e-9 && Math.abs(later.distance - turned.distance) < 1e-9, `${view}: nothing takes over: ${JSON.stringify([turned, later])}`);
  }
});

test("a double click in the air, R or the pad's stick pressed in goes back to Follow's distance and pitch, on the same side of the fly", () => {
  const director = new CameraDirector(world, 16 / 9, picnic.camera);
  const body = fakeBody(world, -8, -8, 0.6);
  settle(director, body, 1);
  director.turnBy(2.2, 0.6);
  director.zoomBy(3);
  settle(director, body, 1);
  const yaw = director.yaw;
  const controls = new PlayControls();
  const target = cameraTarget(director);
  for (const g of [{ type: "down", x: 0.5, y: 0.1, button: 0, touch: false }, { type: "up", x: 0.5, y: 0.1, tap: true, double: false }, { type: "down", x: 0.5, y: 0.1, button: 0, touch: false }, { type: "up", x: 0.5, y: 0.1, tap: true, double: true }] as Gesture[]) controls.gesture(g, target, true);
  settle(director, body, 2);
  assert.equal(director.view, "follow");
  assert.equal(director.reach, PRESETS.follow.distance);
  assert.equal(director.pitch, PRESETS.follow.pitch);
  assert.equal(director.yaw, yaw, "the same way round");
});

test("every way of turning and zooming reaches the same rig: a mouse, a finger, two fingers, a trackpad", () => {
  const body = fakeBody(world, -8, -8, 0.6);
  const run = (gestures: Gesture[], mouse: boolean) => {
    const director = new CameraDirector(world, 16 / 9, picnic.camera);
    settle(director, body, 1);
    const controls = new PlayControls();
    const before = { yaw: director.yaw, pitch: director.pitch, reach: director.reach };
    for (const g of gestures) controls.gesture(g, cameraTarget(director), mouse);
    settle(director, body, 1);
    return { yaw: wrap(director.yaw - before.yaw), pitch: director.pitch - before.pitch, zoom: director.reach / before.reach };
  };
  const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  for (const button of [0, 1, 2]) {
    const mouse = run(dragGestures([0.5, button === 0 ? 0.2 : 0.6], [0.6, button === 0 ? 0.3 : 0.7], 5, false, button), true);
    assert.ok(close(mouse.yaw, -0.1 * DRAG_ROUND) && close(mouse.pitch, 0.1 * DRAG_UP), `button ${button}: ${JSON.stringify(mouse)}`);
  }
  const finger = run(dragGestures([0.5, 0.2], [0.6, 0.3], 5, true), false);
  assert.ok(close(finger.yaw, -0.1 * DRAG_ROUND) && close(finger.pitch, 0.1 * DRAG_UP), `a finger: ${JSON.stringify(finger)}`);
  const fromTable = run(dragGestures([0.5, 0.6], [0.6, 0.6], 5, true), false);
  assert.ok(close(fromTable.yaw, -0.1 * DRAG_ROUND), `a finger from the table: ${JSON.stringify(fromTable)}`);
  const pinch = run([{ type: "pinch", scale: 2, dx: 0.05, dy: 0 }, { type: "pinchEnd" }], false);
  assert.ok(close(pinch.zoom, 0.5) && close(pinch.yaw, -0.05 * DRAG_ROUND), `two fingers: ${JSON.stringify(pinch)}`);
  const scroll = run([{ type: "wheel", x: 0.5, y: 0.5, dx: 30, dy: 0, notch: false, zoom: false }], true);
  assert.ok(Math.abs(scroll.yaw) > 0.1 && scroll.zoom === 1, `a trackpad's scroll across: ${JSON.stringify(scroll)}`);
  const wheel = run([{ type: "wheel", x: 0.5, y: 0.5, dx: 0, dy: 100, notch: true, zoom: false }], true);
  assert.ok(close(wheel.zoom, NOTCH_ZOOM) && wheel.yaw === 0, `a wheel's click: ${JSON.stringify(wheel)}`);
});

test("turning through scenery keeps the player's pitch and distance", () => {
  const director = new CameraDirector(world, 16 / 9, picnic.camera);
  const body = fakeBody(world, 130, -12, 0.6);
  const { distance, pitch } = PRESETS.follow;
  settle(director, body, 1);

  for (const [yaw, expectedSolid] of [[0, undefined], [Math.PI / 2, "apple"], [Math.PI, undefined]] as const) {
    director.turnBy(yaw - director.yaw, 0);
    for (let i = 0; i < 60; i++) {
      director.update(body, 1 / 60);
      const actual = placeOf(director, body);
      assert.ok(Math.abs(actual.distance - distance) < 1e-6);
      assert.ok(Math.abs(actual.pitch - pitch) < 1e-6);
    }
    assert.ok(Math.abs(wrap(placeOf(director, body).yaw - yaw)) < 1e-6);
    const { x, y, z } = director.camera.position;
    assert.equal(world.solids[world.solidAt(x, y, z)]?.name, expectedSolid);
  }
});

test("every view, in every place, frames the fly in the middle of the picture", () => {
  for (const [id, scene] of Object.entries(SCENES)) {
    const place = new World(scene.place);
    const { x, z, yaw, y } = scene.place.start;
    const body = fakeBody(place, x, z, yaw, y);
    const director = new CameraDirector(place, 16 / 9, scene.camera);
    for (const view of ["close", "follow", "wide", "above", "table"] as const) {
      director.setView(view);
      settle(director, body, 3);
      const at = project(director.camera, middleOf(body));
      assert.ok(Math.abs(at.x) < 1e-3 && Math.abs(at.y) < 1e-3 && at.z < 1, `${id}, ${view}: the fly at ${at.x.toFixed(3)}, ${at.y.toFixed(3)}`);
    }
  }
});

test("going into play from the screensaver eases from where its camera was into the player's, and out again the same way", () => {
  const director = new CameraDirector(world, 16 / 9, picnic.camera);
  const body = fakeBody(world, -8, -8, 0.6);
  settle(director, body, 1);
  director.turnBy(-1.5, 0.3);
  director.zoomBy(1.6);
  settle(director, body, 1);
  const mine = { yaw: director.yaw, pitch: director.pitch, reach: director.reach };
  const watch = (seconds: number) => {
    let worst = 0;
    let turn = 0;
    const last = director.camera.position.clone();
    const looked = forward(director);
    for (let t = 0; t < seconds; t += 1 / 60) {
      director.update(body, 1 / 60);
      worst = Math.max(worst, director.camera.position.distanceTo(last));
      turn = Math.max(turn, forward(director).angleTo(looked));
      last.copy(director.camera.position);
      looked.copy(forward(director));
    }
    return { worst, turn };
  };
  director.startWallpaper();
  const out = watch(8);
  assert.ok(out.worst < 0.5 && out.turn < 0.05, `out to the screensaver smoothly: ${out.worst.toFixed(2)} mm, ${out.turn.toFixed(3)} rad in a frame`);
  director.stopWallpaper();
  const back = watch(3);
  assert.ok(back.worst < 1 && back.turn < 0.05, `back into play smoothly: ${back.worst.toFixed(2)} mm, ${back.turn.toFixed(3)} rad in a frame`);
  assert.equal(director.reach, mine.reach, "at the player's distance");
  assert.equal(director.pitch, mine.pitch, "and pitch");
  const place = placeOf(director, body);
  assert.ok(Math.abs(place.distance / mine.reach - 1) < 0.01 && Math.abs(place.pitch - mine.pitch) < 0.01, `there: ${JSON.stringify(place)}`);
  const at = project(director.camera, middleOf(body));
  assert.ok(Math.abs(at.x) < 1e-3 && Math.abs(at.y) < 1e-3, "the fly in the middle again");
});

test("on every shape of screen the field of view is the same at every zoom and the fly stays in the middle", () => {
  for (const aspect of [21 / 9, 16 / 9, 4 / 3, 3 / 4, 9 / 19.5]) {
    const director = new CameraDirector(world, aspect, picnic.camera);
    const body = fakeBody(world, -8, -8, 0.6);
    settle(director, body, 1);
    const fov = director.camera.fov;
    for (const factor of [0.3, 1, 4, 20]) {
      director.zoomBy(factor);
      settle(director, body, 1);
      assert.equal(director.camera.fov, fov, `${aspect.toFixed(2)}: ${director.camera.fov} at ${director.reach.toFixed(0)} mm`);
      const at = project(director.camera, middleOf(body));
      assert.ok(Math.abs(at.x) < 1e-3 && Math.abs(at.y) < 1e-3);
    }
  }
});
