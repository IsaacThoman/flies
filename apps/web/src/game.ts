// The game: the world and the fly's life in it, the camera, the tools in the
// player's hands and the menus, put together frame by frame, on a screen of
// whatever shape.
//
// What the player holds is read each frame: the remote's buttons and touch
// surface (and a keyboard's keys and a pad's buttons, which are the same
// buttons); and a pointer, which points at the screen itself. A pointer's
// press goes to whatever was drawn under it (the hit map the overlay keeps),
// else, in play, to the world: the table, where a tool is used, or the air
// round it, which turns the camera.

import * as THREE from "three";
import type { BrainDriver, RemoteButton, WeatherAttribution } from "@fly/contracts";
import { AT_ROOT_PROPERTY } from "@fly/contracts";
import { Navigator } from "@fly/ui";
import type { GlyphSet, Hit } from "@fly/ui";
import { World, isDropped } from "@fly/world";
import type { RayHit } from "@fly/world";
import { Audio } from "./audio/sounds.ts";
import type { Sound } from "./audio/sounds.ts";
import { BrainMeter } from "./brain/meter.ts";
import { CameraDirector, NEAR_TO_FAR } from "./camera.ts";
import type { View } from "./camera.ts";
import { TV_FRAME } from "./display.ts";
import type { Display, Frame } from "./display.ts";
import { Eyes } from "./eyes/eyes.ts";
import { EyesInset, insetWanted } from "./eyes/inset.ts";
import { FlyView } from "./fly-view.ts";
import type { Devices, Gamepads, Gesture, Keyboard, Pointers, Remote } from "./input.ts";
import { Life } from "./life.ts";
import { isPlaceId, nextPlace, placeInfo } from "./places/catalog.ts";
import type { PlaceId } from "./places/catalog.ts";
import { SCENES } from "./places/index.ts";
import type { Around, Felt } from "./places/types.ts";
import { Bubbles } from "./scene/bubbles.ts";
import { Fireflies } from "./scene/fireflies.ts";
import { clockHours, timeAt } from "./scene/light.ts";
import { Outside, nativeWeather } from "./scene/outside.ts";
import { forecastHours } from "./scene/weather.ts";
import { cheaperEyes, cheaperPixels } from "./quality.ts";
import type { Quality } from "./quality.ts";
import { KEPT, loadLearned, loadSettings, loadShelf, saveLearned, saveSettings, saveShelf } from "./settings.ts";
import type { Learned, Lesson, Settings, ShelfChoices } from "./settings.ts";
import { Stage } from "./stage.ts";
import { aimAt } from "./tools/aim.ts";
import { BALL_RADIUS, Hands, SWOOP_BEARING, TOOLS } from "./tools/hands.ts";
import { HandsView } from "./tools/view.ts";
import { HUD_HITS, drawHud } from "./ui/hud.ts";
import type { HudState } from "./ui/hud.ts";
import { hudLayout, loadingLayout, playRoom, titleLayout, touchSlop } from "./ui/layout.ts";
import type { HudLayout, LoadingLayout } from "./ui/layout.ts";
import { LOADING_HITS, arriving, drawLoading } from "./ui/loading.ts";
import { Overlay } from "./ui/overlay.ts";
import { AboutScreen } from "./ui/screens/about.ts";
import { BrainScreen } from "./ui/screens/brain.ts";
import { pauseScreen, settingsPages, settingsScreen, titleScreen } from "./ui/screens/menus.ts";
import type { Point, Screen, ScreenId, Shell } from "./ui/screens/types.ts";
import { drawStats } from "./ui/stats.ts";

/** Seconds the loading screen stays after the brain wakes, so "Awake!" is seen; longer when it has more to say. */
const AWAKE_HOLD = 1.2;
const AWAKE_HOLD_NOTE = 4;
/** Hidden longer than this (ms), the page wakes with the sky and the weather where the clock has them now, not easing there. */
const AWAY_SETTLE_MS = 30_000;
/** How sensitive the touch surface is: screen widths per full swipe. */
const SWIPE_GAIN = 0.9;
/** How often the HUD redraws for its shimmer alone, per second. */
const HUD_SHIMMER_FPS = 10;
/** Seconds of wallpaper in one place before the fly moves on, when it lives in each in turn. */
const PLACE_TURN = 20 * 60;
/** Seconds the world takes to fade out before the fly is carried somewhere else, and to fade in after. */
const VEIL_OUT = 0.45;
const VEIL_IN = 0.9;
/** Seconds without a press before the place's comings and goings start, when the wallpaper hasn't already. */
const QUIET_AFTER = 60;
/** How often the clock, the forecast and the weather outside are looked at again, s: the light moves on that slowly. */
const CLOCK_EVERY = 2;
/** Seconds of tickling or blowing that teach holding Select, longer than a press. */
const HOLD_TAUGHT = 0.5;
/** Turning the camera by hand: radians round the fly for a drag the screen's width, and up for one its height. */
const LOOK_ROUND = 3;
const LOOK_UP = 1.6;
/** A trackpad's scroll: CSS pixels for a step to the next view; radians round per pixel across. */
const SCROLL_STEP = 140;
const SCROLL_ROUND = 0.006;
/** A wheel or trackpad left alone this long (s) has let go of the camera. */
const WHEEL_IDLE = 0.3;
/** A swipe along the tool's label this far (design units) steps its kind. */
const LABEL_SWIPE = 36;
/** A pad's right stick at full tilt: radians a second round the fly, and up. */
const PAD_ROUND = 2.4;
const PAD_UP = 1.2;

type MenuScreenId = Exclude<ScreenId, "play">;

/** What the browser's own inputs are, beside the remote: none on the Apple TV. */
export type Inputs = { devices: Devices; pointers?: Pointers; keyboard?: Keyboard; pads?: Gamepads };

/** What a pointer pressed on, until it lets go: a target drawn on screen, the table (with the tool), the air (the camera), or nothing it may act on. */
type Grip =
  | { kind: "screen"; hit: Hit | null; x: number; y: number }
  | { kind: "hud"; hit: Hit; x: number; swiped: number }
  | { kind: "tool"; touch: boolean; use: boolean; holding: boolean }
  | { kind: "look"; x: number; y: number }
  | { kind: "spent" };

