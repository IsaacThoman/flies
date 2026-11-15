// The game: the world and the fly's life in it, the camera, the remote's
// tools and the menus, put together frame by frame.

import * as THREE from "three";
import type { BrainDriver, RemoteButton } from "@fly/contracts";
import { AT_ROOT_PROPERTY } from "@fly/contracts";
import { Navigator } from "@fly/ui";
import { createPicnic } from "@fly/world";
import type { RayHit } from "@fly/world";
import { Audio } from "./audio/sounds.ts";
import type { Sound } from "./audio/sounds.ts";
import { BrainMeter } from "./brain/meter.ts";
import { CameraDirector } from "./camera.ts";
import type { View } from "./camera.ts";
import { DISPLAY_ASPECT } from "./display.ts";
import { Eyes } from "./eyes/eyes.ts";
import { FlyView } from "./fly-view.ts";
import type { Remote } from "./input.ts";
import { Life } from "./life.ts";
import { Bubbles } from "./scene/bubbles.ts";
import { Fireflies } from "./scene/fireflies.ts";
import { timeFromClock } from "./scene/light.ts";
import { loadSettings, saveSettings } from "./settings.ts";
import type { Settings } from "./settings.ts";
import { Stage } from "./stage.ts";
import { BALL_RADIUS, Hands } from "./tools/hands.ts";
import { HandsView } from "./tools/view.ts";
import { drawHud } from "./ui/hud.ts";
import type { HudState } from "./ui/hud.ts";
import { drawLoading } from "./ui/loading.ts";
import { Overlay } from "./ui/overlay.ts";
import { AboutScreen } from "./ui/screens/about.ts";
import { BrainScreen } from "./ui/screens/brain.ts";
import { pauseScreen, settingsScreen, titleScreen } from "./ui/screens/menus.ts";
import type { Screen, ScreenId, Shell } from "./ui/screens/types.ts";
import { drawStats } from "./ui/stats.ts";

/** Seconds the loading screen stays after the brain wakes, so "Awake!" is seen. */
const AWAKE_HOLD = 1.2;
/** How sensitive the touch surface is: screen widths per full swipe. */
const SWIPE_GAIN = 0.9;
/** How often the HUD redraws for its shimmer alone, per second. */
const HUD_SHIMMER_FPS = 10;

type MenuScreenId = Exclude<ScreenId, "play">;

export class Game implements Shell {
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
  readonly hands: Hands;
  readonly handsView: HandsView;
  readonly audio = new Audio();
  readonly eyes: Eyes;
  readonly fireflies: Fireflies;
  readonly nav = new Navigator<ScreenId>("title");
  readonly screens: Record<MenuScreenId, Screen>;
  /** Seconds since the game started. */
  time = 0;
  /** JavaScript time of the last frame (ms), smoothed. */
  frameMs = 0;
  frameMsAverage = 0;
  /** The wallpaper: nobody has touched the remote for a while. */
  wallpaper = false;
  /** 0 to 1: how much of the menus and hints show (they fade for the wallpaper). */
  uiAlpha = 1;
  /** Recent peaks of the giant fibre's escape command, the hand-wired loom, and the eyes' looming detectors (Hz). */
  readonly peaks = { escape: 0, loom: 0, looming: 0 };
  #loading = true;
  #awakeAt = -1;
  #datasetAt = 0;
  /** What the HUD last drew, to tell when it needs drawing again. */
  #hudKey = { tool: -1, variant: -1, activity: "", food: null as string | null, following: false, touched: false, hints: false, eyes: false };
  #hudAt = 0;
  #changedAt = -10;
  #touched = false;
  #lastMeals = 0;
  #paddleIn = 0;
  #clockAt = 0;
  #air = new THREE.Vector3();
  #middle = new THREE.Vector3();
  #ndc = new THREE.Vector3();
  #ndc2 = new THREE.Vector2();
  #ray = new THREE.Raycaster();
  #hit: RayHit = { point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, solid: -1, t: 0 };
  #eye = { x: 0, y: 0, z: 0 };
  #lastScreen: ScreenId | "loading" = "loading";
  #hud: HudState;
  #eyesInfo = { facets: 0, standIn: false, ms: 0, calls: 0 };

