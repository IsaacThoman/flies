// Boots the game: the canvas, the remote, the brain and the frame loop. In a
// browser also the page's lifecycle (page.ts) and the frame rate this device
// can afford (quality.ts); if it can't draw at all, it says so.

import { AT_ROOT_PROPERTY } from "@fly/contracts";
import { DESIGN_HEIGHT, DESIGN_WIDTH, RENDER_HEIGHT, RENDER_WIDTH, fitCanvas } from "./display.ts";
import { createBrainDriver } from "./brain/create.ts";
import { Game } from "./game.ts";
import { Remote, mouseAsTouch } from "./input.ts";
import { Page } from "./page.ts";
import { Quality } from "./quality.ts";
import { drawFailure } from "./ui/loading.ts";
import { drawWordmark } from "./ui/wordmark.ts";

const canvas = document.getElementById("game") as HTMLCanvasElement;
fitCanvas(canvas);
const native = !!(globalThis as { __native?: unknown }).__native;
if (!native) mouseAsTouch(canvas);
const remote = new Remote(window);
(window as unknown as Record<string, unknown>)[AT_ROOT_PROPERTY] = true;

let game: Game | null = null;
try {
  game = new Game(canvas, remote, createBrainDriver());
} catch (error) {
  if (native) throw error;
  cannotDraw(error);
}

if (game) {
  (globalThis as { __fly?: Game }).__fly = game;
  let page: Page | null = null;
  if (!native) {
    game.quality = new Quality(storage());
    game.applySettings(false);
    page = new Page(game, canvas);
    Page.keepForOffline();
  }
  let last = performance.now();
  // How often the display offers a frame (ms, smoothed), and when the next one the game draws is due.
  let display = 1000 / 60;
  let offered = -1;
  let due = 0;
  const frame = (now: number) => {
    requestAnimationFrame(frame);
    // Browsers stop frames for a hidden tab, but not all of them always (an occluded window, a headless one): the fly's life stops anyway.
    if (page?.asleep) {
      offered = -1;
      return;
    }
    if (offered >= 0) display += (Math.min(100, now - offered) - display) * 0.1;
    offered = now;
    const every = game.quality ? 1000 / game.quality.current.fps : 0;
    // Only a display well over the game's rate is held back (120 Hz, or 60 Hz when the game wants 30): one just
    // over it would otherwise lose a frame every few seconds, a judder in every pan.
    if (every > display * 1.33) {
      if (now < due - display / 2) return;
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

/** No WebGL 2 (or it couldn't start): the failure, drawn in 2D on the same canvas, and a reload to try again. */
function cannotDraw(error: unknown) {
  console.error(error);
  const g = canvas.getContext("2d");
  if (canvas.dataset) {
    canvas.dataset.screen = "loading";
    canvas.dataset.brain = "failed";
    canvas.dataset.failure = "webgl";
  }
  if (!g) return;
  const start = performance.now();
  const draw = () => {
    const t = (performance.now() - start) / 1000;
    g.setTransform(1, 0, 0, 1, 0, 0);
    const sky = g.createLinearGradient(0, 0, 0, RENDER_HEIGHT);
    sky.addColorStop(0, "#5aa9ec");
    sky.addColorStop(1, "#cfeaff");
    g.fillStyle = sky;
    g.fillRect(0, 0, RENDER_WIDTH, RENDER_HEIGHT);
    g.setTransform(RENDER_WIDTH / DESIGN_WIDTH, 0, 0, RENDER_HEIGHT / DESIGN_HEIGHT, 0, 0);
    drawWordmark(g, DESIGN_WIDTH / 2, 150, 64, t);
    drawFailure(g, "webgl", "", null);
    requestAnimationFrame(draw);
  };
  draw();
  const retry = (event: Event) => {
    if (event instanceof KeyboardEvent && event.key !== "Enter") return;
    location.reload();
  };
  window.addEventListener("keydown", retry);
  canvas.addEventListener("pointerup", retry);
}
