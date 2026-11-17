// Drive: a first-person car on a country loop, with a fruit fly on the
// dashboard that can take the wheel. The fly's brain (the same one as the
// fly game's, in a Web Worker) sees the road through its own eyes all the
// while, and walks on its ball; hand it the wheel and its walking and
// turning drive the car (pilot.ts).
//
// The canvas carries the state for tests and scripts as data-*: brain,
// autopilot, speed (km/h), escapes, progress (m round the loop), eyes
// (pictures the brain has been sent), and the brain's latest walk and turn.

import * as THREE from "three";
import { createBrains } from "../brain/create.ts";
import { Display, fieldOfView } from "../display.ts";
import { Car, Roads } from "./car.ts";
import { Cockpit, DRIVER } from "./cockpit.ts";
import type { BrainLamp } from "./cockpit.ts";
import { CarEyes } from "./eyes.ts";
import { Hands } from "./input.ts";
import { Pilot } from "./pilot.ts";
import { SKY, TrafficView, buildLights, buildScenery } from "./scenery.ts";
import { Track } from "./track.ts";

/** The world's layer, seen by the driver and the fly; the car's inside, seen by the driver only. */
const WORLD_LAYER = 0;
const COCKPIT_LAYER = 2;
/** The driver's vertical field of view on a 16:9 screen, degrees. */
const FOV = 62;

const canvas = document.getElementById("game") as HTMLCanvasElement;
const display = new Display(false);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = SKY.horizon;
const track = new Track();
scene.add(buildScenery(track));
buildLights(scene);
const roads = new Roads(track);
const trafficView = new TrafficView(roads.cars);
scene.add(trafficView.mesh);

const car = new Car(track);
const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.05, 2000);
camera.layers.enable(COCKPIT_LAYER);
camera.position.copy(DRIVER);
camera.rotation.set(-0.06, Math.PI, 0, "YXZ");

const brain = createBrains().first;
const eyes = new CarEyes(renderer, scene, WORLD_LAYER);
const cockpit = new Cockpit(eyes.picture.texture, COCKPIT_LAYER);
cockpit.root.add(camera);
scene.add(cockpit.root);
const pilot = new Pilot();
const hands = new Hands(window, canvas);
// For scripts and the console, as the fly game has __fly.
(globalThis as { __drive?: unknown }).__drive = { car, pilot, brain, eyes, roads };

let autopilot = false;
const head = new THREE.Vector3();
const shown: Record<string, string> = {};
let sinceShown = Infinity;

function resize() {
  const frame = display.frame;
  renderer.setSize(frame.width, frame.height, false);
  camera.aspect = frame.aspect;
  // Upright, a little more of the road than the TV's width keeps: less roof and floor.
  camera.fov = fieldOfView(FOV, frame.aspect, 0.5);
  camera.updateProjectionMatrix();
}
resize();

function show(key: string, value: string) {
  if (shown[key] === value) return;
  shown[key] = value;
  canvas.dataset[key] = value;
}

let last = performance.now();
function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min(Math.max(0, (now - last) / 1000), 0.1);
  last = now;
  if (display.update()) resize();

  const running = brain.status === "running";
  hands.update(car.speed, canvas.clientWidth || window.innerWidth, navigator.getGamepads?.() ?? [], now, dt);
  if (hands.takeToggles() % 2 === 1 && (running || autopilot)) autopilot = !autopilot;
  if (hands.takeResets() > 0) car.reset(car.road.s);
  // Taking the wheel back is just driving.
  if (autopilot && hands.driving) autopilot = false;
  if (!running) autopilot = false;

  const senses = pilot.sense(car.contact, brain.eyes && eyes.seeing ? eyes.light : null, dt);
  brain.tick(dt * 1000, senses);
  const intent = pilot.update(brain.state?.command ?? null, now - brain.stateAt, car.speed, dt);

  roads.step(car, dt);
  car.step(autopilot ? pilot.controls : hands.controls, roads.cars, dt);
  trafficView.update(roads.cars);
  const lamp: BrainLamp = brain.status === "failed" ? "failed" : !running ? "waiting" : autopilot ? "on" : "off";
  cockpit.update(car, intent, lamp, dt);

  if (brain.eyes) {
    cockpit.root.updateMatrixWorld();
    eyes.look(brain.eyes, cockpit.fly.anchor("head", head), car.yaw, dt);
  }
  renderer.setRenderTarget(null);
  renderer.render(scene, camera);

  sinceShown += dt;
  if (sinceShown >= 0.25) {
    sinceShown = 0;
    show("brain", brain.status);
    show("autopilot", autopilot ? "on" : "off");
    show("speed", String(Math.round(car.speed * 3.6)));
    show("escapes", String(pilot.escapes));
    show("progress", String(Math.round(car.progress)));
    show("eyes", String(eyes.updates));
    const command = brain.state?.command;
    show("walk", command ? command.walk.toFixed(2) : "");
    show("turn", command ? command.turn.toFixed(2) : "");
  }
}
requestAnimationFrame(frame);