export class Game implements Shell {
  readonly canvas: HTMLCanvasElement;
  readonly remote: Remote;
  readonly display: Display;
  readonly devices: Devices;
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
  readonly inset: EyesInset;
  readonly fireflies: Fireflies;
  /** The real weather outside, where the Apple TV can tell it; scripts feed it in a browser (`outside.feed`). */
  readonly outside = new Outside(nativeWeather());
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
  /** In a browser, what this device can afford to draw (quality.ts); null on the Apple TV, which is drawn as it is. */
  quality: Quality | null = null;
  /** The graphics context was lost, and nothing can be drawn until it is restored. */
  glLost = false;
  /** Recent peaks of the giant fibre's escape command, the hand-wired loom, and the eyes' looming detectors (Hz). */
  readonly peaks = { escape: 0, loom: 0, looming: 0 };
  #loading = true;
  #ready = false;
  #awakeAt = -1;
  #datasetAt = 0;
  /** What the HUD last drew, to tell when it needs drawing again. */
  #hudKey = { tool: -1, variant: -1, activity: "", food: null as string | null, following: false, touched: false, hints: false, eyes: false, taught: -1 };
  #hudAt = 0;
  #changedAt = -10;
  #touched = false;
  #lastMeals = 0;
  #paddleIn = 0;
  #clockAt = 0;
  #air = new THREE.Vector3();
  /** What the place's own goings-on did to the fly this frame, and what they are given. */
  #felt: Felt = { air: { x: 0, y: 0, z: 0 }, touch: 0, looming: [] };
  #around: { -readonly [K in keyof Around]: Around[K] };
  #puff = { x: 0, y: 0, z: 0 };
  #middle = new THREE.Vector3();
  #floorAt = (x: number, z: number) => this.life.world.heightAt(x, z);
  #ndc = new THREE.Vector3();
  #ndc2 = new THREE.Vector2();
  #ray = new THREE.Raycaster();
  #hit: RayHit = { point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, solid: -1, t: 0 };
  #eye = { x: 0, y: 0, z: 0 };
  #lastScreen: ScreenId | "loading" = "loading";
  #lastNow = -1;
  #qualitySeen = 0;
  /** The pixels and eyes last chosen in Settings, to tell when the player changes them. */
  #chosen: { pixels: string; eyes: string } = { pixels: "", eyes: "" };
  #touchWas = false;
  #hud: HudState;
  #eyesInfo = { facets: 0, standIn: false, off: false };
  /** Where the fly is now. */
  #here: PlaceId;
  /** Being carried to another place: where, and seconds since the veil began to fall. */
  #moving: { to: PlaceId; t: number; arrived: boolean } | null = null;
  /** Seconds of wallpaper spent where it is now. */
  #stayed = 0;
  /** The shelf's choices a launch comes back to, as saved. */
  #shelf: ShelfChoices;
  /** What the hints have taught, as saved; and how many times that has changed, for the HUD to redraw. */
  #learned: Learned = loadLearned();
  #taught = 0;
  /** Seconds Select has been tickling or blowing. */
  #held = 0;
  /** Button hints as last applied: turned on again, they teach everything again. */
  #hints = true;
  /** The weather outside's state when last logged. */
  #outsideState = "";
  readonly #inputs: Inputs;
  /** Where things go on this screen, laid out again when it changes shape. */
  #hudLayout: HudLayout;
  #loadingLayout: LoadingLayout;
  #frameVersion = -1;
  /** The pointer: what it pressed on; where it points in the world, if it is pointing at it (a hovering mouse, a finger on the table); the gesture as the screens see it. */
  #grip: Grip | null = null;
  readonly #aim = { x: 0, y: 0, active: false, moved: false, onWorld: false };
  readonly #point: Point = { type: "hover", x: 0, y: 0, tap: false, dx: 0, dy: 0, hit: null };
  /** The wheel: seconds since it last moved the camera, how far a trackpad has scrolled toward the next view, or over the HUD toward the next tool or kind, and when it last did. */
  #wheelIdle = -1;
  #scrolled = 0;
  #hudScrolled = 0;
  #hudScrolledAt = 0;
  /** A pad's right stick is turning the camera. */
  #padLooking = false;
  #cursor = "";
  #seenInput = 0;
  #glyphsDrawn: GlyphSet | null | undefined = undefined;
  readonly #titleItems: number;