  constructor(canvas: HTMLCanvasElement, remote: Remote, brain: BrainDriver) {
    this.canvas = canvas;
    this.remote = remote;
    this.settings = loadSettings();
    this.stage = new Stage(canvas, timeFromClock(new Date()));
    this.fireflies = new Fireflies(this.stage.scene);
    const world = createPicnic();
    this.life = new Life(world, brain);
    this.fly = new FlyView(this.stage.scene, world);
    this.director = new CameraDirector(world, DISPLAY_ASPECT);
    this.bubbles = new Bubbles(this.stage.scene, world);
    this.hands = new Hands(world);
    this.handsView = new HandsView(this.stage.scene);
    this.eyes = new Eyes(this.stage, this.life);
    this.eyes.see(this.bubbles.mesh);
    for (const object of this.handsView.seen) this.eyes.see(object);
    this.screens = {
      title: titleScreen(this),
      pause: pauseScreen(this),
      settings: settingsScreen(this),
      about: new AboutScreen(this),
      brain: new BrainScreen(this),
    };
    this.#hud = { hands: this.hands, activity: "waiting", food: null, hints: true, teachSwipe: true, changed: 10, spikes: 0, brainRunning: false, eyes: null };
    this.applySettings(false);
    this.director.startWallpaper();
    this.director.title = true;
  }

  get brain(): BrainDriver {
    return this.life.brain;
  }

  get screen(): ScreenId {
    return this.nav.current;
  }

  /** The fly's life stops while the pause menu (or anything opened from it) is open. */
  get paused() {
    return this.nav.stack.includes("pause");
  }

  // The Shell, for the screens.

  open(screen: ScreenId) {
    this.nav.push(screen);
    this.#entered();
  }

  back() {
    if (this.nav.pop()) this.#entered();
  }

  play() {
    if (this.nav.stack.includes("play")) while (this.nav.current !== "play") this.nav.pop();
    else this.nav.push("play");
    this.#entered();
  }

  watch() {
    this.play();
    this.#startWallpaper();
  }

  title() {
    this.nav.reset("title");
    this.#entered();
  }

  applySettings(save = true) {
    const s = this.settings;
    this.stage.setPixels(s.pixels);
    this.audio.setVolumes(s.effects, s.ambience);
    this.director.lively = s.wallpaperCamera === "lively";
    this.eyes.detail = s.eyes;
    if (save) saveSettings(s);
  }

  sound(sound: Sound) {
    this.audio.play(sound);
  }

