// The app's own art (the layered home-screen icon, the Top Shelf banners,
// the launch image, and the web app's icons and link preview), rendered from
// the game: the same table, the same light and the same fly, at the sizes
// tvOS and browsers want. scripts/art.ts opens this page
// (apps/web/art.html, not part of the build) and calls `__art.render`.
//
// Each picture is drawn into a 4× multisampled target and read back. A layer
// is the backdrop (sky, hills, lake: opaque), the table and the picnic
// without the fly (transparent where the sky was), the fly alone
// (transparent), or everything at once with the game's wordmark over it.

import * as THREE from "three";
import { FlyBody, createIntent } from "@fly/body";
import type { FlyPose } from "@fly/contracts";
import { World } from "@fly/world";
import { TV_DESIGN_WIDTH } from "./display.ts";
import { FlyView } from "./fly-view.ts";
import { picnic } from "./places/picnic/index.ts";
import { Bubbles } from "./scene/bubbles.ts";
import type { TimeOfDay } from "./scene/light.ts";
import { FAR, NEAR, Stage } from "./stage.ts";
import { drawWordmark } from "./ui/wordmark.ts";

export type ArtLayer = "backdrop" | "table" | "fly" | "all";

export type ArtShot = {
  width: number;
  height: number;
  layer: ArtLayer;
  /** Where the fly stands, which way round the camera looks at it, and how. */
  fly: { x: number; z: number };
  /** The camera: its angle round the fly (radians, world), distance and height (mm), and vertical field of view. */
  camera: { around: number; distance: number; height: number; fov: number; aimAbove?: number; shiftRight?: number };
  /** How far the fly turns toward the camera from side on (radians); positive faces it more to the picture's right. */
  turn: number;
  time: TimeOfDay;
  pose?: Partial<FlyPose>;
  /** Draws the wordmark over the picture, centred at this height (fraction of the height) and this tall (fraction). */
  wordmark?: { y: number; size: number };
};

const canvas = document.getElementById("art") as HTMLCanvasElement;
// The app's art is the picnic, where the fly first lives.
const world = new World(picnic.place);
const stage = new Stage(canvas, "noon", picnic);
const fly = new FlyView(stage.scene, world);
const bubbles = new Bubbles(stage.scene, world);
const camera = new THREE.PerspectiveCamera(30, 16 / 9, NEAR.near, NEAR.far);
const body = new FlyBody(world, { x: 0, z: 0, yaw: 0 });
const intent = createIntent();

/** Settles the scene into a shot: the light, the fly's place and pose, the camera. */
function arrange(shot: ArtShot) {
  // The art is a clear day.
  stage.weather.choose("clear");
  stage.light.set(shot.time);
  for (let i = 0; i < 40; i++) {
    stage.weather.update(0.1);
    stage.update(i * 0.1, 0.1, camera);
  }
  const c = shot.camera;
  const y = world.heightAt(shot.fly.x, shot.fly.z);
  // The fly side on to the camera, facing the picture's right, turned by `turn` toward it.
  const right = c.around + Math.PI / 2;
  body.place(shot.fly.x, shot.fly.z, right + shot.turn);
  const eye = new THREE.Vector3(shot.fly.x + Math.sin(c.around) * c.distance, y + c.height, shot.fly.z + Math.cos(c.around) * c.distance);
  const target = new THREE.Vector3(shot.fly.x, y + (c.aimAbove ?? 0.6), shot.fly.z);
  // Slide the frame so the fly sits off centre without turning the camera.
  const side = new THREE.Vector3(Math.cos(c.around), 0, -Math.sin(c.around)).multiplyScalar(c.shiftRight ?? 0);
  eye.add(side);
  target.add(side);
  camera.position.copy(eye);
  camera.fov = c.fov;
  camera.aspect = shot.width / shot.height;
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  // Placed, then posed: the pose eases in, so give it a few seconds.
  Object.assign(intent, createIntent(), { live: true });
  fly.update(body, intent, false, 0, 1 / 60);
  const pose = { ...fly.pose, ...shot.pose };
  for (let i = 0; i < 200; i++) fly.model.update(pose, 1 / 60);
  for (let i = 0; i < 240; i++) bubbles.update(i / 60, 1 / 60, camera, stage.light.sunDirection, new THREE.Vector3(), new THREE.Vector3(0, -1e4, 0));
  stage.update(10, 1 / 60, camera);
  // Builds the reflections for this light.
  stage.render(camera, 1);
}

function renderTo(target: THREE.WebGLRenderTarget, shot: ArtShot) {
  const r = stage.renderer;
  r.setRenderTarget(target);
  r.setClearColor(0x000000, 0);
  r.clear(true, true, true);
  const showFly = shot.layer === "fly" || shot.layer === "all";
  const showTable = shot.layer === "table" || shot.layer === "all";
  if (shot.layer === "backdrop" || shot.layer === "all") {
    camera.near = FAR.near;
    camera.far = FAR.far;
    camera.updateProjectionMatrix();
    r.render(stage.backdrop.scene, camera);
    r.clearDepth();
  }
  camera.near = NEAR.near;
  camera.far = NEAR.far;
  camera.updateProjectionMatrix();
  stage.set.group.visible = showTable;
  bubbles.mesh.visible = showTable;
  fly.root.visible = showFly;
  if (fly.shadow) fly.shadow.visible = showTable;
  r.render(stage.scene, camera);
  r.setRenderTarget(null);
}

/** Renders a shot and returns it as a PNG data URL, with straight alpha. */
function render(shot: ArtShot): string {
  arrange(shot);
  const { width, height } = shot;
  const target = new THREE.WebGLRenderTarget(width, height, { samples: 4, colorSpace: THREE.SRGBColorSpace, depthBuffer: true });
  renderTo(target, shot);
  const pixels = new Uint8Array(width * height * 4);
  stage.renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
  target.dispose();
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const g = out.getContext("2d", { alpha: shot.layer === "fly" || shot.layer === "table" })!;
  const image = g.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    const from = (height - 1 - y) * width * 4;
    const to = y * width * 4;
    for (let x = 0; x < width * 4; x += 4) {
      const a = pixels[from + x + 3];
      // Blending into a clear target leaves colour multiplied by alpha: undo it.
      const k = a > 0 && a < 255 ? 255 / a : 1;
      image.data[to + x] = Math.min(255, pixels[from + x] * k);
      image.data[to + x + 1] = Math.min(255, pixels[from + x + 1] * k);
      image.data[to + x + 2] = Math.min(255, pixels[from + x + 2] * k);
      image.data[to + x + 3] = a;
    }
  }
  g.putImageData(image, 0, 0);
  if (shot.wordmark) {
    // The menus are laid out 854 wide: draw the wordmark at that scale.
    const scale = width / TV_DESIGN_WIDTH;
    g.save();
    g.scale(scale, scale);
    drawWordmark(g, TV_DESIGN_WIDTH / 2, (shot.wordmark.y * height) / scale, (shot.wordmark.size * height) / scale);
    g.restore();
  }
  return out.toDataURL("image/png");
}

(globalThis as unknown as { __art: unknown }).__art = { render, ready: true };
