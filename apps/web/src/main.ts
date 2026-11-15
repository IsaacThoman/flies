// A placeholder scene: enough to prove the renderer, the frame loop and the
// remote all work, in a browser and on the Apple TV. The game replaces it.

import * as THREE from "three";
import { REMOTE_KEYS, REMOTE_TOUCH_EVENT } from "@fly/contracts";
import type { RemoteTouch } from "@fly/contracts";

/** The whole game renders at this size and is stretched to the screen. */
export const RENDER_WIDTH = 640;
export const RENDER_HEIGHT = 480;

const canvas = document.getElementById("game") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(1);
renderer.setSize(RENDER_WIDTH, RENDER_HEIGHT, false);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#8fd0ff");
// Laid out for a 16:9 screen; the 4:3 buffer is stretched to fill it.
const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100);
camera.position.set(0, 1.2, 4);
camera.lookAt(0, 0, 0);
scene.add(new THREE.HemisphereLight("#ffffff", "#6aa84f", 2));

const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: "#e5483e" }));
scene.add(cube);

window.addEventListener("keydown", (event) => {
  const button = REMOTE_KEYS[event.key];
  if (button) canvas.dataset.lastButton = button;
});
window.addEventListener(REMOTE_TOUCH_EVENT, (event) => {
  const { x, y } = (event as CustomEvent<RemoteTouch>).detail;
  cube.position.set(x, y, 0);
});

let last = performance.now();
const frame = (now: number) => {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  cube.rotation.y += dt;
  cube.rotation.x += dt * 0.6;
  renderer.render(scene, camera);
  canvas.dataset.ready = "true";
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);