  #entered() {
    const current = this.nav.current;
    if (current !== "play") this.screens[current].enter();
    this.#syncCamera();
    this.overlay.dirty = true;
  }

  #syncCamera() {
    const current = this.nav.current;
    // The title and what's opened from it (not from a game in play) keep the title's shot.
    this.director.title = this.#loading || (this.nav.stack[0] === "title" && !this.nav.stack.includes("play"));
    if (current === "title" || this.wallpaper) {
      if (!this.director.wallpaper) this.director.startWallpaper();
    } else if (!this.paused) {
      this.director.stopWallpaper();
      const view = this.hands.view;
      this.director.setView(view === "eyes" ? "follow" : (view as View));
    }
  }

  #startWallpaper() {
    if (this.wallpaper) return;
    this.wallpaper = true;
    this.hands.release();
    this.director.startWallpaper();
  }

  #stopWallpaper() {
    this.wallpaper = false;
    this.#syncCamera();
  }

  frame(dt: number, now: number) {
    const started = performance.now();
    this.time += dt;
    const { life, stage, director, remote } = this;

    // The brain waking: the loading screen until it has, then the title.
    if (this.#loading) {
      if (this.brain.status !== "loading" && this.#awakeAt < 0) this.#awakeAt = this.time;
      if (this.#awakeAt >= 0 && this.time - this.#awakeAt > (this.brain.status === "running" ? AWAKE_HOLD : 3)) {
        this.#loading = false;
        this.#entered();
      }
    }

    this.#input(dt);

    const paused = this.paused;
    if (!paused) {
      const playing = this.nav.current === "play" && !this.wallpaper;
      this.#copyEye();
      this.hands.update(dt, { use: false, holding: playing && remote.held.has("select"), eye: this.#eye }, life.body, life.pantry);
      this.#feel();
      this.eyes.beforeStep();
      life.step(dt, now);
      this.#reactions();
      this.#paddle(dt);
    }
    this.meter.update(life.brain, now);
    // Peaks of the brief things scripts wait for, held for a few seconds.
    const command = life.brain.state?.command;
    const rates = life.brain.state?.stats.rates;
    const fade = Math.exp(-dt / 3);
    this.peaks.escape = Math.max(this.peaks.escape * fade, command?.escape ?? 0);
    this.peaks.loom = Math.max(this.peaks.loom * fade, life.sensed.loomLeft, life.sensed.loomRight);
    this.peaks.looming = Math.max(this.peaks.looming * fade, rates?.["vision.looming left"] ?? 0, rates?.["vision.looming right"] ?? 0);
    this.fly.update(life.body, life.intent, life.eating, paused ? 0 : dt);
    director.update(life.body, dt);
    if (this.time > this.#clockAt) this.#followLight();
    stage.update(this.time, dt, director.camera);
    this.#clouds();
    this.fireflies.update(this.time, stage.light.stars, director.camera);
    this.#air.set(this.hands.air.x, this.hands.air.y, this.hands.air.z);
    const middle = this.#middle.set(life.body.position.x, life.body.position.y + 0.75, life.body.position.z);
    this.bubbles.update(this.time, paused ? 0 : dt, director.camera, stage.light.sunDirection, this.#air, middle);
    if (this.hands.ball.active) this.bubbles.popNear(this.hands.ball.position, BALL_RADIUS);
    for (let i = 0; i < this.bubbles.popped.length; i++) this.audio.play("pop", this.#nearness(this.bubbles.popped[i]) * 0.7, 0.9 + Math.random() * 0.3);
    this.handsView.opacity += ((this.nav.current === "play" && !this.wallpaper ? 1 : 0) - this.handsView.opacity) * Math.min(1, dt * 5);
    this.handsView.update(this.hands, life.pantry, director.camera, this.time, dt, (x, z) => life.world.heightAt(x, z));
    const near = Math.max(0, Math.min(1, 1 - (director.camera.position.distanceTo(this.fly.root.position) - 15) / 120));
    const wings = paused ? 0 : life.body.mode === "airborne" ? Math.max(0.15, life.intent.wings) : life.intent.wingPose * 0.6;
    this.audio.follow(wings, paused ? 0 : Math.abs(life.body.groundSpeed) / 12, near, dt);

    this.#overlay(dt);

    stage.beginFrame();
    stage.render(director.camera, dt);
    this.eyes.render(dt, this.#showEyes(), paused, this.hands.ball.active);
    stage.renderer.render(this.overlay.scene, this.overlay.camera);
    stage.measure();
    remote.endFrame();
    this.hands.clearEvents();
    (window as unknown as Record<string, unknown>)[AT_ROOT_PROPERTY] = this.#loading || this.nav.atRoot;
    this.frameMs = performance.now() - started;
    this.frameMsAverage += (this.frameMs - this.frameMsAverage) * 0.05;
    if (now - this.#datasetAt > 200) {
      this.#datasetAt = now;
      this.#publish();
    }
  }

  /** The player is looking through the fly's eyes. */
  #showEyes() {
    return this.hands.view === "eyes" && this.nav.current === "play" && !this.wallpaper;
  }

  #copyEye() {
    const c = this.director.camera.position;
    this.#eye.x = c.x;
    this.#eye.y = c.y;
    this.#eye.z = c.z;
  }

  /** What the hands and the world do to the fly this frame, for its senses. */
  #feel() {
    const { stimuli } = this.life;
    const hands = this.hands;
    // The feather, or a bubble that burst on it last frame.
    stimuli.stroke = Math.max(hands.stroke, this.bubbles.brushed);
    stimuli.air = hands.air;
    // Things that could loom: the ball and the bubbles.
    stimuli.looming.length = 0;
    stimuli.looming.push(hands.looming[0]);
    for (const b of this.bubbles.looming) stimuli.looming.push(b);
    stimuli.threat = hands.ball.active ? hands.ball.position : null;
  }

  #reactions() {
    const { life } = this;
    const ev = life.body.events;
    if (ev.jumped) this.audio.play("takeoff", this.#nearness(life.body.position));
    if (ev.landed) this.audio.play("land", this.#nearness(life.body.position) * 0.5);
    if (life.meals > this.#lastMeals) this.audio.play("eat", this.#nearness(life.body.position));
    this.#lastMeals = life.meals;
    const he = this.hands.events;
    if (he.dropped) this.audio.play("drop");
    if (he.landed) this.audio.play("land", 0.6);
    if (he.swooped) this.audio.play("swoop");
  }

  /** Sets the light to the Light tool's choice; on "Now", to the time outside, looked at again every half minute. */
  #followLight() {
    const chosen = this.hands.timeOfDay;
    this.stage.setTime(chosen === "clock" ? timeFromClock(new Date()) : chosen);
    this.#clockAt = this.time + 30;
  }

  /**
   * Now and then by day a cloud passes over the sun: the sunlight dims by a
   * fifth over a few seconds and comes back. The fly's eyes see it as they see
   * everything else.
   */
  #clouds() {
    const t = this.time;
    // Two slow waves beating together: a cloud only where both are high, a minute or two apart.
    const cover = Math.max(0, Math.sin(t * 0.071) * Math.sin(t * 0.0237 + 1.3) - 0.55) / 0.45;
    const day = 1 - Math.min(1, this.stage.light.stars * 2);
    this.stage.sun.intensity = this.stage.light.sunIntensity * (1 - cover * cover * 0.2 * day);
  }

  /** A fly walking, landing or drinking in the pool of lemonade sets rings spreading on it. */
  #paddle(dt: number) {
    this.#paddleIn -= dt;
    const food = this.life.senses.tasting.food;
    if (food?.name !== "lemonade" || this.#paddleIn > 0) return;
    const body = this.life.body;
    const moving = Math.abs(body.groundSpeed) > 0.5 || Math.abs(body.turnRate) > 0.3;
    if (!moving && !this.life.eating && !body.events.landed) return;
    this.stage.table.ripple(body.position.x, body.position.z, body.events.landed ? 1 : moving ? 0.45 : 0.2);
    this.#paddleIn = moving ? 0.45 : 1.4;
  }

  /** 1 close to the camera, falling off with distance. */
  #nearness(p: { x: number; y: number; z: number }) {
    const c = this.director.camera.position;
    const d = Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z);
    return Math.max(0.05, Math.min(1, 40 / Math.max(1, d)));
  }

  #input(dt: number) {
    const remote = this.remote;
    const pressed = remote.presses.length > 0 || remote.touch.touching;
    if (pressed) this.audio.start(this.settings.effects, this.settings.ambience);
    const idle = (performance.now() - remote.lastInputAt) / 1000;
    const after = this.settings.wallpaperAfter;
    const current = this.nav.current;

    if (this.wallpaper) {
      if (pressed) {
        // Any press brings the controls back, and does nothing else.
        this.#stopWallpaper();
        remote.presses.length = 0;
        remote.dx = 0;
        remote.dy = 0;
      }
    } else if (!this.#loading && after > 0 && idle > after && (current === "play" || current === "title")) {
      this.#startWallpaper();
    }
    this.uiAlpha += ((this.wallpaper ? 0 : 1) - this.uiAlpha) * Math.min(1, dt * (this.wallpaper ? 1.2 : 6));

    if (this.#loading) {
      remote.presses.length = 0;
      return;
    }
    for (const press of remote.presses) {
      const screen = this.nav.current;
      if (screen === "play") this.#playPress(press.button, press.repeat);
      else if (press.button === "playPause" && this.paused && !press.repeat) {
        // Play/Pause carries on from anywhere in the pause menu, as on any TV.
        this.audio.play("select");
        this.play();
      } else this.screens[screen].press(press.button, press.repeat);
    }
    if (this.nav.current === "play" && (remote.dx !== 0 || remote.dy !== 0)) this.#movePointer(remote.dx, remote.dy);
  }

  #playPress(button: RemoteButton, repeat: boolean) {
    const hands = this.hands;
    switch (button) {
      case "left":
      case "right":
        hands.stepTool(button === "left" ? -1 : 1);
        this.audio.play("tool");
        this.#changedAt = this.time;
        break;
      case "up":
      case "down":
        // Up goes to the earlier kind in the list, as a list reads top to bottom.
        if (hands.stepVariant(button === "up" ? -1 : 1)) this.#variantChanged();
        else if (!repeat) this.audio.play("blocked");
        break;
      case "select":
        if (repeat) break;
        if (hands.current.id === "light" || hands.current.id === "view") {
          // Select steps round the times of day or the views, for a remote held in one hand.
          hands.variants[hands.tool] = (hands.variants[hands.tool] + 1) % hands.current.variants.length;
          this.#variantChanged();
        } else {
          this.#copyEye();
          hands.update(0, { use: true, holding: true, eye: this.#eye }, this.life.body, this.life.pantry);
          if (hands.events.blocked) this.audio.play("blocked");
        }
        break;
      case "back":
      case "playPause":
        if (repeat) break;
        this.audio.play("open");
        this.open("pause");
        break;
    }
  }

  #variantChanged() {
    this.audio.play("tick");
    this.#changedAt = this.time;
    if (this.hands.current.id === "light") this.#followLight();
    if (this.hands.current.id === "view") this.#syncCamera();
  }

  /** The finger moved on the touch surface: the pointer moves the same way across the screen, staying on the world. */
  #movePointer(dx: number, dy: number) {
    this.#touched = true;
    const camera = this.director.camera;
    const p = this.hands.pointer;
    const ndc = this.#ndc.set(p.x, p.y, p.z).project(camera);
    ndc.x = Math.max(-0.97, Math.min(0.97, ndc.x + dx * SWIPE_GAIN));
    ndc.y = Math.max(-0.95, Math.min(0.9, ndc.y + dy * SWIPE_GAIN * 1.2));
    this.#ray.setFromCamera(this.#ndc2.set(ndc.x, ndc.y), camera);
    const hit = this.life.world.raycast(this.#ray.ray.origin, this.#ray.ray.direction, this.#hit);
    if (hit) this.hands.movePointer(hit.point, hit.normal);
  }

  #overlay(dt: number) {
    const overlay = this.overlay;
    overlay.material.opacity = this.uiAlpha;
    const current = this.#loading ? "loading" : this.nav.current;
    if (current !== this.#lastScreen) {
      this.#lastScreen = current;
      overlay.dirty = true;
    }
    if (current === "loading") {
      overlay.dirty = true;
      overlay.redraw(dt, (g) => drawLoading(g, this.time, this.brain));
      return;
    }
    if (this.uiAlpha < 0.01) return;
    const stats = this.settings.stats;
    if (current === "play") {
      const life = this.life;
      const hud = this.#hud;
      hud.activity = life.activity;
      hud.food = life.senses.tasting.food?.name ?? null;
      hud.hints = this.settings.hints;
      hud.teachSwipe = !this.#touched;
      hud.changed = this.time - this.#changedAt;
      hud.spikes = this.meter.spikesPerSecond;
      hud.brainRunning = this.brain.status === "running";
      if (this.#showEyes()) {
        const e = this.#eyesInfo;
        e.facets = this.eyes.facets;
        e.standIn = this.eyes.standIn;
        e.ms = this.eyes.costMs;
        e.calls = this.eyes.costCalls;
        hud.eyes = e;
      } else hud.eyes = null;
      const k = this.#hudKey;
      const changed = k.tool !== this.hands.tool || k.variant !== this.hands.variants[this.hands.tool] || k.activity !== hud.activity || k.food !== hud.food || k.following !== this.hands.following || k.touched !== this.#touched || k.hints !== hud.hints || k.eyes !== !!hud.eyes;
      if (changed || hud.changed < 0.3 || this.time - this.#hudAt > 1 / HUD_SHIMMER_FPS) {
        k.tool = this.hands.tool;
        k.variant = this.hands.variants[this.hands.tool];
        k.activity = hud.activity;
        k.food = hud.food;
        k.following = this.hands.following;
        k.touched = this.#touched;
        k.hints = hud.hints;
        k.eyes = !!hud.eyes;
        this.#hudAt = this.time;
        overlay.dirty = true;
      }
      overlay.redraw(dt, (g) => {
        drawHud(g, this.time, hud);
        if (stats) drawStats(g, this);
      });
      return;
    }
    const screen = this.screens[current];
    if (screen.update(dt)) overlay.dirty = true;
    overlay.redraw(dt, (g) => {
      screen.draw(g, this.time);
      if (stats) drawStats(g, this);
    });
  }

  /** The game's state on the canvas, for scripts and tests to wait on. */
  #publish() {
    const d = this.canvas.dataset;
    if (!d) return;
    const { life } = this;
    const s = life.sensed;
    d.screen = this.#loading ? "loading" : this.nav.current;
    d.stack = this.nav.stack.join(">");
    const shown = this.nav.current;
    const menu = shown === "play" ? null : (this.screens[shown] as { menu?: { focused?: { id: string } } }).menu;
    d.focus = menu?.focused?.id ?? "";
    d.atRoot = String((window as unknown as Record<string, unknown>)[AT_ROOT_PROPERTY]);
    d.wallpaper = String(this.wallpaper);
    d.brain = life.brain.status;
    d.neurons = String(life.brain.neurons);
    d.activity = life.activity;
    d.mode = life.body.mode;
    d.tool = this.hands.current.id;
    d.variant = this.hands.variant.id;
    d.pointer = this.hands.following ? "following" : "free";
    d.senses = `loom ${s.loomLeft.toFixed(2)}/${s.loomRight.toFixed(2)} touch ${s.touch.toFixed(2)} bump ${s.bumpLeft.toFixed(2)}/${s.bumpRight.toFixed(2)} wind ${s.wind.toFixed(2)} sweet ${s.sweet.toFixed(2)} grounded ${s.grounded ? 1 : 0}`;
    d.loom = Math.max(s.loomLeft, s.loomRight).toFixed(3);
    d.touch = s.touch.toFixed(3);
    d.wind = s.wind.toFixed(3);
    d.sweet = s.sweet.toFixed(3);
    d.eaten = life.eaten.toFixed(3);
    d.meals = String(life.meals);
    d.food = String(life.pantry.foods.filter((f) => f.kind !== "patch").length);
    d.takeoffs = String(life.takeOffs);
    d.escape = (life.brain.state?.command.escape ?? 0).toFixed(3);
    d.escapePeak = this.peaks.escape.toFixed(3);
    d.loomPeak = this.peaks.loom.toFixed(3);
    d.loomingHz = this.peaks.looming.toFixed(1);
    d.feed = (life.brain.state?.command.feed ?? 0).toFixed(3);
    d.eyes = this.eyes.inUse ? "brain" : this.eyes.active ? "picture" : "off";
    d.calls = String(this.stage.cost.calls);
    d.triangles = String(this.stage.cost.triangles);
    d.frameMs = this.frameMsAverage.toFixed(2);
    d.eyesMs = this.eyes.costMs.toFixed(2);
    d.spikesPerSecond = String(Math.round(this.meter.spikesPerSecond));
    d.time = this.stage.light.time;
    d.view = this.hands.view;
  }
}
