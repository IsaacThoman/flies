// Boots the game: the screen, what the player holds, the brain and the frame
// loop. In a browser also the page's lifecycle (page.ts) and the frame rate
// this device can afford (quality.ts); if it can't draw at all, it says so.

import { accessibilityEnabled, browserAccessibility } from "./accessibility/browser.ts";
import { AT_ROOT_PROPERTY } from "@fly/contracts";
import type { NativeThermal } from "@fly/contracts";
import { HitMap } from "@fly/ui";
import { Display } from "./display.ts";
import { createBrains } from "./brain/create.ts";
import { Game } from "./game.ts";
import type { Inputs } from "./game.ts";
import { Devices, Gamepads, Keyboard, Pointers, Remote, initialDevice } from "./input.ts";
import { Page } from "./page.ts";
import { Quality, Warmth } from "./quality.ts";
import { loadingLayout } from "./ui/layout.ts";
import { drawFailure } from "./ui/loading.ts";
import { drawWordmark } from "./ui/wordmark.ts";

let canvas = document.getElementById("game") as HTMLCanvasElement;
if (canvas.dataset.boot) {
  const screen = document.createElement("canvas");
  screen.id = "game";
  screen.width = canvas.width;
  screen.height = canvas.height;
  canvas.replaceWith(screen);
  canvas = screen;
}
// The Apple TV host: the remote is all there is, and the screen never changes.
const native = !!(globalThis as { __native?: unknown }).__native;
const display = new Display(native);
const devices = new Devices(initialDevice(native, display.frame.coarse));
const remote = new Remote(window, undefined, devices, native ? "remote" : "keys");
const inputs: Inputs = { devices };
if (!native) {
  const pointers = new Pointers(() => canvas.getBoundingClientRect(), undefined, devices);
  pointers.attach(canvas);
  inputs.pointers = pointers;
  inputs.keyboard = new Keyboard(window, remote, devices);
  inputs.pads = new Gamepads(remote, devices, () => navigator.getGamepads?.() ?? [], window);
}
(window as unknown as Record<string, unknown>)[AT_ROOT_PROPERTY] = true;

let game: Game | null = null;
try {
  game = new Game(canvas, remote, createBrains(), display, inputs);
} catch (error) {
  if (native) throw error;
  cannotDraw(error);
}

if (game) {
  (globalThis as { __fly?: Game }).__fly = game;
  let page: Page | null = null;
  // A host that says how hot the device is: the game holds to what it can sustain.
  const thermal = (globalThis as { __native?: { thermalState?: NativeThermal } }).__native?.thermalState;
  if (thermal) game.warmth = new Warmth(() => thermal(), storage());
  if (!native) {
    game.quality = new Quality(storage(), (globalThis as { __quality?: number }).__quality ?? null);
    game.applySettings(false);
    page = new Page(game, canvas);
    if (accessibilityEnabled(location.search)) browserAccessibility(game);
    Page.keepForOffline();
  } else {
    // The host stops frames in the background and says so: a room hears at once that the fly is
    // away, and coming back the line to it is opened again at once.
    let hiddenAt = 0;
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        hiddenAt ||= Date.now();
        game.sleep();
      } else if (hiddenAt) {
        const away = Date.now() - hiddenAt;
        hiddenAt = 0;
        game.wake(away);
      }
    });
  }
  let last = performance.now();
  // How often the display offers a frame (ms, smoothed), and when the next one the game draws is due.
  let offeredEvery = 1000 / 60;
  let offered = -1;
  let due = 0;
  const frame = (now: number) => {
    requestAnimationFrame(frame);
    // Browsers stop frames for a hidden tab, but not all of them always (an occluded window, a headless one): the fly's life stops anyway.
    if (page?.asleep) {
      offered = -1;
      return;
    }
    if (offered >= 0) offeredEvery += (Math.min(100, now - offered) - offeredEvery) * 0.1;
    offered = now;
    const every = 1000 / game.fps;
    // Only a display well over the game's rate is held back (120 Hz, or 60 Hz when the game wants 40 or 30): one
    // just over it would otherwise lose a frame every few seconds, a judder in every pan.
    if (every > offeredEvery * 1.33) {
      if (now < due - offeredEvery / 2) return;
      due = Math.max(due + every, now);
    }
    page?.update();
    const dt = Math.min(Math.max(0, (now - last) / 1000), 0.1);
    last = now;
    game.frame(dt, now);
  };
  requestAnimationFrame(frame);
}

function storage() {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** No WebGL 2 (or it couldn't start): the failure, drawn in 2D on the same canvas at the screen's shape, and a reload to try again. */
function cannotDraw(error: unknown) {
  console.error(error);
  const g = canvas.getContext("2d");
  if (canvas.dataset) {
    canvas.dataset.screen = "loading";
    canvas.dataset.brain = "failed";
    canvas.dataset.failure = "webgl";
  }
  if (!g) return;
  const hits = new HitMap();
  const draw = () => {
    display.update();
    const frame = display.frame;
    if (canvas.width !== frame.width || canvas.height !== frame.height) {
      canvas.width = frame.width;
      canvas.height = frame.height;
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    const sky = g.createLinearGradient(0, 0, 0, frame.height);
    sky.addColorStop(0, "#5aa9ec");
    sky.addColorStop(1, "#cfeaff");
    g.fillStyle = sky;
    g.fillRect(0, 0, frame.width, frame.height);
    g.setTransform(frame.width / frame.design.width, 0, 0, frame.height / frame.design.height, 0, 0);
    const layout = loadingLayout(frame);
    drawWordmark(g, layout.wordmark.x, layout.wordmark.y, layout.wordmark.size);
    hits.begin("loading");
    drawFailure(g, "webgl", "", null, layout, hits);
    requestAnimationFrame(draw);
  };
  draw();
  // Anything at all tries again: there is nothing else to do here.
  const retry = (event: Event) => {
    if (event instanceof KeyboardEvent && event.key !== "Enter") return;
    location.reload();
  };
  window.addEventListener("keydown", retry);
  canvas.addEventListener("pointerup", retry);
}
