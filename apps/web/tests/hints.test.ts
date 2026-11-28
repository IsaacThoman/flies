// The button hints in play: each teaching hint goes once the player has done
// what it shows, and Button hints off hides them all. Nothing is taught in
// words.

import assert from "node:assert/strict";
import { test } from "node:test";
import { World } from "@fly/world";
import type { Place } from "@fly/world";
import type { Learned } from "../src/settings.ts";
import { Hands, toolIndex } from "../src/tools/hands.ts";
import type { ToolId } from "../src/tools/hands.ts";
import { TRAY, Tray } from "../src/tools/tray.ts";
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

/** The tools the hand can hold (the tray's), each a lesson of its own but the empty hand. */
const HELD: readonly ToolId[] = ["hand", "feed", "finger", "feather", "blow", "swoop", "build", "photo"];

function state(tool: ToolId, learned: Learned, hints = true, glyphs: HudState["glyphs"] = "remote"): HudState {
  const hands = new Hands(new World(bare));
  hands.tool = toolIndex(tool);
  return {
    hands,
    tray: new Tray(),
    activity: "resting",
    food: null,
    hints,
    glyphs,
    learned,
    teachSwipe: true,
    presence: 1,
    changed: 10,
    brainRunning: true,
    eyes: null,
    layout: hudLayout(TV_FRAME),
    coarse: false,
    unit: 1,
    canBuild: true,
    unavailable: () => false,
    label: (item) => item.label,
  };
}

/** What the HUD draws with `tool` in hand. */
function shown(tool: ToolId, learned: Learned, hints = true, glyphs: HudState["glyphs"] = "remote") {
  const { g, words, marks } = recorder();
  drawHud(g, 0, state(tool, learned, hints, glyphs), new HitMap());
  return { words, marks };
}

test("hints teach without tutorial captions for every input", () => {
  for (const glyphs of [null, "remote", "keys", "pad"] as const) for (const tool of HELD) {
    const { words } = shown(tool, {}, true, glyphs);
    for (const prose of ["Tools", "Tray", "Drop sugar", "Throw the ball", "Hold to tickle", "Move your hand", "Menu"]) assert.ok(!words.includes(prose), `${tool}: ${prose}`);
  }
});

test("completed lessons and hints off both omit the teaching drawings", () => {
  for (const tool of HELD) {
    const complete: Learned = { tray: true, camera: true, hand: true, [tool]: true };
    const done = shown(tool, complete);
    const off = shown(tool, {}, false);
    const fresh = shown(tool, {});
    assert.deepEqual(done.marks, off.marks, `${tool}: completion costs no more than hints off`);
    assert.ok(fresh.marks.length > done.marks.length, `${tool}: a fresh lesson has a drawing`);
  }
});

test("only visible unfinished lessons need teaching redraws", () => {
  const s = state("hand", { feed: true }, true, null);
  assert.equal(needsTeaching(s), true, "the tray's button shimmers for anyone until it is opened");
  s.learned.tray = true;
  assert.equal(needsTeaching(s), false, "pointer users have no remote-navigation lessons");
  s.glyphs = "remote";
  assert.equal(needsTeaching(s), true);
  s.learned.camera = true;
  s.learned.hand = true;
  assert.equal(needsTeaching(s), false, "the empty hand has no lesson of its own");
  s.hands.tool = toolIndex("build");
  assert.equal(needsTeaching(s), true);
  s.hands.fixed = new Set(["build"]);
  assert.equal(needsTeaching(s), false, "an unavailable tool must not nag");
});

test("the tools the hand can hold are those the tray gives it", () => {
  const taken = new Set(Object.values(TRAY).flat().flatMap((item) => (item.action.kind === "take" ? [item.action.tool] : [])));
  assert.deepEqual([...taken].sort(), [...HELD].sort());
});