  constructor(canvas: HTMLCanvasElement, remote: Remote, brain: BrainDriver, display: Display, inputs: Inputs) {
    this.canvas = canvas;
    this.remote = remote;
    this.display = display;
    this.devices = inputs.devices;
    this.#inputs = inputs;
    this.settings = loadSettings();
    const place = this.settings.place;
    this.#here = place !== "turns" && isPlaceId(place) ? place : isPlaceId(this.settings.scene) ? this.settings.scene : "picnic";
    const scene = SCENES[this.#here];
    const world = new World(scene.place);
    this.#shelf = loadShelf(Date.now());
    this.hands = new Hands(world, this.#shelf);
    // The light and the weather are already as chosen, or as the clock (and an answer kept from the
    // last run, if it is still fresh) has them, when the game appears.
    this.outside.enabled = this.settings.realWeather;
    this.outside.update(Date.now(), true);
    const time = this.hands.timeOfDay;
    this.stage = new Stage(canvas, time === "clock" ? timeAt(this.outside.lightHours(clockHours(new Date()))) : time, scene);
    this.#followLight(true);
    this.fireflies = new Fireflies(this.stage.scene);
    this.life = new Life(world, brain);
    this.fly = new FlyView(this.stage.scene, world);
    this.director = new CameraDirector(world, display.frame.aspect, scene.camera);
    this.bubbles = new Bubbles(this.stage.scene, world);
    this.handsView = new HandsView(this.stage.scene);
    this.eyes = new Eyes(this.stage, this.life);
    this.#around = { fly: this.life.body.position, airborne: false, world, pantry: this.life.pantry, weather: this.stage.weather, quiet: false, felt: this.#felt };
    this.eyes.see(this.bubbles.mesh);
    for (const object of this.handsView.seen) this.eyes.see(object);
    this.inset = new EyesInset(this.eyes);
    this.overlay.scene.add(this.inset.mesh);
    this.#settle();
    const title = titleScreen(this);
    this.#titleItems = title.menu.items.length;
    this.screens = {
      title,
      pause: pauseScreen(this),
      settings: settingsScreen(this),
      ...settingsPages(this),
      about: new AboutScreen(this),
      brain: new BrainScreen(this),
    };
    this.#hudLayout = hudLayout(display.frame);
    this.#loadingLayout = loadingLayout(display.frame);
    this.#hud = { hands: this.hands, here: this.#here, activity: "waiting", food: null, hints: true, glyphs: this.glyphs, learned: this.#learned, teachSwipe: true, changed: 10, spikes: 0, brainRunning: false, eyes: null, layout: this.#hudLayout };
    this.#hints = this.settings.hints;
    // Nothing points on the Apple TV: nothing to record.
    this.overlay.hits.enabled = !!inputs.pointers;
    this.#applyFrame();
    this.applySettings(false);
    this.director.startWallpaper();
    this.director.title = true;
  }

  /** The screen's shape. */
  get shape(): Frame {
    return this.display.frame;
  }

  /** Whose buttons the hints show: the remote's, a keyboard's or a pad's; none for a pointer, where the screen is the affordance. */
  get glyphs(): GlyphSet | null {
    const d = this.devices.current;
    return d === "remote" ? "remote" : d === "keys" ? "keys" : d === "pad" ? "pad" : null;
  }

  /** Lays everything out for the screen's shape, if it has changed: nothing in the world is built again. */
  #applyFrame() {
    if (this.display.version === this.#frameVersion) return;
    const first = this.#frameVersion < 0;
    this.#frameVersion = this.display.version;
    const frame = this.display.frame;
    // The Apple TV's frame is the one everything starts in: nothing to resize there.
    if (frame !== TV_FRAME) {
      this.stage.resize(frame);
      this.overlay.resize(frame);
      this.director.setAspect(frame.aspect);
    }
    this.#hudLayout = hudLayout(frame);
    this.#hud.layout = this.#hudLayout;
    this.#loadingLayout = loadingLayout(frame);
    this.eyes.layout(frame, this.#hudLayout);
    this.inset.layout(frame, this.#hudLayout);
    if (!first) for (const screen of Object.values(this.screens)) screen.layout(frame);
    this.#frameRoom();
    this.overlay.dirty = true;
  }

  /** Where the camera leaves the fly on the title and the loading screen, clear of what is drawn there. */
  #frameRoom() {
    const room = this.director.room;
    const fly = this.#loading ? this.#loadingLayout.fly : titleLayout(this.shape, this.#titleItems).fly;
    room.across = fly.across;
    room.low = fly.low;
    const play = playRoom(this.shape);
    room.lower = play.lower;
    room.wider = play.wider;
  }

  get brain(): BrainDriver {
    return this.life.brain;
  }

  get weatherOutside() {
    return this.outside.available;
  }

  weatherAttribution(): WeatherAttribution | null {
    return this.outside.attribution();
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
    if (s.place !== "turns" && isPlaceId(s.place) && s.place !== this.#here) this.moveTo(s.place);
    // The player chose a picture: take it at its word until the device shows it can't keep up.
    if (save && this.quality && (s.pixels !== this.#chosen.pixels || s.eyes !== this.#chosen.eyes)) this.quality.reset();
    this.#chosen.pixels = s.pixels;
    this.#chosen.eyes = s.eyes;
    this.#applyPicture();
    this.audio.setVolumes(s.effects, s.ambience);
    this.director.wallpaperStyle = s.wallpaperCamera;
    if (s.hints && !this.#hints) this.#unlearn();
    this.#hints = s.hints;
    if (this.outside.enabled !== s.realWeather) {
      this.outside.enabled = s.realWeather;
      this.#clockAt = 0;
    }
    if (save) saveSettings(s);
  }

  /** The pixels and eyes the player chose, or cheaper ones if this device can't afford them. */
  #applyPicture() {
    const s = this.settings;
    const limit = this.quality?.current;
    const pixels = limit ? cheaperPixels(s.pixels, limit.pixels) : s.pixels;
    if (pixels !== this.stage.pixels) this.stage.setPixels(pixels);
    this.eyes.detail = limit ? cheaperEyes(s.eyes, limit.eyes) : s.eyes;
    this.eyes.rate = limit?.eyesRate ?? 1;
    this.#qualitySeen = this.quality?.changes ?? 0;
  }

  /** Tries the brain again after it failed: on the player's say-so, or (`network`) when the network comes back. */
  retryBrain(network = false) {
    const brain = this.brain;
    if (!arriving(brain) || brain.status !== "failed") return;
    if (network && brain.failure !== "offline" && brain.failure !== "download") return;
    brain.retry();
    this.#awakeAt = -1;
    this.overlay.dirty = true;
  }

  /** The page is hidden: the fly's life stops with the frames, and the sound with it. */
  sleep() {
    this.audio.sleep();
  }

  /** The page is back after `awayMs`: everything carries on from where it was, under the sky of the hour it is now. */
  wake(awayMs: number) {
    this.audio.wake();
    this.#lastNow = -1;
    if (awayMs > AWAY_SETTLE_MS) {
      const now = new Date();
      if (this.hands.timeOfDay === "clock") this.stage.light.follow(clockHours(now), true);
      if (this.hands.weather === "now") this.stage.weather.follow(forecastHours(now), true);
    }
    this.overlay.dirty = true;
  }

  contextLost() {
    this.glLost = true;
  }

  /** three.js rebuilds its own state; what was drawn into textures (the reflections) has to be drawn again. */
  contextRestored() {
    this.glLost = false;
    this.stage.contextRestored();
    this.eyes.contextRestored();
    this.overlay.dirty = true;
  }

  sound(sound: Sound) {
    this.audio.play(sound);
  }

  /** Carries the fly to another place: the world fades out, the place is built behind the veil, and fades in. */
  moveTo(id: PlaceId) {
    if (id === this.#here || this.#moving?.to === id) return;
    // From however dark the veil already is.
    this.#moving = { to: id, t: this.stage.veil * VEIL_OUT, arrived: false };
  }

  /** The veil over the world while the fly is carried somewhere else, and the moment it arrives. */
  #move(dt: number) {
    const moving = this.#moving;
    if (!moving) return;
    moving.t += dt;
    if (!moving.arrived && moving.t >= VEIL_OUT) {
      // Black now: build the place. This frame is long (it is all JavaScript), and nobody sees it.
      this.stage.veil = 1;
      this.#arrive(moving.to);
      moving.arrived = true;
      moving.t = VEIL_OUT;
      return;
    }
    const k = moving.arrived ? 1 - (moving.t - VEIL_OUT) / VEIL_IN : moving.t / VEIL_OUT;
    this.stage.veil = Math.max(0, Math.min(1, k * k * (3 - 2 * k)));
    if (moving.arrived && moving.t >= VEIL_OUT + VEIL_IN) {
      this.stage.veil = 0;
      this.#moving = null;
    }
  }

  #arrive(id: PlaceId) {
    const scene = SCENES[id];
    this.#here = id;
    this.#stayed = 0;
    this.stage.load(scene);
    this.life.move(scene.place);
    this.hands.clear();
    this.director.useScene(scene.camera);
    this.#settle();
    this.settings.scene = id;
    saveSettings(this.settings);
  }

  /** Everything that follows the place the fly is in, besides the world and the stage. */
  #settle() {
    const scene = this.stage.current;
    for (const object of this.stage.set.seen) this.eyes.see(object);
    this.bubbles.enabled = scene.bubbles;
    this.fireflies.enabled = scene.fireflies;
    this.audio.setAmbience(scene.ambience);
    this.hands.surface = placeInfo(scene.id).surface;
    this.hands.choosePlace(scene.id);
    this.overlay.dirty = true;
  }

  #entered() {
    const current = this.nav.current;
    if (current !== "play") this.screens[current].enter();
    this.#frameRoom();
    this.#syncCamera();
    this.#grip = this.#grip && { kind: "spent" };
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
    if (this.display.update()) this.#applyFrame();

    // The brain waking: the loading screen until it has, then the title. A brain
    // that can be tried again (in a browser) keeps its failure on screen until it is.
    const brain = this.brain;
    if (!this.#loading && brain.status === "failed" && arriving(brain)) {
      this.#loading = true;
      this.#awakeAt = -1;
      // A finger already down isn't "Try again".
      this.#touchWas = remote.touch.touching;
      this.#syncCamera();
    }
    if (this.#loading) {
      if (brain.status !== "loading" && this.#awakeAt < 0) this.#awakeAt = this.time;
      const hold = brain.status === "running" ? (arriving(brain) && brain.source.storageFull ? AWAKE_HOLD_NOTE : AWAKE_HOLD) : arriving(brain) ? Infinity : 3;
      if (this.#awakeAt >= 0 && this.time - this.#awakeAt > hold) {
        this.#loading = false;
        this.#entered();
        // Asked once the title is up, not over the loading screen: the first time, the TV asks whether it may know where it is.
        this.outside.begin();
      }
    }

    this.#input(dt);
    this.#move(dt);
    // Living in each place in turn, it moves on during a long wallpaper.
    if (this.wallpaper && !this.#moving) {
      this.#stayed += dt;
      if (this.settings.place === "turns" && this.#stayed > PLACE_TURN && nextPlace(this.#here) !== this.#here) this.moveTo(nextPlace(this.#here));
    }

    const paused = this.paused;
    if (!paused) {
      const playing = this.nav.current === "play" && !this.wallpaper;
      this.#copyEye();
      const grip = this.#grip;
      const holding = remote.held.has("select") || (grip?.kind === "tool" && grip.holding);
      this.hands.update(dt, { use: false, holding: playing && holding, eye: this.#eye }, life.body, life.pantry);
      // Holding Select is taught by holding it: a finger or a mouse button held teaches the remote nothing.
      this.#held = (this.hands.stroking || this.hands.blowing) && remote.held.has("select") ? this.#held + dt : 0;
      if (this.#held > HOLD_TAUGHT) this.#learn(this.hands.current.id);
      this.#live(dt);
      this.#feel();
      this.eyes.beforeStep();
      life.step(dt, now);
      this.#reactions();
      this.#paddle(dt);
    }
    this.meter.update(life.brain, now);
    if (this.quality) {
      // Loading, the pause menu and the building of a place aren't this device's everyday pace.
      const steady = !this.#loading && !paused && !this.#moving && this.#lastNow >= 0;
      this.quality.frame(steady ? now - this.#lastNow : 0, steady && life.brain.status === "running" ? this.meter.speed : -1);
      if (this.quality.changes !== this.#qualitySeen) this.#applyPicture();
    }
    this.#lastNow = now;
    // Peaks of the brief things scripts wait for, held for a few seconds.
    const command = life.brain.state?.command;
    const rates = life.brain.state?.stats.rates;
    const fade = Math.exp(-dt / 3);
    this.peaks.escape = Math.max(this.peaks.escape * fade, command?.escape ?? 0);
    this.peaks.loom = Math.max(this.peaks.loom * fade, life.sensed.loomLeft, life.sensed.loomRight);
    this.peaks.looming = Math.max(this.peaks.looming * fade, rates?.["vision.looming left"] ?? 0, rates?.["vision.looming right"] ?? 0);
    this.fly.update(life.body, life.intent, life.eating, paused ? 0 : dt);
    // With the ball in hand, the camera stands where its dive will be seen: across the fly from where it comes.
    director.prefer = this.hands.current.id === "swoop" && this.nav.current === "play" && !this.wallpaper ? Math.PI - SWOOP_BEARING : null;
    director.update(life.body, dt);
    if (this.time > this.#clockAt) this.#followLight();
    stage.update(this.time, dt, director.camera);
    this.#clouds();
    // Fireflies shelter from the rain.
    this.fireflies.update(this.time, stage.light.stars * (1 - stage.weather.rain), director.camera);
    this.#air.set(this.hands.air.x + this.#felt.air.x, this.hands.air.y + this.#felt.air.y, this.hands.air.z + this.#felt.air.z);
    this.bubbles.rain = stage.weather.rain;
    const middle = this.#middle.set(life.body.position.x, life.body.position.y + 0.75, life.body.position.z);
    this.bubbles.update(this.time, paused ? 0 : dt, director.camera, stage.light.sunDirection, this.#air, middle);
    if (this.hands.ball.active) this.bubbles.popNear(this.hands.ball.position, BALL_RADIUS);
    for (let i = 0; i < this.bubbles.popped.length; i++) this.audio.play("pop", this.#nearness(this.bubbles.popped[i]) * 0.7, 0.9 + Math.random() * 0.3);
    this.handsView.opacity += ((this.nav.current === "play" && !this.wallpaper ? 1 : 0) - this.handsView.opacity) * Math.min(1, dt * 5);
    this.handsView.update(this.hands, life.pantry, director.camera, this.time, dt, this.#floorAt, life.body.position);
    const near = Math.max(0, Math.min(1, 1 - (director.camera.position.distanceTo(this.fly.root.position) - 15) / 120));
    const wings = paused ? 0 : life.body.mode === "airborne" ? Math.max(0.15, life.intent.wings) : life.intent.wingPose * 0.6;
    this.audio.follow(wings, paused ? 0 : Math.abs(life.body.groundSpeed) / 12, near, dt);
    this.audio.weather(stage.weather.rain, Math.hypot(this.#felt.air.x, this.#felt.air.z), stage.light.stars);

    this.#overlay(dt);

    // With the graphics context lost there is nothing to draw into: the fly lives on, unseen, until it is back.
    if (!this.glLost) {
      stage.beginFrame();
      stage.render(director.camera, dt);
      const showEyes = this.#showEyes();
      this.inset.update(dt, insetWanted(this.settings.eyesInset, this.#loading ? "loading" : this.nav.current, this.wallpaper, showEyes, this.eyes.detail === "off"), this.wallpaper, director.shotChanges);
      this.eyes.render(dt, showEyes, paused, this.hands.ball.active, this.inset.watching);
      stage.renderer.render(this.overlay.scene, this.overlay.camera);
      if (!this.#ready) {
        // The TV's splash can give way once both the world and its loading panel are drawn.
        this.canvas.dataset.ready = "true";
        this.#ready = true;
      }
      stage.measure();
    }
    remote.endFrame();
    this.#inputs.pointers?.endFrame();
    this.#inputs.keyboard?.endFrame();
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

  /** The place's own goings-on this frame (wind, rain, visitors): what they do to the fly is left in #felt. */
  #live(dt: number) {
    const felt = this.#felt;
    felt.air.x = 0;
    felt.air.y = 0;
    felt.air.z = 0;
    felt.touch = 0;
    felt.looming.length = 0;
    const live = this.stage.set.live;
    if (!live || this.#moving) return;
    const around = this.#around;
    around.airborne = this.life.body.mode === "airborne";
    around.quiet = this.wallpaper || (performance.now() - this.remote.lastInputAt) / 1000 > QUIET_AFTER;
    live.call(this.stage.set, dt, around);
  }

  /** What the hands and the world do to the fly this frame, for its senses. */
  #feel() {
    const { stimuli } = this.life;
    const hands = this.hands;
    const felt = this.#felt;
    // The feather, a bubble that burst on it last frame, or something from the place itself (a raindrop).
    stimuli.stroke = Math.max(hands.stroke, this.bubbles.brushed, felt.touch);
    // A puff from the player and the place's own air (a gust) together.
    const air = this.#puff;
    air.x = hands.air.x + felt.air.x;
    air.y = hands.air.y + felt.air.y;
    air.z = hands.air.z + felt.air.z;
    stimuli.air = air;
    // Things that could loom: the ball, the bubbles, and whatever comes by.
    stimuli.looming.length = 0;
    stimuli.looming.push(hands.looming[0]);
    if (this.bubbles.enabled) for (const b of this.bubbles.looming) stimuli.looming.push(b);
    for (const l of felt.looming) stimuli.looming.push(l);
    stimuli.threat = hands.ball.active ? hands.ball.position : null;
  }

  #reactions() {
    const { life } = this;
    const ev = life.body.events;
    if (ev.jumped) this.audio.play("takeoff", this.#nearness(life.body.position));
    if (ev.landed) this.audio.play("land", this.#nearness(life.body.position) * 0.5);
    if (life.meals > this.#lastMeals) this.audio.play("eat", this.#nearness(life.body.position));
    this.#lastMeals = life.meals;
    this.audio.tools(this.hands.events);
  }

  /** Sets the light and the weather to the tools' choices; on "Now", to the clock's and the weather outside's (or the forecast's), looked at again every few seconds. With `settle`, there at once. */
  #followLight(settle = false) {
    const now = new Date();
    const outside = this.outside;
    outside.update(now.getTime(), settle);
    this.hands.outside = outside.following;
    const time = this.hands.timeOfDay;
    if (time === "clock") this.stage.light.follow(outside.lightHours(clockHours(now)), settle);
    else this.stage.setTime(time);
    const weather = this.hands.weather;
    if (weather === "now") this.stage.weather.follow(forecastHours(now), settle, outside);
    else this.stage.weather.choose(weather, settle);
    this.#clockAt = this.time + CLOCK_EVERY;
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

  /** A fly walking, landing or drinking in a pool (the picnic's lemonade) sets rings spreading on it. */
  #paddle(dt: number) {
    this.#paddleIn -= dt;
    const food = this.life.senses.tasting.food;
    if (!food?.pool || this.#paddleIn > 0) return;
    const body = this.life.body;
    const moving = Math.abs(body.groundSpeed) > 0.5 || Math.abs(body.turnRate) > 0.3;
    if (!moving && !this.life.eating && !body.events.landed) return;
    this.stage.set.ripple(body.position.x, body.position.z, body.events.landed ? 1 : moving ? 0.45 : 0.2);
    this.#paddleIn = moving ? 0.45 : 1.4;
  }

  /** 1 close to the camera, falling off with distance. */
  #nearness(p: { x: number; y: number; z: number }) {
    const c = this.director.camera.position;
    const d = Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z);
    return Math.max(0.05, Math.min(1, 40 / Math.max(1, d)));
  }

  #input(dt: number) {
    const { remote, devices } = this;
    const { pointers, keyboard, pads } = this.#inputs;
    const nowMs = performance.now();
    pads?.poll(dt, nowMs, this.nav.current !== "play" || this.#loading);
    // A press, a finger on the remote, a tap or a click, a key, a pad, a mouse moved as if meant: not a nudge of the desk.
    const pressed = remote.presses.length > 0 || remote.touch.touching || devices.at > this.#seenInput;
    this.#seenInput = devices.at;
    if (pressed) this.audio.start(this.settings.effects, this.settings.ambience);
    const idle = (nowMs - Math.max(remote.lastInputAt, devices.at)) / 1000;
    const after = this.settings.wallpaperAfter;
    const current = this.nav.current;

    if (this.wallpaper) {
      if (pressed) {
        // Any press brings the controls back, and does nothing else: a finger or a button already down is spent until it lifts.
        this.#stopWallpaper();
        remote.presses.length = 0;
        remote.dx = 0;
        remote.dy = 0;
        if (keyboard) keyboard.actions.length = 0;
        if (pointers) {
          // In order: a press and its lift can come in the same frame.
          for (const g of pointers.gestures) {
            if (g.type === "down") this.#grip = { kind: "spent" };
            else if (g.type === "up" || g.type === "cancel") this.#grip = null;
          }
          pointers.gestures.length = 0;
        }
      }
    } else if (!this.#loading && after > 0 && idle > after && (current === "play" || current === "title") && !this.#grip && !this.director.look.held) {
      // Not while a finger or a button is still down on something, however still.
      this.#startWallpaper();
    }
    this.uiAlpha += ((this.wallpaper ? 0 : 1) - this.uiAlpha) * Math.min(1, dt * (this.wallpaper ? 1.2 : 6));

    if (this.#loading) {
      // Select, or a touch, is "Try again" on a failure.
      const touched = remote.touch.touching && !this.#touchWas;
      this.#touchWas = remote.touch.touching;
      let select = touched;
      for (const press of remote.presses) if (press.button === "select" && !press.repeat) select = true;
      // A tap or a click on "Try again".
      if (pointers) for (const g of pointers.gestures) if (g.type === "up" && g.tap && this.#hitAt(g.x, g.y)?.kind === LOADING_HITS.retry) select = true;
      if (select && this.brain.status === "failed") this.retryBrain();
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
    if (keyboard && this.nav.current === "play" && !this.wallpaper) {
      for (const action of keyboard.actions) {
        if (action.kind === "tool") this.#chooseTool(action.index);
        else this.#stepView(action.dir);
      }
    }
    if (this.nav.current === "play" && (remote.dx !== 0 || remote.dy !== 0)) this.#movePointer(remote.dx, remote.dy);
    if (pads && this.nav.current === "play" && !this.wallpaper) {
      if (pads.zoom !== 0) this.#stepView(pads.zoom > 0 ? 1 : -1);
      const look = pads.look;
      const looking = look.x !== 0 || look.y !== 0;
      // The stick lets go of the camera only when it is let go itself: a finger or the mouse may be holding it too.
      if (looking) {
        this.director.look.held = true;
        this.director.turnBy(look.x * PAD_ROUND * dt, look.y * PAD_UP * dt);
      } else if (this.#padLooking) this.director.look.held = false;
      this.#padLooking = looking;
    }
    if (pointers) {
      for (const g of pointers.gestures) this.#gesture(g);
      this.#wheelLetGo(dt);
      this.#followAim();
      this.#setCursor();
    }
  }

  /** Picks a tool from the shelf by its place (a tap on it, a number key); picking the one in hand steps its kind instead. */
  #chooseTool(index: number) {
    const hands = this.hands;
    if (hands.chooseTool(index)) {
      this.audio.play("tool");
      this.#changedAt = this.time;
    } else if (index === hands.tool && hands.stepVariant(1, true)) this.#variantChanged();
  }

  /** Brings the camera in a view (-1) or takes it out one (1), from close up to the whole place. From above, or through its eyes, from Follow. */
  #stepView(dir: -1 | 1) {
    const at = NEAR_TO_FAR.indexOf(this.hands.view as View);
    const from = at < 0 ? NEAR_TO_FAR.indexOf("follow") : at;
    const to = Math.max(0, Math.min(NEAR_TO_FAR.length - 1, from + dir));
    if (to === at) {
      this.audio.play("blocked");
      return;
    }
    this.hands.chooseView(NEAR_TO_FAR[to]);
    this.audio.play("tick");
    this.#changedAt = this.time;
    this.#syncCamera();
  }

  /** The tool's kind, stepped by a pointer: round and round. */
  #stepKind(dir: -1 | 1) {
    if (this.hands.stepVariant(dir, true)) this.#variantChanged();
    else this.audio.play("blocked");
  }

  /** Uses the tool in hand where the pointer is, as Select does. */
  #useTool() {
    const hands = this.hands;
    this.#copyEye();
    hands.update(0, { use: true, holding: true, eye: this.#eye }, this.life.body, this.life.pantry);
    if (hands.events.blocked) this.audio.play("blocked");
  }

  /** Carries the fly to the place chosen on the Place tool, if it isn't there; whether it went. */
  #goToPlace(): boolean {
    const hands = this.hands;
    if (hands.place === this.#here) {
      this.audio.play("blocked");
      return false;
    }
    this.audio.play("select");
    // Chosen by hand: if it lives in one place, this is now that place.
    if (this.settings.place !== "turns") {
      this.settings.place = hands.place;
      saveSettings(this.settings);
    }
    this.moveTo(hands.place);
    return true;
  }

  /** What was drawn under a point on the screen (0 to 1 across and down), if the overlay shows what is current. */
  #hitAt(x: number, y: number): Hit | null {
    const hits = this.overlay.hits;
    if (hits.owner !== (this.#loading ? "loading" : this.nav.current)) return null;
    const { width, height } = this.shape.design;
    const hit = hits.at(x * width, y * height, touchSlop(this.shape));
    return hit?.kind === "panel" && this.nav.current === "play" ? null : hit;
  }

  /** One gesture of a pointer, sent where it belongs: the screen's targets, the HUD's, the table, or the camera. */
  #gesture(g: Gesture) {
    const grip = this.#grip;
    if (grip?.kind === "spent") {
      if (g.type === "up" || g.type === "cancel") this.#grip = null;
      return;
    }
    if (this.wallpaper) {
      // Nothing acts on the wallpaper; only what was already held is let go.
      if (g.type === "up" || g.type === "cancel") this.#letGo();
      else if (g.type === "pinchEnd") this.#letGoOfCamera();
      return;
    }
    if (this.nav.current !== "play") {
      this.#aim.active = false;
      this.#screenGesture(g);
      return;
    }
    const design = this.shape.design;
    switch (g.type) {
      case "hover": {
        if (this.devices.current !== "mouse") return;
        const over = this.#hitAt(g.x, g.y);
        this.#aimAt(g.x, g.y, !over);
        return;
      }
      case "leave":
        this.#aim.active = false;
        return;
      case "down": {
        const hit = this.#hitAt(g.x, g.y);
        if (hit) {
          this.#grip = { kind: "hud", hit: { ...hit }, x: g.x * design.width, swiped: 0 };
          return;
        }
        if (g.button === 0 && this.#aimAt(g.x, g.y, true)) {
          const id = this.hands.current.id;
          const once = id === "feed" || id === "swoop";
          this.#grip = { kind: "tool", touch: g.touch, use: once && g.touch, holding: id === "feather" || id === "blow" };
          // A click acts at once; a finger waits to see it was a tap, not the start of a pinch.
          if (once && !g.touch) this.#useTool();
          return;
        }
        this.#grip = { kind: "look", x: g.x, y: g.y };
        this.director.look.held = true;
        return;
      }
      case "drag":
        if (grip?.kind === "tool") this.#aimAt(g.x, g.y, true);
        else if (grip?.kind === "look") {
          this.director.turnBy(-(g.x - grip.x) * LOOK_ROUND, (g.y - grip.y) * LOOK_UP);
          grip.x = g.x;
          grip.y = g.y;
        } else if (grip?.kind === "hud" && (grip.hit.kind === HUD_HITS.kind || grip.hit.kind === HUD_HITS.label)) {
          // Swiped along the label: the kinds go by as a carousel's would, the next coming from the right.
          const along = g.x * design.width - grip.x;
          const steps = Math.trunc(along / LABEL_SWIPE) - grip.swiped;
          grip.swiped += steps;
          for (let i = 0; i < Math.abs(steps); i++) this.#stepKind(steps < 0 ? 1 : -1);
        }
        return;
      case "up":
        this.#grip = null;
        if (grip?.kind === "hud" && g.tap && grip.swiped === 0) this.#pressHud(grip.hit);
        else if (grip?.kind === "tool") {
          if (!grip.touch) this.#aim.active = this.devices.current === "mouse";
          else {
            this.#aimAt(g.x, g.y, true);
            this.#aim.active = false;
          }
          if (grip.use) this.#useTool();
        } else if (grip?.kind === "look") this.director.look.held = false;
        return;
      case "cancel":
        this.#letGo();
        return;
      case "pinch":
        this.#grip = null;
        this.director.look.held = true;
        this.director.zoomBy(1 / Math.max(0.2, g.scale));
        this.director.turnBy(-g.dx * LOOK_ROUND, g.dy * LOOK_UP);
        return;
      case "pinchEnd":
        this.#letGoOfCamera();
        return;
      case "wheel":
        this.#wheel(g);
        return;
    }
  }

  /** A press is over without doing what it was going to: nothing is held any more. */
  #letGo() {
    this.#grip = null;
    this.#aim.active = false;
    this.director.look.held = false;
  }

  /** A tap on something on the HUD. */
  #pressHud(hit: Hit) {
    switch (hit.kind) {
      case HUD_HITS.tool:
        this.#chooseTool(hit.index);
        break;
      case HUD_HITS.kind:
      case HUD_HITS.label:
        this.#stepKind(hit.value < 0 ? -1 : 1);
        break;
      case HUD_HITS.go:
        this.#goToPlace();
        break;
      case HUD_HITS.menu:
        this.audio.play("open");
        this.open("pause");
        break;
    }
  }

  /** The wheel, or a trackpad's two fingers: over the shelf, the tools; over the label, the kinds; else the camera, in or out (and, scrolled across, round). */
  #wheel(g: Extract<Gesture, { type: "wheel" }>) {
    const hit = this.#hitAt(g.x, g.y);
    if (hit) {
      // A step for each click of a mouse wheel, or each SCROLL_STEP a trackpad scrolls (with its momentum, dozens of small events); a pinch or a sideways scroll over them, nothing.
      if (g.zoom || g.dy === 0) return;
      const now = performance.now();
      if (now - this.#hudScrolledAt > WHEEL_IDLE * 1000) this.#hudScrolled = 0;
      this.#hudScrolledAt = now;
      this.#hudScrolled += g.notch ? Math.sign(g.dy) * SCROLL_STEP : g.dy;
      if (Math.abs(this.#hudScrolled) < SCROLL_STEP) return;
      const dir = this.#hudScrolled > 0 ? 1 : -1;
      this.#hudScrolled = 0;
      if (hit.kind === HUD_HITS.tool) this.#chooseTool((this.hands.tool + dir + TOOLS.length) % TOOLS.length);
      else if (hit.kind === HUD_HITS.kind || hit.kind === HUD_HITS.label) this.#stepKind(dir);
      return;
    }
    const dir = g.dy > 0 ? 1 : -1;
    const director = this.director;
    if (g.zoom) {
      // A trackpad's pinch: the camera follows the fingers, and settles into the nearest view when they stop.
      director.look.held = true;
      director.zoomBy(Math.exp(g.dy * 0.01));
      this.#wheelIdle = 0;
    } else if (g.notch) this.#stepView(dir);
    else {
      this.#scrolled += g.dy;
      if (Math.abs(this.#scrolled) > SCROLL_STEP) {
        this.#stepView(this.#scrolled > 0 ? 1 : -1);
        this.#scrolled = 0;
      }
      if (g.dx !== 0) {
        director.look.held = true;
        director.turnBy(g.dx * SCROLL_ROUND, 0);
        this.#wheelIdle = 0;
      }
    }
  }

  /** A wheel or trackpad left alone has let go of the camera. */
  #wheelLetGo(dt: number) {
    if (this.#wheelIdle < 0) return;
    this.#wheelIdle += dt;
    if (this.#wheelIdle < WHEEL_IDLE) return;
    this.#wheelIdle = -1;
    this.#scrolled = 0;
    this.#letGoOfCamera();
  }

  /** The hand is off the camera: the look eases back, and a zoom settles into the view it is nearest. */
  #letGoOfCamera() {
    const view = this.director.letGo();
    if (view && this.nav.current === "play") {
      this.hands.chooseView(view);
      this.#changedAt = this.time;
      this.audio.play("tick");
      this.#syncCamera();
    }
  }

  /** A pointer on a menu, the About page or the brain's: told in design units, with what was drawn under it. */
  #screenGesture(g: Gesture) {
    const screen = this.screens[this.nav.current as MenuScreenId];
    const { width, height } = this.shape.design;
    const p = this.#point;
    p.tap = false;
    p.dx = 0;
    p.dy = 0;
    switch (g.type) {
      case "hover":
        if (this.devices.current !== "mouse") return;
        p.hit = this.#hitAt(g.x, g.y);
        break;
      case "down":
        p.hit = this.#hitAt(g.x, g.y);
        this.#grip = { kind: "screen", hit: p.hit && { ...p.hit }, x: g.x, y: g.y };
        break;
      case "drag":
      case "up": {
        const grip = this.#grip;
        if (grip?.kind !== "screen") return;
        p.hit = grip.hit;
        p.dx = (g.x - grip.x) * width;
        p.dy = (g.y - grip.y) * height;
        if (g.type === "up") {
          p.tap = g.tap;
          this.#grip = null;
        }
        break;
      }
      case "cancel":
        this.#grip = null;
        p.hit = null;
        break;
      case "wheel":
        p.hit = this.#hitAt(g.x, g.y);
        p.dy = g.dy / this.shape.unit;
        break;
      default:
        return;
    }
    p.type = g.type;
    p.x = ("x" in g ? g.x : 0) * width;
    p.y = ("y" in g ? g.y : 0) * height;
    screen.point(p);
  }

  /**
   * Puts the hand under a point on the screen (0 to 1 across and down), on
   * whatever is there; keeps it there while the camera moves, if `follow`.
   * False if the point is off the table (the air, the view beyond).
   */
  #aimAt(x: number, y: number, follow: boolean): boolean {
    const aim = this.#aim;
    aim.x = x;
    aim.y = y;
    aim.active = follow;
    aim.moved = true;
    aim.onWorld = false;
    if (!follow) return false;
    const hit = this.#cast(x, y);
    if (hit) this.hands.movePointer(hit.point, hit.normal);
    aim.onWorld = !!hit;
    return !!hit;
  }

  /** Keeps the hand under a pointer that is still while the camera moves. */
  #followAim() {
    const aim = this.#aim;
    if (!aim.active || this.nav.current !== "play" || this.wallpaper) return;
    if (aim.moved) {
      aim.moved = false;
      return;
    }
    const hit = this.#cast(aim.x, aim.y);
    if (hit) this.hands.slidePointer(hit.point, hit.normal);
    aim.onWorld = !!hit;
  }

  /** What is under a point on the screen: the fly, or the world, if anything is there. */
  #cast(x: number, y: number): RayHit | null {
    this.#ray.setFromCamera(this.#ndc2.set(x * 2 - 1, 1 - y * 2), this.director.camera);
    return aimAt(this.life.world, this.#ray.ray.origin, this.#ray.ray.direction, this.life.body.position, this.#hit);
  }

  /** The system's cursor: none over the table (the hand is the cursor), a hand to grab the air with (it turns the camera), a pointing hand over things to press, else the arrow. */
  #setCursor() {
    let cursor = "default";
    if (this.devices.current === "mouse" && !this.#loading) {
      if (this.wallpaper) cursor = "none";
      else if (this.#grip?.kind === "look") cursor = "grabbing";
      else if (this.nav.current === "play") cursor = !this.#aim.active ? "pointer" : this.#aim.onWorld ? "none" : "grab";
    }
    if (cursor === this.#cursor || !this.canvas.style) return;
    this.#cursor = cursor;
    this.canvas.style.cursor = cursor;
  }

  #playPress(button: RemoteButton, repeat: boolean) {
    const hands = this.hands;
    switch (button) {
      case "left":
      case "right":
        hands.stepTool(button === "left" ? -1 : 1);
        this.audio.play("tool");
        this.#changedAt = this.time;
        this.#learn("tools");
        break;
      case "up":
      case "down":
        // Up goes to the earlier kind in the list, as a list reads top to bottom.
        if (hands.stepVariant(button === "up" ? -1 : 1)) this.#variantChanged();
        else if (!repeat) this.audio.play("blocked");
        break;
      case "select":
        if (repeat) break;
        if (hands.current.id === "place") {
          if (this.#goToPlace()) this.#learn("place");
        } else if (hands.current.id === "light" || hands.current.id === "weather" || hands.current.id === "view") {
          // Select steps round the times of day, the weathers or the views, for a remote held in one hand.
          hands.variants[hands.tool] = (hands.variants[hands.tool] + 1) % hands.current.variants.length;
          this.#variantChanged();
        } else {
          this.#useTool();
          if (hands.events.dropped) this.#learn("feed");
          if (hands.events.swooped) this.#learn("swoop");
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
    if (this.hands.current.id === "light" || this.hands.current.id === "weather") this.#followLight();
    if (this.hands.current.id === "view") this.#syncCamera();
    this.#remember();
  }

  /** Keeps the kind just chosen, if it is one a launch comes back to. */
  #remember() {
    const tool = this.hands.current.id;
    if (!KEPT[tool]) return;
    this.#shelf[tool] = { kind: this.hands.variant.id, at: Date.now() };
    saveShelf(this.#shelf);
  }

  /** The player has done what a hint shows: it goes, now and on later launches. */
  #learn(lesson: Lesson) {
    if (this.#learned[lesson]) return;
    this.#learned[lesson] = true;
    this.#taught++;
    saveLearned(this.#learned);
  }

  #unlearn() {
    for (const lesson of Object.keys(this.#learned) as Lesson[]) delete this.#learned[lesson];
    this.#taught++;
    saveLearned(this.#learned);
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
    // The hints and the buttons follow what the player picked up.
    const glyphs = this.glyphs;
    if (glyphs !== this.#glyphsDrawn) {
      this.#glyphsDrawn = glyphs;
      overlay.dirty = true;
    }
    if (current === "loading") {
      overlay.dirty = true;
      overlay.redraw(dt, current, (g, hits) => drawLoading(g, this.time, this.brain, this.#loadingLayout, hits));
      return;
    }
    if (this.uiAlpha < 0.01) return;
    const stats = this.settings.stats;
    if (current === "play") {
      const life = this.life;
      const hud = this.#hud;
      hud.activity = life.activity;
      hud.here = this.#here;
      hud.food = life.senses.tasting.food?.name ?? null;
      hud.hints = this.settings.hints;
      hud.glyphs = glyphs;
      hud.teachSwipe = !this.#touched;
      hud.changed = this.time - this.#changedAt;
      hud.spikes = this.meter.spikesPerSecond;
      hud.brainRunning = this.brain.status === "running";
      if (this.#showEyes()) {
        const e = this.#eyesInfo;
        e.facets = this.eyes.facets;
        e.standIn = this.eyes.standIn;
        e.off = this.eyes.detail === "off";
        hud.eyes = e;
      } else hud.eyes = null;
      const k = this.#hudKey;
      const changed = k.tool !== this.hands.tool || k.variant !== this.hands.variants[this.hands.tool] || k.activity !== hud.activity || k.food !== hud.food || k.following !== this.hands.following || k.touched !== this.#touched || k.hints !== hud.hints || k.eyes !== !!hud.eyes || k.taught !== this.#taught;
      if (changed || hud.changed < 0.3 || this.time - this.#hudAt > 1 / HUD_SHIMMER_FPS) {
        k.tool = this.hands.tool;
        k.variant = this.hands.variants[this.hands.tool];
        k.activity = hud.activity;
        k.food = hud.food;
        k.following = this.hands.following;
        k.touched = this.#touched;
        k.hints = hud.hints;
        k.eyes = !!hud.eyes;
        k.taught = this.#taught;
        this.#hudAt = this.time;
        overlay.dirty = true;
      }
      overlay.redraw(dt, current, (g, hits) => {
        drawHud(g, this.time, hud, hits);
        if (stats) drawStats(g, this, hud.layout.statsX, hud.layout.statsY);
      });
      return;
    }
    const screen = this.screens[current];
    if (screen.update(dt)) overlay.dirty = true;
    overlay.redraw(dt, current, (g, hits) => {
      screen.draw(g, this.time, hits);
      if (stats) drawStats(g, this, this.#hudLayout.statsX, this.#hudLayout.statsY);
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
    d.food = String(life.pantry.foods.filter(isDropped).length);
    d.takeoffs = String(life.takeOffs);
    d.escape = (life.brain.state?.command.escape ?? 0).toFixed(3);
    d.escapePeak = this.peaks.escape.toFixed(3);
    d.loomPeak = this.peaks.loom.toFixed(3);
    d.loomingHz = this.peaks.looming.toFixed(1);
    d.feed = (life.brain.state?.command.feed ?? 0).toFixed(3);
    d.eyes = this.eyes.inUse ? "brain" : this.eyes.active ? "picture" : "off";
    d.eyesInset = this.inset.state;
    d.calls = String(this.stage.cost.calls);
    d.triangles = String(this.stage.cost.triangles);
    d.frameMs = this.frameMsAverage.toFixed(2);
    d.eyesMs = this.eyes.costMs.toFixed(2);
    d.eyesUpdates = String(this.eyes.updates);
    d.spikesPerSecond = String(Math.round(this.meter.spikesPerSecond));
    d.time = this.stage.light.time;
    d.hours = this.stage.light.hours === null ? "" : this.stage.light.hours.toFixed(2);
    d.weather = this.stage.weather.kind;
    d.wet = this.stage.weather.wet.toFixed(2);
    // Where the weather and the daylight come from, and how old the weather outside is (s).
    const outside = this.outside;
    d.weatherFrom = this.hands.weather !== "now" ? "chosen" : outside.following ? "outside" : "forecast";
    d.sunFrom = this.hands.timeOfDay !== "clock" ? "chosen" : outside.sunFollowing ? "outside" : "clock";
    d.outside = outside.state;
    const age = outside.age(Date.now());
    d.outsideAge = age === null ? "" : age.toFixed(0);
    // On the TV's console, why it has nothing (no permission, WeatherKit refusing the app), once each time it changes.
    if (outside.state !== this.#outsideState) {
      this.#outsideState = outside.state;
      const why = outside.error;
      console.log(`weather outside: ${outside.state}${why ? ` (${why})` : ""}`);
    }
    d.view = this.hands.view;
    d.place = this.#here;
    d.placeMs = this.stage.buildMs.toFixed(0);
    d.moving = this.#moving ? this.#moving.to : "";
    d.speed = this.meter.speed.toFixed(2);
    d.gl = this.glLost ? "lost" : "ok";
    d.pixels = this.stage.pixels;
    d.eyesDetail = this.eyes.detail;
    d.eyesRate = String(this.eyes.rate);
    const brain = life.brain;
    if (arriving(brain)) {
      d.phase = brain.phase;
      d.received = String(brain.source.received);
      d.total = String(brain.source.total);
      d.from = brain.source.from ?? "";
      d.failure = brain.failure ?? "";
    }
    if (this.quality) {
      d.quality = String(this.quality.level);
      d.fps = String(this.quality.current.fps);
      d.windowMs = this.quality.frameMs.toFixed(1);
    }
    d.device = this.devices.current;
    d.frame = `${this.shape.width}x${this.shape.height}`;
    const look = this.director.look;
    d.looking = String(look.held || Math.abs(look.yaw) > 0.01 || Math.abs(look.pitch) > 0.01);
  }
}
