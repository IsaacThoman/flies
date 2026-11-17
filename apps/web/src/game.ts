// The game: the world and the fly's life in it, the camera, the tools in the
// player's hands and the menus, put together frame by frame, on a screen of
// whatever shape.
//
// What the player holds is read each frame: the remote's buttons and touch
// surface (and a keyboard's keys and a pad's buttons, which are the same
// buttons); and a pointer, which points at the screen itself. A pointer's
// press goes to whatever was drawn under it (the hit map the overlay keeps),
// else, in play, to the world and the camera (controls.ts).

import * as THREE from "three";
import { FLY_LENGTH, Rhythm, SUMMER } from "@fly/body";
import { REGIONS } from "@fly/brain";
import type { BrainDriver, OpenTableSocket, RemoteButton, TextEntry, WeatherAttribution } from "@fly/contracts";
import { AT_ROOT_PROPERTY, INVITE_EVENT } from "@fly/contracts";
import { Navigator, sameTarget } from "@fly/ui";
import type { GlyphSet, Hit, HitMap } from "@fly/ui";
import { BALL_RADIUS, Pantry, TOUCH, World, WORLDS, forecastHours, hourOfDay, isDropped } from "@fly/world";
import type { RayHit, Vec3 } from "@fly/world";
import { Haptics } from "./haptics.ts";
import type { Brains } from "./brain/create.ts";
import { BrainMeter } from "./brain/meter.ts";
import { Company, companionSpot } from "./company.ts";
import { Remembered, liveAway } from "./fly-record.ts";
import { CameraDirector, VIEWS } from "./camera.ts";
import { TV_FRAME, worldSize } from "./display.ts";
import type { Display, Frame } from "./display.ts";
import { Eyes } from "./eyes/eyes.ts";
import { EyesInset, insetWanted } from "./eyes/inset.ts";
import { FlyView } from "./fly-view.ts";
import { DRAG_ROUND, DRAG_UP, PlayControls } from "./controls.ts";
import type { PlayTarget, ToolUse } from "./controls.ts";
import { COLOURS, MAX_OWN, PROTOCOL, everyoneSeries, seriesFor, seriesPlace } from "@fly/net";
import type { SeatedFly, TableStart } from "@fly/net";
import { TouchLoupe } from "./ui/touch-loupe.ts";
import type { Devices, Gamepads, Gesture, Keyboard, Pointers, Remote } from "./input.ts";
import { Life } from "./life.ts";
import { inApp, inviteLink, invitedTo, newDeviceKey, newTableCode, roomsUrl, share, showInAddress, tableStart, tryProtocolReload } from "./online/invite.ts";
import type { Shared } from "./online/invite.ts";
import { AutoJoin, launchSeat } from "./online/auto-join.ts";
import type { AutoJoinNow } from "./online/auto-join.ts";
import { Lobby } from "./online/lobby.ts";
import { Online } from "./online/online.ts";
import type { Ended, PlayerNow, TableHost } from "./online/online.ts";
import { nativeSocketBridge, nativeSockets } from "./online/native-socket.ts";
import { NEWER_KEY, reloadForNewer } from "./online/newer.ts";
import { OtherFlies, devicesOf } from "./online/others.ts";
import type { Device, Other } from "./online/others.ts";
import { BrowserSocket } from "./online/socket.ts";
import { isPlaceId, placeInfo } from "./places/catalog.ts";
import { Tour } from "./places/tour.ts";
import type { PlaceId } from "./places/catalog.ts";
import { NerveGlow } from "./nerves/glow.ts";
import { NervesPanel, nervesSlot, nervesWanted } from "./nerves/panel.ts";
import { Xray, pixelsLong, xrayWanted } from "./nerves/xray.ts";
import { SCENES } from "./places/index.ts";
import type { Around, Felt } from "./places/types.ts";
import { Bubbles } from "./scene/bubbles.ts";
import { Fireflies } from "./scene/fireflies.ts";
import { clockHours, timeAt } from "./scene/light.ts";
import { Outside, nativeWeather } from "./scene/outside.ts";
import { KitView } from "./scene/kit.ts";
import { Footprints } from "./scene/prints.ts";
import { cheaperEyes, cheaperPixels } from "./quality.ts";
import type { Quality, Warmth } from "./quality.ts";
import { KEPT, OVERLAY_OPACITIES, OVERLAY_SIZES, loadLearned, loadSettings, loadShelf, loadTableSeat, saveLearned, saveSettings, saveShelf, saveTableSeat } from "./settings.ts";
import type { Learned, Lesson, Settings, ShelfChoices, TableSeat } from "./settings.ts";
import { Stage } from "./stage.ts";
import { aimAt } from "./tools/aim.ts";
import { Builder, buildAction } from "./tools/build.ts";
import type { Aim } from "./tools/build.ts";
import { DIALS, Hands, TOOLS } from "./tools/hands.ts";
import type { Dial, DialId, ToolId } from "./tools/hands.ts";
import { HandsView } from "./tools/view.ts";
import { StatsPanel, statsSlot, statsWanted } from "./stats/panel.ts";
import type { StatsState } from "./stats/panel.ts";
import { Tally } from "./stats/tally.ts";
import { CornerDeck, waitFor } from "./ui/corners.ts";
import type { CornerPicture } from "./ui/corners.ts";
import { HUD_HITS, drawHud, needsTeaching } from "./ui/hud.ts";
import type { HudState } from "./ui/hud.ts";
import { hudLayout, loadingLayout, playRoom, titleLayout, touchSlop } from "./ui/layout.ts";
import type { HudLayout, LoadingLayout } from "./ui/layout.ts";
import { LOADING_HITS, arriving, drawLoading } from "./ui/loading.ts";
import { Overlay } from "./ui/overlay.ts";
import { Settle } from "./ui/settle.ts";
import { AboutScreen } from "./ui/screens/about.ts";
import { settingsScreen, settingsTab, titleScreen } from "./ui/screens/menus.ts";
import type { MenuScreen } from "./ui/screens/menu-screen.ts";
import type { Knock, NewRoom, Point, Screen, ScreenId, Shell, TableNow } from "./ui/screens/types.ts";
import { drawStats } from "./ui/stats.ts";
import { MENU_HITS } from "./ui/menu-view.ts";
import { OnlineScreen } from "./ui/screens/online.ts";
import { BrowserTextEntry, NativeTextEntry, nativeKeyboard } from "./ui/text-entry.ts";

/** Seconds the loading screen stays after the brain wakes, so "Awake!" is seen; longer when it has more to say. */
const AWAKE_HOLD = 0.2;
const AWAKE_HOLD_NOTE = 4;
/** Hidden longer than this (ms), the page wakes with the sky and the weather where the clock has them now, not easing there. */
const AWAY_SETTLE_MS = 30_000;
/** How sensitive the touch surface is: screen widths per full swipe. */
const SWIPE_GAIN = 0.9;
/** With the View tool in hand, a swipe across the touch surface (2 units) turns the camera as far round as a drag across the screen, and one up it about as far up. */
const SWIPE_ROUND = DRAG_ROUND / 2;
const SWIPE_UP = DRAG_UP / 2;
/** The refresh cap for animated teaching, loading status and frame stats, Hz. */
const HUD_SHIMMER_FPS = 10;
/** Seconds the world takes to fade out before the fly is carried somewhere else, and to fade in after. */
const VEIL_OUT = 0.45;
const VEIL_IN = 0.9;
/** Seconds without a press before the place's comings and goings start, when the wallpaper hasn't already. */
const QUIET_AFTER = 60;
/** How often the clock, the forecast and the weather outside are looked at again, s: the light moves on that slowly. */
const CLOCK_EVERY = 2;
/** Seconds of sustained tickling or blowing that distinguish a hold from a press. */
const HOLD_TAUGHT = 0.5;
/** A pad's right stick at full tilt: radians a second round the fly, and up; and Q or E held, round, W or S, up. */
const PAD_ROUND = 2.4;
const PAD_UP = 1.2;
const KEY_ROUND = 1.6;
const KEY_UP = 0.8;
/** How fast + and − held, or a trigger pressed all the way, bring the camera in or take it out (as a power of e, a second). */
const KEY_ZOOM = 1.4;
const PAD_ZOOM = 1.6;

type MenuScreenId = Exclude<ScreenId, "play">;

const FIXED_AT_TABLE: ReadonlySet<ToolId> = new Set(["sky", "place", "build"]);
/** Away from home building is off: every fly at a table meets the place as it is made (docs/online.md). */
const BUILD_FIXED: ReadonlySet<ToolId> = new Set(["build"]);
const NOTHING_FIXED: ReadonlySet<ToolId> = new Set();

/** Adds each of `from` to `to`, without the iterator a for…of would make: it runs every frame for every fly. */
function pushAll<T>(to: T[], from: readonly T[]) {
  for (let i = 0; i < from.length; i++) to.push(from[i]);
}

/** Reloads the page into the build that speaks the room's newer protocol, when it may (online/newer.ts): whether it did. */
function reloadForNewerProtocol(): boolean {
  try {
    const next = reloadForNewer(sessionStorage.getItem(NEWER_KEY), PROTOCOL, Date.now());
    if (!next) return false;
    sessionStorage.setItem(NEWER_KEY, next);
  } catch {
    // Without the session's memory a reload that brought this page back would reload again every frame.
    return false;
  }
  location.reload();
  return true;
}

/** What the browser's own inputs are, beside the remote: none on the Apple TV. */
export type Inputs = { devices: Devices; pointers?: Pointers; keyboard?: Keyboard; pads?: Gamepads };

/** What a pointer pressed on in a menu, until it lets go, or that a press may do nothing more (it woke the wallpaper, the screen changed under it). In play, controls.ts keeps it. */
type Grip = { kind: "screen"; hit: Hit | null; x: number; y: number } | { kind: "spent" };

const isArrow = (button: RemoteButton) => button === "up" || button === "down" || button === "left" || button === "right";

/** How a tool is used on the table, by a pointer. */
function toolUse(id: string): ToolUse {
  return id === "feed" || id === "swoop" || id === "build" ? "once" : id === "feather" || id === "blow" ? "hold" : "none";
}

