// The button hints in play: each teaching hint goes once the player has done
// what it shows, the way out to the menu stays, and Button hints off hides
// them all.

import assert from "node:assert/strict";
import { test } from "node:test";
import { World } from "@fly/world";
import type { Place } from "@fly/world";
import type { Learned } from "../src/settings.ts";
import { Hands, TOOLS } from "../src/tools/hands.ts";
import type { ToolId } from "../src/tools/hands.ts";
import { drawHud } from "../src/ui/hud.ts";
import type { HudState } from "../src/ui/hud.ts";

/** A 2D context that draws nothing and keeps the words written on it. */
function recorder() {
  const words: string[] = [];
  const gradient = { addColorStop() {} };
  const g = new Proxy({} as Record<string | symbol, unknown>, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === "fillText") return (s: string) => words.push(s);
      if (key === "measureText") return (s: string) => ({ width: s.length * 7 });
      if (key === "createLinearGradient" || key === "createRadialGradient") return () => gradient;
      return () => {};
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  });
  return { g: g as unknown as CanvasRenderingContext2D, words };
}

const bare: Place = { floor: { kind: "rect", hx: 500, hz: 500 }, solids: [], patches: [], start: { x: 0, z: 0, yaw: 0 }, ceiling: 300 };

/** The words on the HUD with `tool` in hand. */
function shown(tool: ToolId, learned: Learned, hints = true) {
  const hands = new Hands(new World(bare));
  hands.tool = TOOLS.findIndex((t) => t.id === tool);
  const state: HudState = { hands, here: "picnic", activity: "resting", food: null, hints, learned, teachSwipe: true, changed: 10, spikes: 0, brainRunning: true, eyes: null };
  const { g, words } = recorder();
  drawHud(g, 0, state);
  return words;
}

test("a new player is shown the shelf, what Select does, how to move the hand, and the menu", () => {
  const words = shown("feed", {});
  for (const hint of ["Tools", "Drop sugar", "Move your hand", "Menu"]) assert.ok(words.includes(hint), hint);
});

test("the shelf's hint goes once the player has gone along it", () => {
  const words = shown("feed", { tools: true });
  assert.ok(!words.includes("Tools"));
  assert.ok(words.includes("Drop sugar"));
});

test("what Select does goes for each tool once it has been used, and not for the others", () => {
  const learned: Learned = { tools: true, feed: true, swoop: true };
  assert.ok(!shown("feed", learned).includes("Drop sugar"));
  assert.ok(!shown("swoop", learned).includes("Throw the ball"));
  assert.ok(shown("feather", learned).includes("Hold to tickle"));
  assert.ok(shown("blow", learned).includes("Hold to blow gently"));
});

test("however much has been learned, the way to the menu and how to move the hand stay", () => {
  const learned: Learned = Object.fromEntries(["tools", ...TOOLS.map((t) => t.id)].map((l) => [l, true]));
  const words = shown("feed", learned);
  assert.ok(words.includes("Menu"));
  assert.ok(words.includes("Move your hand"));
});

test("Button hints off shows none of them", () => {
  const words = shown("feed", {}, false);
  for (const hint of ["Tools", "Drop sugar", "Move your hand", "Menu"]) assert.ok(!words.includes(hint), hint);
});
