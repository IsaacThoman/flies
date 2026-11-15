// The game: the world and the fly's life in it, the camera, the remote's
// tools and the menus, put together frame by frame.

import type { BrainDriver } from "@fly/contracts";
import { AT_ROOT_PROPERTY } from "@fly/contracts";
import { createPicnic } from "@fly/world";
import { BrainMeter } from "./brain/meter.ts";
import { CameraDirector } from "./camera.ts";
import { DISPLAY_ASPECT } from "./display.ts";
import { FlyView } from "./fly-view.ts";
import type { Remote } from "./input.ts";
import { Life } from "./life.ts";
import { loadSettings } from "./settings.ts";
import type { Settings } from "./settings.ts";
import { Bubbles } from "./scene/bubbles.ts";
import { Stage } from "./stage.ts";
import { Overlay } from "./ui/overlay.ts";
import { drawLoading } from "./ui/loading.ts";

export class Game {
  readonly canvas: HTMLCanvasElement;
  readonly remote: Remote;
  readonly settings: Settings;
  readonly stage: Stage;
  readonly director: CameraDirector;
  readonly life: Life;
  readonly fly: FlyView;
  readonly meter = new BrainMeter();
  readonly overlay = new Overlay();
  readonly bubbles: Bubbles;
  readonly #gust = { x: 0, y: 0, z: 0 };
  /** Seconds since the game started. */
  time = 0;
  /** JavaScript time of the last frame, ms, and a smoothed average. */
  frameMs = 0;
  frameMsAverage = 0;
  #datasetAt = 0;
  #awakeAt = 0;

  constructor(canvas: HTMLCanvasElement, remote: Remote, brain: BrainDriver) {
    this.canvas = canvas;
    this.remote = remote;
    this.settings = loadSettings();
    this.stage = new Stage(canvas, "noon");
    this.stage.setPixels(this.settings.pixels);
    const world = createPicnic();
    this.life = new Life(world, brain);
    this.fly = new FlyView(this.stage.scene, world);
    this.director = new CameraDirector(world, DISPLAY_ASPECT);
    this.bubbles = new Bubbles(this.stage.scene, world);
    this.life.stimuli.looming = this.bubbles.looming;
  }

  get brain(): BrainDriver {
    return this.life.brain;
  }

  frame(dt: number, now: number) {
    const started = performance.now();
    this.time += dt;
    const { life, stage, director } = this;
    life.step(dt, now);
    this.meter.update(life.brain, now);
    this.fly.update(life.body, life.intent, life.eating, dt);
    director.update(life.body, dt);
    stage.update(this.time, dt, director.camera);
    this.bubbles.update(this.time, dt, director.camera, stage.light.sunDirection, this.#gust);

    this.overlay.dirty = true;
    const showLoading = this.brain.status !== "running" || this.time < this.#awakeAt + 1.5;
    if (this.brain.status !== "running") this.#awakeAt = this.time;
    this.overlay.redraw(dt, (g) => showLoading && drawLoading(g, this.time, this.brain));

    stage.beginFrame();
    stage.render(director.camera, dt);
    stage.renderer.render(this.overlay.scene, this.overlay.camera);
    stage.measure();
    this.remote.endFrame();
    (window as unknown as Record<string, unknown>)[AT_ROOT_PROPERTY] = true;
    this.frameMs = performance.now() - started;
    this.frameMsAverage += (this.frameMs - this.frameMsAverage) * 0.05;
    if (now - this.#datasetAt > 250) {
      this.#datasetAt = now;
      this.#publish();
    }
  }

  /** The game's state on the canvas, for scripts and tests to wait on. */
  #publish() {
    const d = this.canvas.dataset;
    if (!d) return;
    const { life } = this;
    const s = life.sensed;
    d.screen = "play";
    d.brain = life.brain.status;
    d.neurons = String(life.brain.neurons);
    d.activity = life.activity;
    d.mode = life.body.mode;
    d.senses = `loom ${s.loomLeft.toFixed(2)}/${s.loomRight.toFixed(2)} touch ${s.touch.toFixed(2)} bump ${s.bumpLeft.toFixed(2)}/${s.bumpRight.toFixed(2)} wind ${s.wind.toFixed(2)} sweet ${s.sweet.toFixed(2)} grounded ${s.grounded ? 1 : 0}`;
    d.sweet = s.sweet.toFixed(3);
    d.eaten = life.eaten.toFixed(3);
    d.takeoffs = String(life.takeOffs);
    d.calls = String(this.stage.cost.calls);
    d.triangles = String(this.stage.cost.triangles);
    d.frameMs = this.frameMsAverage.toFixed(2);
    d.spikesPerSecond = String(Math.round(this.meter.spikesPerSecond));
  }
}
