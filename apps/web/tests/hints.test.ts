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
import { HitMap } from "@fly/ui";
import { TV_FRAME } from "../src/display.ts";
import { drawHud, needsTeaching } from "../src/ui/hud.ts";
import type { HudState } from "../src/ui/hud.ts";
import { hudLayout } from "../src/ui/layout.ts";

/** A 2D context that draws nothing and keeps the words written on it. */
function recorder() {
  const words: string[] = [];
  const marks: string[] = [];
  const gradient = { addColorStop() {} };
  const g = new Proxy({} as Record<string | symbol, unknown>, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === "fillText") return (s: string) => words.push(s);
      if (key === "measureText") return (s: string) => ({ width: s.length * 7 });
      if (key === "createLinearGradient" || key === "createRadialGradient") return () => gradient;
      return () => { marks.push(String(key)); };
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  });
  return { g: g as unknown as CanvasRenderingContext2D, words, marks };
}

const bare: Place = { floor: { kind: "rect", hx: 500, hz: 500 }, solids: [], patches: [], start: { x: 0, z: 0, yaw: 0 }, ceiling: 300 };

/** The words on the HUD with `tool` in hand. */
function shown(tool: ToolId, learned: Learned, hints = true, glyphs: HudState["glyphs"] = "remote") {
  const hands = new Hands(new World(bare));
  hands.tool = TOOLS.findIndex((t) => t.id === tool);
  const state: HudState = { hands, here: "picnic", activity: "resting", food: null, hints, glyphs, learned, teachSwipe: true, changed: 10, brainRunning: true, eyes: null, layout: hudLayout(TV_FRAME) };
  const { g, words, marks } = recorder();
  drawHud(g, 0, state, new HitMap());
  return { words, marks };
}

test("tool hints teach without tutorial captions for every input", () => {
  for (const glyphs of [null, "remote", "keys", "pad"] as const) for (const tool of TOOLS) {
    const { words } = shown(tool.id, {}, true, glyphs);
    for (const prose of ["Tools", "Drop sugar", "Throw the ball", "Hold to tickle", "Hold to blow gently", "Move your hand", "Menu"]) assert.ok(!words.includes(prose), `${tool.id}: ${prose}`);
  }
});

test("completed lessons and hints off both omit physical-tool teaching drawings", () => {
  for (const tool of TOOLS.map((tool) => tool.id)) {
    const complete: Learned = { tools: true, hand: true, [tool]: true };
    const done = shown(tool, complete);
    const off = shown(tool, {}, false);
    const fresh = shown(tool, {});
    assert.deepEqual(done.marks, off.marks, `${tool}: completion costs no more than hints off`);
    assert.ok(fresh.marks.length > done.marks.length, `${tool}: a fresh lesson has a drawing`);
  }
});


test("only visible unfinished lessons need teaching redraws", () => {
  const hands = new Hands(new World(bare));
  const state: HudState = { hands, here: "picnic", activity: "resting", food: null, hints: true, glyphs: null, learned: { feed: true }, teachSwipe: true, changed: 10, brainRunning: true, eyes: null, layout: hudLayout(TV_FRAME) };
  assert.equal(needsTeaching(state), false, "pointer users have no remote-navigation lessons");
  state.glyphs = "remote";
  assert.equal(needsTeaching(state), true);
  state.learned.tools = true;
  state.learned.hand = true;
  assert.equal(needsTeaching(state), false);
  hands.tool = TOOLS.findIndex((t) => t.id === "light");
  assert.equal(needsTeaching(state), true);
  hands.fixed = new Set(["light"]);
  assert.equal(needsTeaching(state), false, "an unavailable control must not nag");
});
