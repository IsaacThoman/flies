// Boots the game: the canvas, the remote, the brain and the frame loop.

import { AT_ROOT_PROPERTY } from "@fly/contracts";
import { createBrainDriver } from "./brain/create.ts";
import { fitCanvas } from "./display.ts";
import { Game } from "./game.ts";
import { Remote, mouseAsTouch } from "./input.ts";

const canvas = document.getElementById("game") as HTMLCanvasElement;
fitCanvas(canvas);
const native = !!(globalThis as { __native?: unknown }).__native;
if (!native) mouseAsTouch(canvas);
const remote = new Remote(window);
(window as unknown as Record<string, unknown>)[AT_ROOT_PROPERTY] = true;

const game = new Game(canvas, remote, createBrainDriver());
(globalThis as { __fly?: Game }).__fly = game;

let last = performance.now();
const frame = (now: number) => {
  const dt = Math.min(Math.max(0, (now - last) / 1000), 0.1);
  last = now;
  game.frame(dt, now);
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);