export class Game implements Shell {
  readonly canvas: HTMLCanvasElement;
  readonly remote: Remote;
  readonly display: Display;
  readonly devices: Devices;
  readonly settings: Settings;
  readonly stage: Stage;
  readonly director: CameraDirector;
  /** The fly the player follows: the camera, the pointer, the pictures in the corners and the stats are its. */
  readonly life: Life;
  readonly fly: FlyView;
  /** The other flies this device lives, each with a brain of its own (Settings → Flies). */
  readonly company: Company;
  /** Every fly but the followed one, as drawn: this device's others, and the other players' at a table. */
  readonly others: OtherFlies;
  /** How many flies this device can live: one where it can run only one brain. */
  readonly maxFlies: number;
  /** What its feet leave after it has stood in something sticky or wet: only drawn, never felt. */
  readonly prints: Footprints;
  readonly meter = new BrainMeter();
  readonly overlay = new Overlay();
  readonly bubbles: Bubbles;
  readonly hands: Hands;
  readonly handsView: HandsView;
  /** What the player has built where the fly lives (the Build tool), and how it looks. */
  readonly builder: Builder;
  readonly kit: KitView;
  /** What the Build tool in hand points at this frame, if it is in hand. */
  #buildAim: Aim | null = null;
  readonly haptics: Haptics;
  readonly eyes: Eyes;
  readonly inset: EyesInset;
  /** Its nervous system in a corner, and the corner it shares with what it sees. */
  readonly nerves: NervesPanel;
  readonly corners = new CornerDeck();
  /** Its stats in a corner, and the day they count. */
  readonly statsPanel = new StatsPanel();
  readonly tally: Tally;
  /** Each of its flies from launch to launch: who it is, and the body it had. */
  readonly remembered = new Remembered(newDeviceKey);
  /** How brightly each part of its nervous system glows, from the brain's region rates. */
  readonly glow: NerveGlow;
  readonly xray = new Xray();
  readonly fireflies: Fireflies;
  /** The real weather outside, where the Apple TV can tell it; scripts feed it in a browser (`outside.feed`). */
  readonly outside = new Outside(nativeWeather());
  readonly nav = new Navigator<ScreenId>("title");
  readonly screens: { title: MenuScreen; settings: MenuScreen; about: AboutScreen; online: OnlineScreen };
  /** At a room with others (docs/online.md), its line to the room and the others there; null alone. */
  online: Online | null = null;
  /** How the room this device was last at, or tried to sit at, ended: it left, or was turned away (removed, the room gone, locked). */
  tableEnded: Ended | null = null;
  /** A locked room's door, waiting for its password; and how many doors have been come to, each its own (a refusal at the same door is news). */
  knock: Knock | null = null;
  #knocks = 0;
  /** Typing into the fields the game draws (a room's name, its password), where there is a way to. */
  readonly typing: TextEntry | null;
  #typingHit: Hit | null = null;
  readonly touchLoupe: TouchLoupe | null;
  /** The line that lists the rooms, while Online shows them. */
  #lobby: Lobby | null = null;
  /** The fly's own food, kept while it tries a room, to have back if the room never lets it in. */
  #alone: Pantry | null = null;
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
  /** On a host that says how hot the device is (the Apple TV), the frame rate and pixels it can sustain (quality.ts). */
  warmth: Warmth | null = null;
  /** The graphics context was lost, and nothing can be drawn until it is restored. */
  glLost = false;
  /** The middles of the other flies this device lives, for the bubbles: one each, kept. */
  readonly #middles: THREE.Vector3[] = [];
  /** Where each of the company is, for the place's visitors to keep clear of. */
  readonly #companyAt: Vec3[] = [];
  /** Where every fly this device lives is: a piece built keeps clear of them all. */
  readonly #fliesAt: Vec3[] = [];
  /** The Flies setting as last seen: when the player changes it, flies taken off for brains that wouldn't run may be tried again. */
  #fliesChosen = 0;
  /** How hard this player's feather is on any of the other flies this device lives, this frame. */
  #companyStroke = 0;
  /** The enamel the followed fly wears now (none alone with no others to tell it from). */
  #mark: string | null = null;
  /** Recent peaks of the giant fibre's escape command, the hand-wired loom, and the eyes' looming detectors (Hz). */
  readonly peaks = { escape: 0, loom: 0, looming: 0 };
  #loading = true;
  #ready = false;
  #awakeAt = -1;
  #datasetAt = 0;
  /** What the HUD last drew, to tell when it needs drawing again. */
  #hudKey = { preview: -1, tool: -1, variant: -1, activity: "", food: null as string | null, following: false, touched: false, hints: false, eyes: false, taught: -1, here: null as PlaceId | null, fixed: false, outside: false, surface: "", running: false, pressed: null as Readonly<Hit> | null };
  #hudAt = 0;
  #changedAt = -10;
  #touched = false;
  #paddleIn = 0;
  #clockAt = 0;
  #air = new THREE.Vector3();
  /** What the place's own goings-on did to the fly this frame, and what they are given. */
  #felt: Felt = { air: { x: 0, y: 0, z: 0 }, touch: 0, looming: [] };
  #around: { -readonly [K in keyof Around]: Around[K] };
  #puff = { x: 0, y: 0, z: 0 };
  #middle = new THREE.Vector3();
  #floorAt = (x: number, z: number, below: number) => this.life.world.heightAt(x, z, below);
  #ndc = new THREE.Vector3();
  #ndc2 = new THREE.Vector2();
  #ray = new THREE.Raycaster();
  #hit: RayHit = { point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, solid: -1, t: 0 };
  #eye = { x: 0, y: 0, z: 0 };
  #lastScreen: ScreenId | "loading" = "loading";
  #lastNow = -1;
  #qualitySeen = 0;
  #warmthSeen = 0;
  /** The pixels and eyes last chosen in Settings, to tell when the player changes them. */
  #chosen: { pixels: string; eyes: string } = { pixels: "", eyes: "" };
  #touchWas = false;
  #hud: HudState;
  #eyesInfo = { facets: 0, standIn: false, off: false };
  /** The pictures that share the corners, and the size and stats they were last laid out for. */
  #pictures: CornerPicture[] = [];
  #laidOut = { size: "", kind: "" };
  #statsState: StatsState;
  /** Where the fly is now. */
  #here: PlaceId;
  /** Being carried to another place: where, and seconds since the veil began to fall. */
  #moving: { to: PlaceId; t: number; arrived: boolean } | null = null;
  /** Going round the places in the screensaver, if the player chose to. */
  readonly tour = new Tour();
  /** A place stepped to in Settings, waiting for the player to settle on it. */
  #placeChoice = new Settle(
    () => this.#choosingPlace(),
    () => this.#settlePlace(),
  );
  /** The shelf's choices a launch comes back to, as saved. */
  #shelf: ShelfChoices;
  /** What the hints have taught, as saved; and how many times that has changed, for the HUD to redraw. */
  #learned: Learned = loadLearned();
  #taught = 0;
  /** Seconds the held tool has been tickling or blowing. */
  #held = 0;
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
  /** A pointer in play, and what it acts on. */
  readonly #controls: PlayControls;
  readonly #target: PlayTarget;
  /** Keys or a pad's stick are turning the camera. */
  #turning = false;
  /** The menus' focus ring was showing last frame: the first arrow after a pointer only brings it back. */
  #ringShown = true;
  /** A game has been played since launch: Back from the menu carries on with it. */
  #played = false;
  #firstVisit = Object.keys(this.#learned).length === 0;
  #cursor = "";
  #seenInput = 0;
  #glyphsDrawn: GlyphSet | null | undefined = undefined;
  /** This device's key and table, as kept; and what the table hears of the player each send. */
  #seat: TableSeat;
  /** How this device opens a line to a room (null: it can't), and whether it is one of the apps (docs/online.md). */
  readonly #openSocket: OpenTableSocket | null;
  readonly #app: boolean;
  readonly #player: PlayerNow = { away: false, playing: false, handsOut: false, holding: false, eye: { x: 0, y: 0, z: 0 } };
  readonly #tableHost: TableHost;
  /** The other devices at the table as the screens have them, by the first of their flies heard of. */
  readonly #devices = new WeakMap<Other, Device>();
  readonly #titleItems: number;
  /** Keeping this device in the room open to everyone it is visiting, once the brain is awake (null where it can't play online); and whether the room this device is at, or trying, is a visit's (it ends quietly). */
  #auto: AutoJoin | null = null;
  #autoOnline = false;
  /** What the visit is told each frame, kept: nothing is made per frame. */
  readonly #autoNow: AutoJoinNow = { enabled: true, awake: false, network: true, atRoom: false, series: 0, atSeries: -1 };

  constructor(canvas: HTMLCanvasElement, remote: Remote, brains: Brains, display: Display, inputs: Inputs) {
    this.canvas = canvas;
    this.remote = remote;
    this.display = display;
    this.devices = inputs.devices;
    this.#inputs = inputs;
    this.haptics = new Haptics(this.devices, () => navigator.getGamepads?.() ?? [], typeof navigator.vibrate === "function" ? navigator.vibrate.bind(navigator) : null);
    this.#controls = new PlayControls(() => this.shape.design);
    this.#target = this.#playTarget();
    this.settings = loadSettings();
    // Every launch is at home: a visit, or a room of its own, sits it down where that is once it can.
    this.#here = this.settings.place;
    const scene = SCENES[this.#here];
    const world = new World(scene.place);
    this.builder = new Builder(world);
    this.builder.enter(this.#here, scene.place);
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
    this.life = new Life(world, brains.first);
    // Its clock keeps the real time of day, whatever light is chosen; its body is as it was last time, the time since lived out (fly-record.ts).
    this.life.rhythm = this.#rhythm();
    this.remembered.arrive(0, this.life, Date.now(), this.outside.sunTimes ?? SUMMER, this.#here, true);
    this.fly = new FlyView(this.stage.scene, world);
    this.maxFlies = brains.another ? Math.min(MAX_OWN, brains.most) : 1;
    // A count chosen where more could live (or by an older build) shows as what lives here.
    this.settings.flies = Math.min(this.settings.flies, this.maxFlies);
    this.company = new Company(
      world,
      brains.another ?? (() => brains.first),
      (c) => {
        c.life.rhythm = this.#rhythm();
        this.remembered.arrive(c.slot, c.life, Date.now(), this.outside.sunTimes ?? SUMMER, this.#here, !this.online);
      },
      (c) => this.remembered.leave(c.slot, c.life, this.#here, Date.now()),
    );
    this.others = new OtherFlies(this.stage.scene, world);
    this.others.company = this.company.list;
    this.prints = new Footprints(this.stage.scene);
    this.director = new CameraDirector(world, display.frame.aspect, scene.camera);
    this.bubbles = new Bubbles(this.stage.scene, world);
    this.handsView = new HandsView(this.stage.scene);
    this.kit = new KitView(this.stage.scene);
    this.eyes = new Eyes(this.stage, this.life);
    this.eyes.standIns = this.others;
    this.#around = { fly: this.life.body.position, airborne: false, world, pantry: this.life.pantry, weather: this.stage.weather, quiet: false, felt: this.#felt, company: this.#companyAt, shared: null };
    this.eyes.see(this.bubbles.mesh);
    this.eyes.see(this.kit.built);
    this.#fliesAt.push(this.life.body.position);
    for (const object of this.handsView.seen) this.eyes.see(object);
    this.inset = new EyesInset(this.eyes);
    this.overlay.scene.add(this.inset.mesh);
    this.nerves = new NervesPanel(this.fly.model.nerves);
    this.overlay.scene.add(this.nerves.mesh);
    this.overlay.scene.add(this.statsPanel.mesh);
    this.touchLoupe = inputs.pointers ? new TouchLoupe() : null;
    if (this.touchLoupe) this.overlay.scene.add(this.touchLoupe.mesh);
    this.#pictures = [this.inset, this.nerves, this.statsPanel];
    this.tally = new Tally(this.life, Date.now());
    this.#statsState = { spikes: 0, active: 0, speed: 0, history: this.meter.history, head: 0, day: this.tally.day, sensed: this.life.sensed, brain: null };
    this.glow = new NerveGlow(this.fly.model.nerves.glow);
    this.#settle();
    const title = titleScreen(this);
    this.#titleItems = title.menu.items.length;
    this.screens = {
      title,
      settings: settingsScreen(this),
      about: new AboutScreen(this),
      online: new OnlineScreen(this),
    };
    this.#hudLayout = hudLayout(display.frame);
    this.#loadingLayout = loadingLayout(display.frame);
    this.#hud = { hands: this.hands, here: this.#here, activity: "waiting", food: null, hints: true, glyphs: this.glyphs, learned: this.#learned, teachSwipe: true, changed: 10, brainRunning: false, arrival: arriving(this.brain) ? this.brain : null, eyes: null, layout: this.#hudLayout };
    // Nothing points on the Apple TV: nothing to record.
    this.overlay.hits.enabled = !!inputs.pointers;
    this.#applyFrame();
    this.applySettings(false);
    this.director.startWallpaper();
    this.director.title = true;
    this.#tableHost = {
      scene: this.stage.scene,
      stage: this.stage,
      life: this.life,
      company: this.company,
      others: this.others,
      hands: this.hands,
      fly: this.fly,
      eyes: this.eyes,
      bubbles: this.bubbles,
      flies: () => this.#fliesWanted(),
      seat: (flies) => this.#seated(flies),
      share: (pantry) => this.#share(pantry),
      felt: this.#felt,
      here: () => this.#here,
      moving: () => !!this.#moving && !this.#moving.arrived,
      moveTo: (place) => this.moveTo(place, true),
      onWorld: (settle) => this.#followLight(settle),
    };
    this.#seat = loadTableSeat(newDeviceKey);
    [this.#openSocket, this.#app] = tableLines();
    // The Apple TV's host types with its own keyboard screen, not a page's <input>.
    const keyboard = nativeKeyboard();
    const native = !!(globalThis as { __native?: unknown }).__native;
    this.typing = !this.canPlayOnline ? null : keyboard ? new NativeTextEntry(keyboard) : typeof document !== "undefined" && !native ? new BrowserTextEntry() : null;
    // Invited to a room, or still at one of its own it was at when it last closed: it sits down there.
    // Otherwise at home, or, on a visit, once the brain is awake, in the room open to everyone it is visiting (AutoJoin), unless opened `?alone` (for checks and scripts).
    if (this.canPlayOnline) {
      const kept = this.#seat.table;
      const launch = launchSeat(invitedTo(location.href), kept);
      this.#auto = new AutoJoin(kept);
      if (new URL(location.href).searchParams.has("alone")) this.#auto.stop();
      // A link to a room open to everyone is a visit there, as soon as the brain is awake.
      if (launch.visit) this.#belongIn(launch.visit);
      if (launch.sit) this.#sit(launch.sit, null);
      // A phone's keyboard comes up only for a field focused during the tap itself: the frame that handles the tap is too late.
      if (inputs.pointers) {
        inputs.pointers.onDown = (x, y) => {
          const hit = this.#hitAt(x, y);
          this.#typingHit = hit && { ...hit };
        };
        inputs.pointers.onTap = (x, y) => this.#typeOnTap(x, y);
      }
      // A link opened while the app runs (a universal link on a phone): this room, leaving any other.
      window.addEventListener?.(INVITE_EVENT, (event) => {
        const code = invitedTo(String((event as CustomEvent<unknown>).detail));
        if (!code || this.online?.code === code) return;
        this.leaveTable();
        this.joinRoom(code);
      });
    }
  }

  get teachingMenu() {
    return this.#firstVisit && !this.#played;
  }

  /** Rooms with others need a line to the room server: a WebSocket, or the Apple TV host's. */
  get canPlayOnline() {
    return this.#openSocket !== null;
  }

  /** Makes a room and sits at it, under this light and weather: its link can be shared at once. */
  startRoom(room: NewRoom) {
    if (!this.#mayChoose()) return;
    const start = { ...tableStart(room.place, this.hands.timeOfDay, this.hands.weather), name: room.name, listed: room.listed };
    this.#sit(newTableCode(), start, room.password || null);
  }

  /** Sits at a room by its code, with its password if it is locked. A room open to everyone is a visit from now on, until the player goes home. */
  joinRoom(code: string, password?: string) {
    if (this.online?.code === code || !this.#mayChoose(code)) return;
    if (everyoneSeries(code) < 0) {
      this.#sit(code, null, password || null);
      return;
    }
    this.#belongIn(code);
    this.#auto?.begin();
    this.#sit(code, null, null, true);
  }

  /** A room open to everyone, chosen by the player (from the list, by its code or its link): the fly visits its series now, and comes back to that room, this launch and later ones, until it goes home. */
  #belongIn(code: string) {
    this.settings.visit = everyoneSeries(code);
    saveSettings(this.settings);
    this.#auto?.at(code);
    this.#auto?.resume();
  }

  /** Online → Go home: out of whatever room it is in, alone, and carried to the place it lives. */
  goHome() {
    this.settings.visit = -1;
    saveSettings(this.settings);
    if (this.online) {
      const quiet = this.#autoOnline;
      this.online.leave();
      this.#stand("left", quiet);
    }
    this.#settlePlace();
  }

  /** Visiting a room open to everyone, taken there by the player (in it, or trying to be). */
  get visiting() {
    return this.settings.visit >= 0;
  }

  /** Whether the player may go to a room of their choosing now (`code`, if it is one already made): alone, or in a room open to everyone (or on the way to one), which is left for it. */
  #mayChoose(code?: string) {
    if (!this.canPlayOnline) return false;
    const online = this.online;
    if (online && !online.everyone && !this.#pending) return false;
    // Left for this room's door: still at it, on the way in.
    const knock = this.knock;
    this.leaveTable();
    if (knock?.code === code) this.knock = knock;
    return true;
  }

  /** On the way to the room open to everyone it is visiting, not yet let in: to the player, still alone. */
  get #pending() {
    return !!this.online && this.#autoOnline && !this.online.welcomed;
  }

  /** The network is back: the brain's download, and sitting with others, are tried again now. */
  networkBack() {
    this.retryBrain(true);
    this.#auto?.hurry();
  }

  /** Comes to a locked room's door from the list (or goes away from it). */
  door(room: { code: string; name: string } | null) {
    this.knock = room && { code: room.code, name: room.name, wrong: false, seq: ++this.#knocks };
  }

  /** Where the fly is now. */
  get here(): PlaceId {
    return this.#here;
  }

  /** The listed rooms, while Online is showing them. */
  get rooms() {
    return this.#lobby?.rooms ?? null;
  }

  get lobbyStatus() {
    return this.#lobby?.status ?? "connecting";
  }

  /** The list of rooms is open while Online is up and this device is at none (on its other faces too, so that coming back to the list finds it as it is). */
  #browse(dt: number) {
    // In a room open to everyone the list is there too, to go to another from.
    const wanted = this.nav.current === "online" && this.canPlayOnline && (!this.online || this.online.everyone || this.#pending);
    if (wanted && !this.#lobby && this.#openSocket) this.#lobby = new Lobby(this.#openSocket, roomsUrl(location.href, this.#app));
    else if (!wanted && this.#lobby) {
      this.#lobby.close();
      this.#lobby = null;
    }
    this.#lobby?.update(dt);
    // A room server newer than this page: the newer page speaks its protocol.
    if (this.#lobby?.status === "version") tryProtocolReload(this.#app, reloadForNewerProtocol);
  }

  /** Starts typing into a field as a tap on it lifts, while the browser still counts it as the player's doing. */
  #typeOnTap(x: number, y: number) {
    const hit = this.#hitAt(x, y);
    const current = this.nav.current;
    if (hit?.kind === MENU_HITS.row && sameTarget(this.#typingHit, hit) && current !== "play") (this.screens[current] as Screen).typeNow?.(hit.index, hit.id ?? "");
  }

  /** The link to the table this device is at. */
  get tableLink(): string | null {
    return this.online && typeof location !== "undefined" ? inviteLink(location.href, this.online.code, this.#app) : null;
  }

  /** A share sheet or a clipboard to hand the link on with: not on the Apple TV, where a phone scans the room's QR code instead. */
  get canShare() {
    return typeof navigator !== "undefined" && (typeof navigator.share === "function" || !!navigator.clipboard);
  }

  /** Hands the table's link on: the share sheet, or the clipboard. Called from a press. */
  shareTable(): Promise<Shared> {
    const link = this.tableLink;
    return link ? share(link) : Promise.resolve("failed");
  }

  /** The room as the screens show it: each other device there by its player, with its flies' colours. */
  get table(): TableNow | null {
    const online = this.online;
    const link = this.tableLink;
    if (!online || !link || this.#pending) return null;
    return { name: online.room?.name ?? null, code: online.code, link, starting: online.starting, joined: online.joined, everyone: online.everyone, others: devicesOf(online.others.list, this.#devices) };
  }

  /** A fly's clock, as every fly's here keeps it: the real time of day, and the sun's times where the TV can tell them. */
  #rhythm() {
    return new Rhythm(clockHours(new Date()), this.outside.sunTimes ?? SUMMER, undefined, this.settings.pace);
  }

  /** How many flies this device lives now, the followed one among them. */
  get flies() {
    return 1 + this.company.list.length;
  }

  /** How many the player keeps, as many as this device can live (less any whose brains wouldn't run). */
  #fliesWanted() {
    return Math.max(1, Math.min(this.maxFlies - this.company.lost, this.settings.flies));
  }

  /**
   * As many flies as there should be: alone, as many as the player keeps
   * (once the first fly's brain is awake, so that every brain after it finds
   * the connectome already here); at a table, as many as the table seated,
   * asking it again when the player changes how many.
   */
  #flock() {
    if (this.settings.flies !== this.#fliesChosen) {
      this.#fliesChosen = this.settings.flies;
      this.company.lost = 0;
    }
    // A companion whose brain wouldn't run, even given new ones, is taken off: alone the rest move up in line, at a table it asks for one fewer.
    if (this.company.tend(this.time)) {
      if (!this.online) this.#colourAlone();
      this.#companyChanged();
    }
    const online = this.online;
    if (online) {
      if (online.joined) online.recount(this.#fliesWanted());
      return;
    }
    const wanted = this.#fliesWanted() - 1;
    const company = this.company.list;
    if (wanted === company.length || (wanted > company.length && this.brain.status !== "running")) return;
    this.company.resize(wanted, this.life.pantry);
    this.#colourAlone();
    this.#companyChanged();
  }

  /** Alone, each of the company wears the colour of its place in line. */
  #colourAlone() {
    const list = this.company.list;
    for (let i = 0; i < list.length; i++) {
      list[i].id = 0;
      list[i].colour = COLOURS[(i + 1) % COLOURS.length];
    }
  }

  /** The table seats these of this device's flies, in line: as many as it lives, each in its colour. */
  #seated(flies: readonly SeatedFly[]) {
    this.company.resize(Math.min(this.maxFlies, flies.length) - 1, this.life.pantry);
    for (const [i, c] of this.company.list.entries()) {
      c.id = flies[i + 1].id;
      c.colour = flies[i + 1].colour;
    }
    this.#markFollowed(flies[0].colour);
    this.#companyChanged();
  }

  /** The followed fly's enamel: its colour at a table; alone, the first colour when there are others to tell it from. */
  #markFollowed(colour: string | null) {
    if (colour === this.#mark) return;
    this.#mark = colour;
    this.fly.model.mark(colour);
  }

  /** The company has changed: their eyes, and their middles for the bubbles. */
  #companyChanged() {
    const list = this.company.list;
    this.eyes.company(list.map((c) => c.life));
    while (this.#middles.length < list.length) this.#middles.push(new THREE.Vector3());
    this.#middles.length = list.length;
    this.#companyAt.length = 0;
    for (const c of list) this.#companyAt.push(c.life.body.position);
    this.#fliesAt.length = 1;
    for (const c of list) this.#fliesAt.push(c.life.body.position);
    if (!this.online) this.#markFollowed(list.length > 0 ? COLOURS[0] : null);
    this.overlay.dirty = true;
  }

  /** Every fly this device lives eats from `pantry` from now on. */
  #share(pantry: Pantry) {
    this.life.share(pantry);
    this.company.share(pantry);
  }

  /** The starter takes another device's flies off the table. */
  removeFly(id: number) {
    this.online?.remove(id);
  }

  /** Leaves the table: the fly is alone again where it is, until a visit sits it in its room again (at once, on one). */
  leaveTable() {
    if (!this.online) return;
    const quiet = this.#pending;
    this.online.leave();
    this.#stand("left", quiet);
    this.#auto?.hurry();
  }

  /** `auto`: a visit's room (AutoJoin): how it ends is not news. */
  #sit(code: string, start: TableStart | null, password: string | null = null, auto = false) {
    this.tableEnded = null;
    if (!this.#openSocket) return;
    this.#alone = this.life.pantry;
    this.online = new Online(this.#tableHost, this.#openSocket, roomsUrl(location.href, this.#app), code, this.#seat.key, start, password);
    this.#autoOnline = auto;
    this.#seat.table = code;
    saveTableSeat(this.#seat);
    // A room of the player's own goes in the address, for a reload to come back to; everyone's are anyone's anyway.
    if (everyoneSeries(code) < 0) showInAddress(code);
    this.#lockTools();
  }

  /** Takes the table out of the world: it ended (`why`), or the player left. `quiet`: a visit's try, which nobody needs to hear about. */
  #stand(why: Ended, quiet = false) {
    const online = this.online;
    if (!online) return;
    online.dispose();
    this.online = null;
    this.#autoOnline = false;
    this.tableEnded = quiet ? null : why;
    if (this.canvas.dataset) Online.unpublish(this.canvas.dataset);
    // A locked room: its door, to try its password (again). Quietly, there is no door to come to.
    if (!quiet && why === "locked") {
      this.knock = { code: online.code, name: online.line.lockedName ?? this.knock?.name ?? "", wrong: online.triedPassword, seq: ++this.#knocks };
      if (this.nav.current !== "online") this.open("online");
    } else if (!quiet && why !== "busy") this.knock = null;
    // Its own food again (as it was, if the room never let it in), and its own light and weather, as its shelf had them.
    this.#share(!online.welcomed && this.#alone ? this.#alone : new Pantry(this.life.world, this.life.world.place.patches));
    this.#alone = null;
    // Its flies are its own again, in their colours alone.
    this.#markFollowed(null);
    this.#colourAlone();
    this.#companyChanged();
    for (const id of ["light", "weather"] as const) this.hands.setKind(id, this.#shelf[id]?.kind ?? (id === "light" ? "clock" : "now"));
    this.#lockTools();
    this.#followLight(true);
    this.#seat.table = null;
    saveTableSeat(this.#seat);
    showInAddress(null);
    this.overlay.dirty = true;
  }

  /** At a table, the light, the weather and the place are the starter's to choose; in a room open to everyone, they are each player's own (the place is chosen by going to its room). Building is for home alone. */
  #fixedTools(): ReadonlySet<ToolId> {
    const online = this.online;
    if (!online?.welcomed) return this.#atHome ? NOTHING_FIXED : BUILD_FIXED;
    if (!online.joined || online.starting || online.everyone) return BUILD_FIXED;
    return FIXED_AT_TABLE;
  }

  /** At home: not visiting a room open to everyone (from the moment the player chooses to), and not at a table once it has let this device in. */
  get #atHome() {
    return !this.visiting && !this.online?.welcomed;
  }

  /** The pieces built here are in the world at home, and put away on a visit or at a table (docs/online.md). */
  #buildHere() {
    const home = this.#atHome;
    if (home !== this.builder.active) {
      this.builder.setActive(home);
      this.#rebuilt();
    }
    if (this.hands.fixed !== this.#fixedTools()) this.#lockTools();
  }

  /** What is built has changed: each fly stands on what is under it now, and food lies on it, or falls to it. */
  #rebuilt() {
    const world = this.life.world;
    const bodies = this.company.list;
    for (let i = -1; i < bodies.length; i++) {
      const body = i < 0 ? this.life.body : bodies[i].life.body;
      const p = body.position;
      world.surface(p.x, p.z, body.surface, p.y + TOUCH);
    }
    for (const food of this.life.pantry.foods) food.y = world.heightAt(food.x, food.z, food.y + TOUCH);
    for (const f of this.hands.falling) f.floor = world.heightAt(f.x, f.z, f.y);
  }

  /** Uses the Build tool where the hand is: sets the piece down, turns it, takes it away, or clears them. */
  #build() {
    const hands = this.hands;
    const action = buildAction(hands.variant.id);
    const aim = action && !hands.fixed.has("build") ? this.#pointBuild() : null;
    if (action && aim && this.builder.use(action, this.#fliesAt, this.life.pantry.foods)) {
      hands.events.built = true;
      this.#rebuilt();
      this.#learn("build");
      this.haptics.feel("drop");
      return;
    }
    hands.events.blocked = true;
    this.#refuse();
  }

  /** What the Build tool in hand points at, if it is in hand and building is on here. */
  #pointBuild(): Aim | null {
    const hands = this.hands;
    const action = hands.current.id === "build" && !hands.fixed.has("build") ? buildAction(hands.variant.id) : null;
    return action && this.builder.point(action, hands.pointer, hands.following, this.life.body.position, this.#fliesAt, this.life.pantry.foods);
  }

  #lockTools() {
    this.hands.fixed = this.#fixedTools();
  }

  /** The table, each frame: its line, the others, and how it ends. */
  #table(dt: number) {
    const online = this.online;
    if (!online) return;
    online.update(dt, this.director.camera, this.time, this.#floorAt);
    if (this.hands.fixed !== this.#fixedTools()) this.#lockTools();
    // A room open to everyone may not be the one asked for: a reload comes back to the one it is.
    if (online.welcomed && this.#seat.table !== online.code) {
      this.#seat.table = online.code;
      saveTableSeat(this.#seat);
      this.#auto?.at(online.code);
    }
    const ended = online.ended;
    if (!ended) return;
    // A page from before the server's last deploy: the newer page speaks its protocol.
    if (ended === "version" && tryProtocolReload(this.#app, reloadForNewerProtocol)) return;
    // On a visit: alone again, quietly, and perhaps another try later.
    const quiet = this.#autoOnline;
    if (quiet) this.#auto?.ended(ended);
    this.#stand(ended, quiet);
    // A room of someone's own gone: home again (a visit, unless it can't be, waits there to try again).
    if (!quiet) this.#settlePlace();
    if (ended === "version" && !quiet && this.nav.current !== "online") this.open("online");
  }

  /** On a visit, sitting in the room open to everyone it is visiting once the brain is awake, and going to another place's room when the visit moves there: or giving up a try that comes to nothing, quietly. */
  #autoJoin(dt: number) {
    const auto = this.#auto;
    if (!auto) return;
    const online = this.online;
    const mine = online && this.#autoOnline ? online : null;
    const now = this.#autoNow;
    now.enabled = this.settings.visit >= 0;
    now.awake = !this.#loading && this.brain.status === "running";
    now.network = typeof navigator === "undefined" || navigator.onLine !== false;
    // At a locked room's door in Online, on the way in: sat in the visit's room now, the door would give way to that room's face.
    now.atRoom = !!online || (!!this.knock && this.nav.current === "online");
    now.series = Math.max(0, this.settings.visit);
    now.atSeries = mine?.welcomed ? everyoneSeries(mine.code) : -1;
    const act = auto.update(dt, now, !!mine?.welcomed, (mine?.line.reconnects ?? 0) > 0);
    if (act === "join") this.#sit(auto.code, null, null, true);
    else if (act === "switch" && mine) {
      mine.leave();
      this.#stand("left", true);
      // Carried there at once, as alone, while its room lets it in; Everyone's say where they are once they have.
      const place = seriesPlace(now.series);
      if (place !== null && isPlaceId(place)) this.moveTo(place);
      this.#sit(auto.code, null, null, true);
    } else if (act === "abandon" && mine) {
      mine.leave();
      this.#stand("left", true);
    }
  }

  /** What the table hears of the player with its fly: whether it is living, at the remote, and where the hand is. */
  #playerNow(): PlayerNow {
    const p = this.#player;
    const playing = this.nav.current === "play" && !this.wallpaper;
    p.away = typeof document !== "undefined" && document.hidden;
    p.handsOut = playing;
    p.playing = playing && (performance.now() - Math.max(this.remote.lastInputAt, this.devices.at)) / 1000 < QUIET_AFTER;
    p.holding = playing && (this.remote.held.has("select") || (this.#controls.holding && this.#aim.onWorld));
    this.#copyEye();
    p.eye = this.#eye;
    return p;
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
    if (!first) {
      this.#inputs.pointers?.cancel();
      this.#letGo();
    }
    // The Apple TV's frame is the one everything starts in: nothing to resize there.
    if (frame !== TV_FRAME) {
      this.stage.resize(frame);
      this.overlay.resize(frame);
      this.director.setAspect(frame.aspect);
    }
    this.#hudLayout = hudLayout(frame, !this.devices.pointing && this.settings.hints);
    this.#hud.layout = this.#hudLayout;
    this.#loadingLayout = loadingLayout(frame);
    this.eyes.layout(frame, this.#hudLayout);
    this.#layCorners(true);
    if (!first) for (const screen of Object.values(this.screens)) screen.layout(frame);
    this.#frameRoom();
    this.overlay.dirty = true;
  }

  /** Lays out the pictures in the corners for the screen and the size and stats chosen, if any has changed (or `now`). */
  #layCorners(now = false) {
    const { overlaySize, statsKind } = this.settings;
    const reserveHints = !this.devices.pointing && this.settings.hints;
    if (this.#hudLayout.reserveHints !== reserveHints) {
      this.#hudLayout = hudLayout(this.display.frame, reserveHints);
      this.#hud.layout = this.#hudLayout;
      now = true;
    }
    const laid = this.#laidOut;
    if (!now && laid.size === overlaySize && laid.kind === statsKind) return;
    laid.size = overlaySize;
    laid.kind = statsKind;
    const frame = this.display.frame;
    const size = OVERLAY_SIZES[overlaySize];
    this.inset.layout(frame, this.#hudLayout, size);
    this.nerves.layout(frame, this.#hudLayout, size);
    this.statsPanel.layout(frame, this.#hudLayout, size, statsKind);
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

  /** Optional host hook, never polled by the frame loop. */
  accessibilityChanged: (() => void) | null = null;
  get loading() { return this.#loading; }
  menuChanged() { this.accessibilityChanged?.(); }

  /** Host commands consume their input before the next frame can wake Watch. */
  accessInput() {
    this.devices.at = performance.now();
    this.#seenInput = this.devices.at;
    if (this.wallpaper) this.#stopWallpaper();
  }

  get screen(): ScreenId {
    return this.nav.current;
  }

  // The Shell, for the screens.

  open(screen: ScreenId) {
    this.nav.push(screen);
    this.#entered();
  }

  /** Back a screen. From play, to the menu; at the menu, back to play, if there has been any (on the Apple TV, Back there leaves the app before it gets here). */
  back() {
    if (this.nav.current === "play") this.#toMenu();
    else if (this.nav.pop()) this.#entered();
    else if (this.#played) this.play();
  }

  play() {
    this.#played = true;
    this.#learn("arrival");
    this.nav.reset("title");
    this.nav.push("play");
    this.#entered();
  }

  watch() {
    this.play();
    this.#startWallpaper();
  }

  /** The menu, from play, with Play to carry on under the focus. */
  #toMenu() {
    this.nav.reset("title");
    this.screens.title.menu.focusOn("play");
    this.#entered();
  }

  applySettings(save = true) {
    const s = this.settings;
    this.haptics.enabled = s.rumble;
    // Stepped to in Settings, a place waits until the player settles on it: carried to each on the way, the fly would build every one.
    this.#placeChoice.changed();
    // The player chose a picture: take it at its word until the device shows it can't keep up.
    if (save && this.quality && (s.pixels !== this.#chosen.pixels || s.eyes !== this.#chosen.eyes)) this.quality.reset();
    this.#chosen.pixels = s.pixels;
    this.#chosen.eyes = s.eyes;
    this.#applyPicture();
    this.director.wallpaperStyle = s.wallpaperCamera;
    if (this.outside.enabled !== s.realWeather) {
      this.outside.enabled = s.realWeather;
      this.#clockAt = 0;
    }
    // The flies' clocks take a new pace when they are next put right: on the next frame.
    if (this.life?.rhythm && this.life.rhythm.pace !== s.pace) this.#clockAt = 0;
    if (save) saveSettings(s);
  }

  /** The pixels and eyes the player chose, or cheaper ones if this device can't afford them or sustain them. */
  #applyPicture() {
    const s = this.settings;
    const limit = this.quality?.current;
    const warm = this.warmth?.current;
    let pixels = limit ? cheaperPixels(s.pixels, limit.pixels) : s.pixels;
    if (warm) pixels = cheaperPixels(pixels, warm.pixels);
    if (pixels !== this.stage.pixels) this.stage.setPixels(pixels);
    this.eyes.detail = limit ? cheaperEyes(s.eyes, limit.eyes) : s.eyes;
    this.eyes.rate = limit?.eyesRate ?? 1;
    this.#qualitySeen = this.quality?.changes ?? 0;
    this.#warmthSeen = this.warmth?.changes ?? 0;
  }

  /** Frames a second the game draws at most: what this device can afford, and sustain. */
  get fps() {
    return Math.min(this.quality?.current.fps ?? 60, this.warmth?.current.fps ?? 60);
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

  /** The page is hidden: the fly's life stops with the frames; at a table, its fly rests there. */
  sleep() {
    this.online?.away(this.#playerNow());
    this.tally.save();
    this.#keepFlies();
  }

  /** Saves each fly as it is now. */
  #keepFlies() {
    const now = Date.now();
    this.remembered.save(0, this.life, this.#here, now);
    for (const c of this.company.list) this.remembered.save(c.slot, c.life, this.#here, now);
  }

  /** The page is back after `awayMs`: everything carries on from where it was, under the sky of the hour it is now. */
  wake(awayMs: number) {
    this.#lastNow = -1;
    // Its body lives the time out as it would have (fly-record.ts), from the hour its clock stopped at; the clock is put right on the next frame.
    const sun = this.outside.sunTimes ?? SUMMER;
    liveAway(this.life, awayMs / 1000, this.life.rhythm?.hours ?? 0, sun);
    for (const c of this.company.list) liveAway(c.life, awayMs / 1000, c.life.rhythm?.hours ?? 0, sun);
    this.#clockAt = 0;
    this.online?.wake();
    if (this.online) this.#followLight(awayMs > AWAY_SETTLE_MS);
    else if (awayMs > AWAY_SETTLE_MS) {
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

  /** Whether the player is on Settings' "Where it lives". */
  #choosingPlace() {
    return this.nav.current === "settings" && this.screens.settings.menu.focused?.id === "place";
  }

  /** Carries the fly home, to the place it lives, if it is at home and isn't there. On a visit, or at a table, the room has the place; in the screensaver, it may be going round them. */
  #settlePlace() {
    const place = this.settings.place;
    if (!this.online && this.settings.visit < 0 && !this.wallpaper && place !== this.#here) this.moveTo(place);
  }

  /** Carries the fly to another place: the world fades out, the place is built behind the veil, and fades in. */
  moveTo(id: PlaceId, table = false) {
    // At a table, only the table moves the fly.
    if (id === this.#here || this.#moving?.to === id || (this.online && !table)) return;
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
    // A place built in steps is finished a step a frame before the veil lifts.
    if (moving.arrived && this.stage.buildMore()) {
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
    this.tour.arrived();
    this.stage.load(scene);
    this.life.move(scene.place);
    this.builder.enter(id, scene.place);
    for (const [i, c] of this.company.list.entries()) {
      const [x, z, yaw, y] = companionSpot(this.life.world, i);
      c.life.setDown(x, z, yaw, y);
    }
    this.prints.clear();
    this.hands.clear();
    this.director.useScene(scene.camera);
    this.#settle();
    this.online?.arrived();
  }

  /** Everything that follows the place the fly is in, besides the world and the stage. */
  #settle() {
    const scene = this.stage.current;
    for (const object of this.stage.set.seen) this.eyes.see(object);
    this.bubbles.enabled = scene.bubbles;
    this.fireflies.enabled = scene.fireflies;
    this.hands.surface = placeInfo(scene.id).surface;
    this.hands.choosePlace(scene.id);
    this.overlay.dirty = true;
  }

  #entered() {
    const current = this.nav.current;
    if (current !== "online") this.typing?.end();
    if (current !== "play") this.screens[current].enter();
    this.#frameRoom();
    this.#syncCamera();
    this.#grip = this.#grip && { kind: "spent" };
    this.#controls.spend();
    this.director.held = false;
    this.overlay.dirty = true;
    this.menuChanged();
  }

  #syncCamera() {
    // The menu and what it opens keep the title's shot; once the menu has faded for the wallpaper, the fly is filmed as it is in play's.
    const playing = !this.#loading && this.nav.current === "play";
    this.director.title = !playing && !this.wallpaper;
    if (!playing || this.wallpaper) {
      if (!this.director.wallpaper) this.director.startWallpaper();
    } else {
      this.director.stopWallpaper();
      const view = this.hands.view;
      this.director.setView(view === "eyes" ? "follow" : view === "inside" ? "close" : view);
    }
  }

  #startWallpaper() {
    if (this.wallpaper) return;
    this.wallpaper = true;
    this.hands.release();
    this.#controls.reset();
    this.director.startWallpaper();
    this.director.title = false;
  }

  #stopWallpaper() {
    this.wallpaper = false;
    this.#syncCamera();
    // Gone round the places while watched: home for play.
    this.#settlePlace();
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
      this.menuChanged();
    }
    if (this.#loading) {
      if (brain.status !== "loading" && this.#awakeAt < 0) { this.#awakeAt = this.time; this.menuChanged(); }
      const hold = brain.status === "running" ? (arriving(brain) && brain.source.storageFull ? AWAKE_HOLD_NOTE : AWAKE_HOLD) : arriving(brain) ? Infinity : 3;
      if (this.#awakeAt >= 0 && this.time - this.#awakeAt > hold) {
        this.#loading = false;
        this.#entered();
        // Asked once the title is up, not over the loading screen: the first time, the TV asks whether it may know where it is.
        this.outside.begin();
      }
    }

    this.#input(dt);
    this.#placeChoice.update(dt);
    this.#move(dt);
    this.#table(dt);
    this.#buildHere();
    this.#flock();
    this.#autoJoin(dt);
    this.#browse(dt);
    this.#drawOthers(dt);
    // Going round the places in the screensaver, it moves on during a long one (at home: a room's place is the room's).
    if (!this.#moving) {
      const next = this.tour.next(dt, this.#here, this.wallpaper, !this.online && this.settings.visit < 0, this.settings.wallpaperPlaces === "turns");
      if (next) this.moveTo(next);
    }

    const playing = this.nav.current === "play" && !this.wallpaper;
    this.#copyEye();
    const holding = remote.held.has("select") || (this.#controls.holding && this.#aim.onWorld);
    this.hands.update(dt, { use: false, holding: playing && holding, eye: this.#eye }, life.body, life.pantry);
    this.#held = this.hands.stroking || this.hands.blowing ? this.#held + dt : 0;
    if (this.#held > HOLD_TAUGHT) this.#learn(this.hands.current.id);
    this.#live(dt);
    this.#feel();
    this.eyes.beforeStep();
    life.step(dt, now);
    this.#liveCompany(dt, now);
    this.tally.update(life, Date.now(), dt);
    if (this.remembered.due(dt)) this.#keepFlies();
    this.#reactions();
    this.#paddle(dt);
    const hands = this.hands;
    this.haptics.held(playing && hands.current.id === "feather" ? Math.max(hands.stroke, this.#companyStroke) : 0, hands.blowing ? (hands.variant.id === "strong" ? 1 : 0.55) : 0, dt);
    this.meter.update(life.brain, now);
    if (this.quality) {
      // Loading and the building of a place aren't this device's everyday pace.
      const steady = !this.#loading && !this.#moving && this.#lastNow >= 0;
      this.quality.frame(steady ? now - this.#lastNow : 0, steady && life.brain.status === "running" ? this.meter.speed : -1);
      if (this.quality.changes !== this.#qualitySeen) this.#applyPicture();
    }
    const warmth = this.warmth;
    if (warmth) {
      // The device's warmth goes on whatever is shown; where it is held starts from the place's own.
      if (warmth.place !== this.#here) warmth.enter(this.#here);
      warmth.update(dt);
      if (warmth.changes !== this.#warmthSeen) this.#applyPicture();
    }
    this.#lastNow = now;
    // Peaks of the brief things scripts wait for, held for a few seconds.
    const command = life.brain.state?.command;
    const rates = life.brain.state?.stats.rates;
    const fade = Math.exp(-dt / 3);
    this.peaks.escape = Math.max(this.peaks.escape * fade, command?.escape ?? 0);
    this.peaks.loom = Math.max(this.peaks.loom * fade, life.sensed.loomLeft, life.sensed.loomRight);
    this.peaks.looming = Math.max(this.peaks.looming * fade, rates?.["vision.looming left"] ?? 0, rates?.["vision.looming right"] ?? 0);
    this.glow.update(life.brain.regionRates, dt, rates);
    this.fly.update(life.body, life.intent, life.eating, life.hunger.fullness, dt, life.songSide, life.activity === "sleeping");
    this.prints.update(this.fly.model, life.body.onFeet, this.fly.pose.groom > 0.02, life.world, life.pantry, this.time);
    this.online?.send(this.#playerNow());
    director.update(life.body, dt);
    this.#xray(dt);
    if (this.time > this.#clockAt) this.#followLight();
    stage.update(this.time, dt, director.camera);
    this.#clouds();
    // Fireflies shelter from the rain.
    this.fireflies.update(this.time, stage.light.stars * (1 - stage.weather.rain), director.camera);
    this.#air.set(this.hands.air.x + this.#felt.air.x, this.hands.air.y + this.#felt.air.y, this.hands.air.z + this.#felt.air.z);
    this.bubbles.rain = stage.weather.rain;
    const middle = this.#middle.set(life.body.position.x, life.body.position.y + 0.75, life.body.position.z);
    this.bubbles.lightBy(stage.light);
    const company = this.company.list;
    for (let i = 0; i < company.length; i++) {
      const p = company[i].life.body.position;
      this.#middles[i].set(p.x, p.y + 0.75, p.z);
    }
    this.bubbles.update(this.time, dt, director.camera, stage.light.sunDirection, this.#air, middle, this.#middles);
    if (this.hands.ball.active) this.bubbles.popNear(this.hands.ball.position, BALL_RADIUS);
    this.handsView.opacity += ((this.nav.current === "play" && !this.wallpaper ? 1 : 0) - this.handsView.opacity) * Math.min(1, dt * 5);
    this.handsView.update(this.hands, life.pantry, director.camera, this.time, dt, this.#floorAt, life.body.position);
    this.#buildAim = playing ? this.#pointBuild() : null;
    this.kit.update(this.builder, this.#buildAim, this.hands.variant.id === "remove", this.handsView.opacity, this.time, stage.light, stage.weather, (stage.current.open ?? 1) >= 1);

    this.#overlay(dt);

    // With the graphics context lost there is nothing to draw into: the fly lives on, unseen, until it is back.
    if (!this.glLost) {
      stage.beginFrame();
      stage.render(director.camera, dt);
      this.touchLoupe?.update(stage.renderer, this.shape, this.#aim.x, this.#aim.y, this.devices.current === "touch" && this.#controls.holding && this.#aim.onWorld && playing);
      const showEyes = this.#showEyes();
      const screen = this.#loading ? "loading" : this.nav.current;
      const settings = this.settings;
      const eyesWanted = insetWanted(settings.eyesInset, screen, this.wallpaper, showEyes, this.eyes.detail === "off" || brain.status !== "running");
      const nervesNow = nervesWanted(settings.nerves, screen, this.wallpaper, showEyes);
      const statsNow = statsWanted(settings.statsPanel, screen, this.wallpaper, showEyes);
      this.#layCorners();
      this.corners.update(dt, eyesWanted === "show" || nervesNow === "show" || statsNow === "show", this.wallpaper, director.shotChanges);
      // What it sees takes the corner itself; its nervous system is next to it, or there when it isn't; the stats across from them, or under them. None comes in where another still shows.
      const opacity = OVERLAY_OPACITIES[settings.overlayOpacity];
      const pictures = this.#pictures;
      const slot = nervesSlot(eyesWanted);
      const statsAt = statsSlot(this.statsPanel.layoutNow, eyesWanted, nervesNow);
      this.inset.update(dt, waitFor(eyesWanted, this.corners, 0, this.inset, pictures), this.corners, opacity);
      this.nerves.update(dt, waitFor(nervesNow, this.corners, slot, this.nerves, pictures), this.corners, slot, opacity);
      const stats = this.#statsState;

      stats.spikes = this.meter.spikesPerSecond;
      stats.active = this.meter.active;
      stats.speed = this.meter.speed;
      stats.head = this.meter.head;
      stats.day = this.tally.day;
      stats.brain = life.brain.state;
      this.statsPanel.update(dt, waitFor(statsNow, this.corners, statsAt, this.statsPanel, pictures), this.corners, statsAt, opacity, stats);
      this.eyes.render(dt, showEyes, this.hands.ball.active, this.inset.watching);
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

  /** How far the fly is drawn as glass with its nervous system showing, for the next frame. */
  #xray(dt: number) {
    const screen = this.#loading ? "loading" : this.nav.current;
    const inside = this.hands.view === "inside";
    const rows = worldSize(this.display.frame, this.stage.pixels).height;
    const pixels = pixelsLong(this.director.camera, this.fly.root.position, FLY_LENGTH, rows);
    this.xray.update(dt, xrayWanted(this.settings.xray, screen, this.wallpaper, inside), pixels);
    this.fly.model.nerves.xray = this.xray.amount;
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
    around.pantry = this.life.pantry;
    around.shared = this.online?.joined ? this.online.shared : null;
    live.call(this.stage.set, dt, around);
  }

  /**
   * Every fly but the followed one drawn where it is now, and every fly this
   * device lives put in the others' way: before any of them lives its frame.
   */
  #drawOthers(dt: number) {
    const camera = this.director.camera;
    const pixels = this.shape.height / (2 * Math.tan((camera.fov * Math.PI) / 360));
    const body = this.life.body;
    this.others.update(this.online?.now ?? 0, dt, camera.position, pixels, body);
    this.others.crowd(this.life.crowd, body, body);
    const company = this.company.list;
    for (let i = 0; i < company.length; i++) this.others.crowd(company[i].life.crowd, company[i].life.body, body);
  }

  /**
   * The other flies this device lives, each its frame: what the hands (this
   * player's and, at a table, the others'), the bubbles and the place do to
   * it, as they reach the followed fly, and what it does about it. The
   * followed fly has lived its frame already.
   */
  #liveCompany(dt: number, now: number) {
    const list = this.company.list;
    this.#companyStroke = 0;
    if (list.length === 0) return;
    const hands = this.hands;
    const online = this.online;
    const set = this.#moving ? null : this.stage.set;
    const own = this.life.stimuli;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const { life, felt, air } = c;
      felt.air.x = felt.air.y = felt.air.z = 0;
      felt.touch = 0;
      felt.looming.length = 0;
      set?.feel?.(dt, life.body.position, felt);
      air.x = felt.air.x;
      air.y = felt.air.y;
      air.z = felt.air.z;
      const stroked = hands.reach(life.body, air);
      if (stroked >= 1) hands.stroking = true;
      this.#companyStroke = Math.max(this.#companyStroke, stroked);
      const stimuli = life.stimuli;
      stimuli.stroke = Math.max(stroked, this.bubbles.brushedBy[i], felt.touch, online?.reach(life.body, air) ?? 0);
      stimuli.air = air;
      // What could loom is wherever it is: the same balls, bubbles and visitors as the followed fly's, and what the place says of this one.
      stimuli.looming.length = 0;
      stimuli.looming.push(hands.looming[0]);
      if (this.bubbles.enabled) pushAll(stimuli.looming, this.bubbles.looming);
      pushAll(stimuli.looming, felt.looming);
      if (online) pushAll(stimuli.looming, online.looming);
      stimuli.threat = own.threat;
      life.step(dt, now);
    }
    this.company.pose();
  }

  /** What the hands and the world do to the fly this frame, for its senses. */
  #feel() {
    const { stimuli } = this.life;
    const hands = this.hands;
    const felt = this.#felt;
    const online = this.online;
    // The feather (this player's, or another's at a table), a bubble that burst on it last frame, or something from the place itself (a raindrop).
    stimuli.stroke = Math.max(hands.stroke, this.bubbles.brushed, felt.touch, online?.stroke ?? 0);
    // A puff from the player (and the others at a table) and the place's own air (a gust) together.
    const air = this.#puff;
    air.x = hands.air.x + felt.air.x + (online?.air.x ?? 0);
    air.y = hands.air.y + felt.air.y + (online?.air.y ?? 0);
    air.z = hands.air.z + felt.air.z + (online?.air.z ?? 0);
    stimuli.air = air;
    // Things that could loom: the balls, the bubbles, and whatever comes by.
    stimuli.looming.length = 0;
    stimuli.looming.push(hands.looming[0]);
    if (this.bubbles.enabled) for (const b of this.bubbles.looming) stimuli.looming.push(b);
    for (const l of felt.looming) stimuli.looming.push(l);
    if (online) for (const l of online.looming) stimuli.looming.push(l);
    stimuli.threat = hands.ball.active ? hands.ball.position : (online?.threat ?? null);
  }

  #reactions() {
    const { life } = this;
    const ev = life.body.events;
    if (ev.jumped && this.nav.current === "play" && !this.wallpaper) this.haptics.feel("takeoff");
    const tools = this.hands.events;
    if (tools.dropped) this.haptics.feel("drop");
    if (tools.landed && !this.wallpaper) this.haptics.feel("land");
    if (tools.swooped) this.haptics.feel("swoop");
  }

  /** A press that can't do anything: felt in a pad or a phone. */
  #refuse() {
    this.haptics.feel("blocked");
  }

  /** Sets the light and the weather to the tools' choices; on "Now", to the clock's and the weather outside's (or the forecast's), looked at again every few seconds. With `settle`, there at once. */
  #followLight(settle = false) {
    const now = new Date();
    // Each fly's own clock is set right from the real hour and today's sun, at a table too: they live here.
    const hours = clockHours(now);
    const sun = this.outside.sunTimes ?? SUMMER;
    const pace = this.settings.pace;
    this.life?.rhythm?.setTime(hours, sun, pace);
    // Before the company is made, the first time.
    if (this.company) for (const c of this.company.list) c.life.rhythm?.setTime(hours, sun, pace);
    // At a table its clock is the starter's, and its weather the forecast's from that clock: the same for everyone there.
    const tableHours = this.online?.hours() ?? null;
    if (tableHours !== null) {
      this.hands.outside = false;
      const time = this.hands.timeOfDay;
      if (time === "clock") this.stage.light.follow(hourOfDay(tableHours), settle);
      else this.stage.setTime(time);
      const weather = this.hands.weather;
      if (weather === "now") this.stage.weather.follow(tableHours, settle);
      else this.stage.weather.choose(weather, settle);
      this.#clockAt = this.time + CLOCK_EVERY;
      return;
    }
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

  #input(dt: number) {
    const { remote, devices } = this;
    const { pointers, keyboard, pads } = this.#inputs;
    const nowMs = performance.now();
    pads?.poll(dt, nowMs, this.nav.current !== "play" || this.#loading);
    // A press, a finger on the remote, a tap or a click, a key, a pad, a mouse moved as if meant: not a nudge of the desk.
    const pressed = remote.presses.length > 0 || remote.touch.touching || devices.at > this.#seenInput;
    this.#seenInput = devices.at;
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
    } else if (!this.#loading && after > 0 && idle > after && (current === "play" || (current === "title" && !this.teachingMenu)) && !this.#grip && !this.#controls.pressed && !this.director.held && !keyboard?.holding) {
      // Not while a finger or a button is still down on something, however still.
      this.#startWallpaper();
    }
    this.uiAlpha += ((this.wallpaper ? 0 : 1) - this.uiAlpha) * Math.min(1, dt * (this.wallpaper ? 1.2 : 6));

    if (this.#loading) {
      // The same focused control retries a failure or opens the world while it waits.
      const touched = remote.touch.touching && !this.#touchWas;
      this.#touchWas = remote.touch.touching;
      let select = touched && this.brain.status === "failed";
      for (const press of remote.presses) if (press.button === "select" && !press.repeat) select = true;
      if (pointers) for (const g of pointers.gestures) {
        if (g.type !== "up" || !g.tap) continue;
        const kind = this.#hitAt(g.x, g.y)?.kind;
        if (kind === LOADING_HITS.retry || kind === LOADING_HITS.explore) select = true;
      }
      if (select) {
        if (this.brain.status === "failed") this.retryBrain();
        else {
          this.#loading = false;
          this.play();
          this.outside.begin();
        }
      }
      remote.presses.length = 0;
      return;
    }
    for (const press of remote.presses) {
      const screen = this.nav.current;
      if (screen === "play") this.#playPress(press.button, press.repeat);
      else if (isArrow(press.button) && !this.#ringShown) {
        // After a mouse or a finger the menus show no focus: the first arrow shows where it is, on what was last pressed.
        this.#ringShown = true;
      } else if (press.button === "playPause" && !press.repeat) {
        // Play/Pause plays, or carries on, from anywhere in the menus, as on any TV.
        this.play();
      } else this.screens[screen].press(press.button, press.repeat);
    }
    const playing = this.nav.current === "play" && !this.wallpaper;
    if (keyboard && playing) {
      for (const action of keyboard.actions) {
        if (action.kind === "tool") this.#chooseTool(action.index);
        else this.#home();
      }
    }
    if (playing && (remote.dx !== 0 || remote.dy !== 0)) {
      // With the View tool in hand the hand has nothing to do, so a swipe turns the camera, as a drag does.
      if (this.hands.current.id === "view") this.#turnCamera(-remote.dx * SWIPE_ROUND, -remote.dy * SWIPE_UP);
      else this.#movePointer(remote.dx, remote.dy);
    }
    if (playing) this.#steer(dt);
    if (pointers) {
      for (const g of pointers.gestures) this.#gesture(g);
      this.#followAim();
      this.#setCursor();
    }
    this.#ringShown = !devices.pointing;
  }

  /** The camera, by keys held (Q and E round, W and S up, + and − in and out) and a pad's right stick and triggers. */
  #steer(dt: number) {
    const { keyboard, pads } = this.#inputs;
    let round = 0;
    let up = 0;
    let zoom = 0;
    if (keyboard) {
      round += keyboard.turn * KEY_ROUND;
      up += keyboard.tilt * KEY_UP;
      zoom += keyboard.zoom * KEY_ZOOM;
    }
    if (pads) {
      round += pads.look.x * PAD_ROUND;
      up += pads.look.y * PAD_UP;
      zoom += pads.zoom * PAD_ZOOM;
      if (pads.home) this.#home();
    }
    const turning = round !== 0 || up !== 0;
    // Let go only when they are let go themselves: a finger or the mouse may be holding the camera too.
    if (turning) {
      this.director.held = true;
      this.#turnCamera(round * dt, up * dt);
    } else if (this.#turning) this.director.held = false;
    this.#turning = turning;
    if (zoom !== 0) this.#zoomCamera(Math.exp(zoom * dt));
  }

  /** The camera turned by hand, unless the player is looking through the fly's eyes, where there is no camera to turn. */
  #turnCamera(yaw: number, pitch: number) {
    if (this.hands.view !== "eyes") this.director.turnBy(yaw, pitch);
  }

  /** The camera brought in or taken out by hand; the View tool shows the view it is nearest. */
  #zoomCamera(factor: number) {
    if (this.hands.view === "eyes") return;
    const director = this.director;
    director.zoomBy(factor);
    this.#viewFollows();
  }

  /** The View tool names the view the camera is at or nearest, as the hand moves it (not through the fly's eyes or inside it, which it stays on). */
  #viewFollows() {
    const view = this.director.view;
    const hands = this.hands;
    if (hands.view === view || hands.view === "eyes" || !(VIEWS as readonly string[]).includes(hands.view)) return;
    hands.chooseView(view);
    this.#shelf.view = { kind: view, at: Date.now() };
    saveShelf(this.#shelf);
    if (hands.current.id === "view") this.#changedAt = this.time;
  }

  /** The camera back to Follow's distance and pitch, at the same yaw. */
  #home() {
    if (this.hands.view === "eyes") return;
    this.director.home();
    this.#viewFollows();
  }

  /** Picks a tool from the shelf by its place (a tap on it, a number key); picking the one in hand steps its kind instead. */
  #chooseTool(index: number) {
    const hands = this.hands;
    if (hands.chooseTool(index)) {
      this.#learn("tools");
      this.#changedAt = this.time;
    } else if (index === hands.tool) {
      // The one in hand again: what Select does with it, on the dial Select steps.
      const dial = hands.current.second ? 1 : 0;
      if (hands.stepVariant(1, true, dial)) this.#variantChanged(dial);
    }
  }

  /** The tool's kind on a dial, stepped by a pointer: round and round. */
  #stepKind(dir: -1 | 1, dial: Dial) {
    if (this.hands.stepVariant(dir, true, dial)) this.#variantChanged(dial);
    else this.#refuse();
  }

  /** Uses the tool in hand where the pointer is, as Select does. */
  #useTool() {
    const hands = this.hands;
    if (hands.current.id === "build") {
      this.#build();
      return;
    }
    this.#copyEye();
    hands.update(0, { use: true, holding: true, eye: this.#eye }, this.life.body, this.life.pantry);
    if (hands.events.blocked) this.#refuse();
  }

  /** Carries the fly to the place chosen on the Place tool, if it isn't there; whether it went. */
  #goToPlace(): boolean {
    const hands = this.hands;
    const online = this.online;
    if (hands.place === this.#here) {
      this.#refuse();
      return false;
    }
    // On a visit, it visits that place's room instead (#autoJoin), carried there at once while it isn't in one; home stays where it was.
    if (this.settings.visit >= 0 && (!online || (online.everyone && this.#autoOnline))) {
      this.settings.visit = seriesFor(hands.place);
      saveSettings(this.settings);
      if (!online) this.moveTo(hands.place);
      this.#learn("place");
      return true;
    }
    // At a table only its starter carries it, and only to a place a table can be in.
    if (online && (!online.starting || !Object.hasOwn(WORLDS, hands.place))) {
      this.#refuse();
      return false;
    }
    // At a table the whole table goes, when the table says so.
    if (online) {
      online.choosePlace(hands.place);
      this.#learn("place");
      return true;
    }
    // At home: it lives there now.
    this.settings.place = hands.place;
    saveSettings(this.settings);
    this.moveTo(hands.place);
    this.#learn("place");
    return true;
  }

  /** What was drawn under a point on the screen (0 to 1 across and down), if the overlay shows what is current. */
  #hitAt(x: number, y: number): Hit | null {
    const hits = this.overlay.hits;
    if (hits.owner !== (this.#loading ? "loading" : this.nav.current)) return null;
    const { width, height } = this.shape.design;
    // Play targets already take a finger; padding them steals taps on the nearby world.
    const hit = hits.at(x * width, y * height, this.nav.current === "play" ? 0 : touchSlop(this.shape));
    return hit?.kind === "panel" && this.nav.current === "play" ? null : hit;
  }

  /** One gesture of a pointer, sent where it belongs: a menu, or play (controls.ts). */
  #gesture(g: Gesture) {
    const grip = this.#grip;
    if (grip?.kind === "spent") {
      if (g.type === "up" || g.type === "cancel") this.#grip = null;
      return;
    }
    if (this.wallpaper) {
      // Nothing acts on the wallpaper; only what was already held is let go.
      if (g.type === "up" || g.type === "cancel") this.#letGo();
      return;
    }
    if (this.nav.current !== "play") {
      this.#aim.active = false;
      this.#screenGesture(g);
      return;
    }
    this.#controls.gesture(g, this.#target, this.devices.current === "mouse");
  }

  /** What the pointer's gestures act on in play. */
  #playTarget(): PlayTarget {
    return {
      tool: () => toolUse(this.hands.current.id),
      hudAt: (x, y) => this.#hitAt(x, y),
      aim: (x, y, follow) => this.#aimAt(x, y, follow),
      unaim: () => {
        this.#aim.active = false;
      },
      use: () => {
        this.#useTool();
        if (this.hands.events.dropped) this.#learn("feed");
        if (this.hands.events.swooped) this.#learn("swoop");
      },
      pressHud: (hit) => this.#pressHud(hit),
      stepKind: (dir, dial) => this.#stepKind(dir, dial),
      stepTool: (dir) => this.#chooseTool((this.hands.tool + dir + TOOLS.length) % TOOLS.length),
      turn: (yaw, pitch) => this.#turnCamera(yaw, pitch),
      zoom: (factor) => this.#zoomCamera(factor),
      holdCamera: (held) => {
        this.director.held = held;
      },
      home: () => this.#home(),
    };
  }

  /** A press is over without doing what it was going to: nothing is held any more. */
  #letGo() {
    this.#grip = null;
    this.#controls.reset();
    this.#aim.active = false;
    this.director.held = false;
  }

  /** A tap on something on the HUD. */
  #pressHud(hit: Hit) {
    switch (hit.kind) {
      case HUD_HITS.tool:
        this.#chooseTool(hit.index);
        break;
      case HUD_HITS.kind:
      case HUD_HITS.label:
        this.#stepKind(hit.value < 0 ? -1 : 1, hit.index as Dial);
        break;
      case HUD_HITS.go:
        this.#goToPlace();
        break;
      case HUD_HITS.menu:
        this.#toMenu();
        break;
    }
  }

  /** A pointer on a menu or the About page: told in design units, with what was drawn under it. A right click is Back, anywhere. */
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
      case "leave":
        // Over nothing now.
        p.hit = null;
        p.type = "hover";
        screen.point(p);
        return;
      case "down":
        if (g.button === 2) {
          this.#grip = { kind: "spent" };
          this.back();
          return;
        }
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
          p.hit = this.#hitAt(g.x, g.y);
          p.tap = g.tap && sameTarget(grip.hit, p.hit);
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
    if (hit) {
      this.hands.movePointer(hit.point, hit.normal);
      this.#learn("hand");
    }
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
      else if (this.#controls.turning) cursor = "grabbing";
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
        this.#changedAt = this.time;
        this.#learn("tools");
        break;
      case "up":
      case "down":
        // Up goes to the earlier kind in the list, as a list reads top to bottom.
        if (hands.stepVariant(button === "up" ? -1 : 1)) this.#variantChanged();
        else if (!repeat) this.#refuse();
        break;
      case "select":
        if (repeat) break;
        if (hands.current.id === "place") {
          if (this.#goToPlace()) this.#learn("place");
        } else if (hands.current.id === "sky" || hands.current.id === "view") {
          // Select steps round the weathers (Up and Down have the times of day) or the views, for a remote held in one hand.
          const dial = hands.current.second ? 1 : 0;
          if (hands.stepVariant(1, true, dial)) this.#variantChanged(dial);
          else this.#refuse();
        } else {
          this.#useTool();
          if (hands.events.dropped) this.#learn("feed");
          if (hands.events.swooped) this.#learn("swoop");
        }
        break;
      case "back":
      case "playPause":
        if (!repeat) this.#toMenu();
        break;
    }
  }

  #variantChanged(dial: Dial = 0) {
    this.#changedAt = this.time;
    const id = this.hands.current.id;
    if (id === "sky" || id === "view") this.#learn(id);
    if (id === "sky") {
      this.#followLight();
      this.online?.chooseWorld(this.hands.timeOfDay, this.hands.weather);
    }
    if (id === "view") this.#syncCamera();
    // A table's light and weather aren't this player's own to come back to; in a room open to everyone they are.
    if (!this.online || this.online.everyone || id !== "sky") this.#remember(dial);
  }

  /** Keeps the kind just chosen on a dial, if it is one a launch comes back to. */
  #remember(dial: Dial) {
    const tool = this.hands.current.id;
    for (const id of Object.keys(KEPT) as DialId[]) {
      if (DIALS[id].tool !== tool || DIALS[id].dial !== dial) continue;
      this.#shelf[id] = { kind: this.hands.kindOf(id), at: Date.now() };
      saveShelf(this.#shelf);
    }
  }

  /** The player has done what a hint shows: it goes, now and on later launches. */
  #learn(lesson: Lesson) {
    if (this.#learned[lesson]) return;
    this.#learned[lesson] = true;
    this.#taught++;
    saveLearned(this.#learned);
  }

  /** The finger moved on the touch surface: the pointer moves the same way across the screen, staying on the world. */
  #movePointer(dx: number, dy: number) {
    this.#touched = true;
    this.#learn("hand");
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
      hud.previewTool = this.#controls.previewTool;
      hud.here = this.#here;
      hud.food = life.senses.tasting.food?.name ?? null;
      hud.hints = this.settings.hints;
      hud.glyphs = glyphs;
      hud.teachSwipe = !this.#touched;
      hud.changed = this.time - this.#changedAt;
      hud.brainRunning = this.brain.status === "running";
      hud.pressed = this.#controls.preview;
      if (this.#showEyes()) {
        const e = this.#eyesInfo;
        e.facets = this.eyes.facets;
        e.standIn = this.eyes.standIn;
        e.off = this.eyes.detail === "off";
        hud.eyes = e;
      } else hud.eyes = null;
      const k = this.#hudKey;
      const pressedChanged = k.pressed !== hud.pressed;
      const changed = pressedChanged || k.preview !== hud.previewTool || k.tool !== this.hands.tool || k.variant !== this.hands.variants[this.hands.tool] || k.activity !== hud.activity || k.food !== hud.food || k.following !== this.hands.following || k.touched !== this.#touched || k.hints !== hud.hints || k.eyes !== !!hud.eyes || k.taught !== this.#taught || k.here !== hud.here || k.fixed !== this.hands.fixed.has(this.hands.current.id) || k.outside !== this.hands.outside || k.surface !== this.hands.surface || k.running !== hud.brainRunning;
      if (changed || hud.changed < 0.3 || ((stats || !hud.brainRunning || needsTeaching(hud)) && this.time - this.#hudAt > 1 / HUD_SHIMMER_FPS)) {
        k.preview = hud.previewTool;
        k.tool = this.hands.tool;
        k.variant = this.hands.variants[this.hands.tool];
        k.activity = hud.activity;
        k.food = hud.food;
        k.following = this.hands.following;
        k.touched = this.#touched;
        k.hints = hud.hints;
        k.eyes = !!hud.eyes;
        k.taught = this.#taught;
        k.here = hud.here;
        k.fixed = this.hands.fixed.has(this.hands.current.id);
        k.outside = this.hands.outside;
        k.surface = this.hands.surface;
        k.running = hud.brainRunning;
        k.pressed = hud.pressed ?? null;
        this.#hudAt = this.time;
        overlay.dirty = true;
      }
      overlay.redraw(dt, current, this.#drawPlay, pressedChanged);

      return;
    }
    const screen = this.screens[current];
    if (screen.update(dt)) overlay.dirty = true;
    overlay.redraw(dt, current, (g, hits) => {
      screen.draw(g, this.time, hits);
      if (stats) drawStats(g, this, this.#hudLayout.statsX, this.#hudLayout.statsY);
    });
  }

  // Kept once, rather than allocating a new redraw closure on every frame.
  #drawPlay = (g: CanvasRenderingContext2D, hits: HitMap) => {
    const hud = this.#hud;
    drawHud(g, this.time, hud, hits);
    if (this.settings.stats) drawStats(g, this, hud.layout.statsX, hud.layout.statsY);
  };

  /** The regions glowing now, brightest first, as id:glow, for scripts to read the nervous system's state. */
  #glowSummary() {
    const g = this.glow.regions;
    const lit: string[] = [];
    for (let r = 0; r < g.length; r++) if (g[r] >= 0.05) lit.push(`${REGIONS[r].id}:${g[r].toFixed(2)}`);
    return lit.sort((a, b) => Number(b.split(":")[1]) - Number(a.split(":")[1])).join(" ");
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
    // Whether the menus show their focus (the remote's, the keys', a pad's): hidden while a pointer is in use.
    const semanticRing = (shown === "title" || shown === "settings" || shown === "online") && this.screens[shown].semanticFocus;
    d.ring = String(shown !== "play" && (this.#ringShown || semanticRing));
    d.tab = shown === "settings" ? settingsTab(this.screens.settings) : "";
    if (shown === "online") this.screens.online.publish(d);
    if (shown === "about") this.screens.about.publish(d);
    d.atRoot = String((window as unknown as Record<string, unknown>)[AT_ROOT_PROPERTY]);
    d.wallpaper = String(this.wallpaper);
    d.brain = life.brain.status;
    d.brainEngine = life.brain.engine ?? "";
    d.neurons = String(life.brain.neurons);
    d.activity = life.activity;
    const r = life.rhythm;
    // The fly's clock and sleep as the brain is told them, and how long it has been still (s).
    d.rhythm = r ? `hours ${r.hours.toFixed(2)} morning ${r.clock.morning.toFixed(2)} evening ${r.clock.evening.toFixed(2)} sleep ${r.clock.sleep.toFixed(2)} pressure ${r.pressure.toFixed(3)} felt ${r.felt.toFixed(3)} pace ${r.pace} depth ${r.depth.toFixed(2)} still ${r.still.toFixed(0)}` : "";
    d.mode = life.body.mode;
    d.tool = this.hands.current.id;
    d.variant = this.hands.variant.id;
    // The Sky's two dials, chosen: the time of day and the weather.
    d.sky = `${this.hands.timeOfDay}/${this.hands.weather}`;
    d.pointer = this.hands.following ? "following" : "free";
    d.senses = `loom ${s.loomLeft.toFixed(2)}/${s.loomRight.toFixed(2)} touch ${s.touch.toFixed(2)} bump ${s.bumpLeft.toFixed(2)}/${s.bumpRight.toFixed(2)} wind ${s.wind.toFixed(2)} sweet ${s.sweet.toFixed(2)} grounded ${s.grounded ? 1 : 0} male ${s.maleTaste.toFixed(2)} bitter ${s.bitter.toFixed(2)} water ${s.water.toFixed(2)}`;
    d.loom = Math.max(s.loomLeft, s.loomRight).toFixed(3);
    d.touch = s.touch.toFixed(3);
    d.wind = s.wind.toFixed(3);
    d.sweet = s.sweet.toFixed(3);
    d.eaten = life.eaten.toFixed(3);
    d.hunger = life.hunger.level.toFixed(3);
    d.fullness = life.hunger.fullness.toFixed(3);
    d.thirst = life.thirst.level.toFixed(3);
    d.meals = String(life.meals);
    d.food = String(life.pantry.foods.filter(isDropped).length);
    // What is built here, whether it is in the world, where the Build tool points, and what the fly stands on.
    d.built = String(this.builder.pieces.length);
    d.building = this.builder.active ? "on" : "off";
    const aim = this.#buildAim;
    d.buildAim = !aim || aim.showing === "none" ? "" : `${aim.showing === "piece" ? aim.piece.kind : `piece ${aim.target}`} ${aim.ok ? "ok" : "blocked"} ${aim.piece.x.toFixed(1)},${aim.piece.z.toFixed(1)}`;
    const under = life.body.surface.solid;
    d.standsOn = !life.body.onFeet ? "" : under >= 0 ? life.world.solids[under].name : "floor";
    d.prints = String(this.prints.prints.count(this.time));
    d.takeoffs = String(life.takeOffs);
    d.escape = (life.brain.state?.command.escape ?? 0).toFixed(3);
    d.escapePeak = this.peaks.escape.toFixed(3);
    d.loomPeak = this.peaks.loom.toFixed(3);
    d.loomingHz = this.peaks.looming.toFixed(1);
    d.feed = (life.brain.state?.command.feed ?? 0).toFixed(3);
    d.sing = (life.brain.state?.command.sing ?? 0).toFixed(3);
    d.maleTaste = s.maleTaste.toFixed(3);
    d.eyes = this.eyes.inUse ? "brain" : this.eyes.active ? "picture" : "off";
    d.eyesInset = this.inset.state;
    d.nerves = this.nerves.state;
    d.statsPanel = this.statsPanel.state;
    const day = this.tally.day;
    d.day = `walked ${day.walked.toFixed(1)} meals ${day.meals} takeoffs ${day.takeOffs} flown ${day.flown.toFixed(1)} groomed ${day.groomed.toFixed(1)}`;
    d.xray = this.xray.amount.toFixed(2);
    d.glow = this.#glowSummary();
    d.calls = String(this.stage.cost.calls);
    d.triangles = String(this.stage.cost.triangles);
    d.textures = String(this.stage.cost.textures);
    d.geometries = String(this.stage.cost.geometries);
    d.programs = String(this.stage.cost.programs);
    d.brainSpeed = this.meter.speed.toFixed(3);
    d.frameMs = this.frameMsAverage.toFixed(2);
    d.eyesMs = this.eyes.costMs.toFixed(2);
    d.eyesUpdates = String(this.eyes.updates);
    d.eyesGain = this.eyes.gain.toFixed(2);
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
    // This device's flies: how many, the followed one's neighbours as its body meets them, and each other one as it lives (its table id, its brain,
    // what it is doing, where, its eyes' pictures so far, and how many flies its body meets).
    d.flies = String(this.flies);
    // Where the followed fly stands; and who each is, by its place in line (the followed fly first), and when it first arrived (ms since 1970).
    d.at = `${life.body.position.x.toFixed(2)},${life.body.position.z.toFixed(2)}`;
    d.kept = [0, ...this.company.list.map((c) => c.slot)]
      .map((slot) => {
        const fly = this.remembered.get(slot);
        return `${slot}:${fly?.id ?? ""}:${fly?.born ?? ""}`;
      })
      .join(";");
    d.crowd = String(life.crowd.count);
    d.company = this.company.list
      .map((c, i) => `${c.id}:${c.life.brain.status}:${c.life.activity}:${c.life.body.position.x.toFixed(2)},${c.life.body.position.z.toFixed(2)}:${this.eyes.companyUpdates(i)}:${c.life.crowd.count}:${c.colour}`)
      .join(";");
    d.view = this.hands.view;
    d.place = this.#here;
    // Where it lives, and the series of rooms open to everyone it is visiting (-1 at home).
    d.home = this.settings.place;
    d.visit = String(this.settings.visit);
    d.placeMs = this.stage.buildMs.toFixed(0);
    d.placeStepMs = this.stage.buildStepMs.toFixed(0);
    d.moving = this.#moving ? this.#moving.to : "";
    d.table = this.online ? "yes" : "";
    d.roomName = this.online?.room?.name ?? "";
    d.everyone = this.online?.everyone && this.online.welcomed ? "yes" : "";
    d.autoJoin = !this.#auto ? "" : this.#auto.stopped ? "stopped" : this.#auto.trying ? "trying" : "waiting";
    this.online?.publish(d);
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
      d.windowMs = this.quality.frameMs.toFixed(1);
    }
    if (this.warmth) {
      d.warmth = String(this.warmth.level);
      d.thermal = String(this.warmth.state);
    }
    d.fps = String(this.fps);
    d.device = this.devices.current;
    d.frame = `${this.shape.width}x${this.shape.height}`;
    d.yaw = this.director.yaw.toFixed(4);
    d.pitch = this.director.pitch.toFixed(4);
    d.reach = this.director.reach.toFixed(1);
  }
}

/**
 * How this device reaches a room, and whether it is one of the apps: the Apple TV's host bridges
 * a native WebSocket; a browser, and the iPhone and iPad app's web view (fly://), have their own.
 * A page opened from a file has no site to find a room at.
 */
function tableLines(): [OpenTableSocket | null, boolean] {
  if (typeof location === "undefined") return [null, false];
  const bridge = nativeSocketBridge();
  const native = !!(globalThis as { __native?: unknown }).__native;
  const app = inApp(native, location.href);
  if (bridge) return [nativeSockets(bridge), true];
  if (typeof WebSocket === "undefined" || (!app && !/^https?:$/.test(location.protocol))) return [null, app];
  return [(url) => new BrowserSocket(url), app];
}
