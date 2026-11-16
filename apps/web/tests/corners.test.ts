// The pictures in a corner (what it sees, its nervous system): where they go
// on every shape of screen, how they keep moving so that neither burns into a
// screen, and that they never cover each other or what the HUD draws.

import assert from "node:assert/strict";
import { test } from "node:test";
import { TV_FRAME } from "../src/display.ts";
import { insetLayout, insetWanted } from "../src/eyes/inset.ts";
import { NERVES_PANEL, nervesLayout, nervesSlot, nervesWanted } from "../src/nerves/panel.ts";
import { TOOLS } from "../src/tools/hands.ts";
import { CORNERS, CORNER_HOLD, CornerDeck, CornerPlacement, waitFor } from "../src/ui/corners.ts";
import type { CornerWanted } from "../src/ui/corners.ts";
import type { ShowWhen } from "../src/settings.ts";
import { hudLayout, safeRect } from "../src/ui/layout.ts";
import { frames } from "./shapes.ts";

type Rect = { x: number; y: number; width: number; height: number };
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** One picture with the deck to itself, as what it sees has when the nervous system is off. */
class One {
  readonly deck = new CornerDeck();
  readonly placement = new CornerPlacement();
  get corner() {
    return this.placement.corner;
  }
  get alpha() {
    return this.placement.alpha;
  }
  update(dt: number, wanted: CornerWanted, wallpaper: boolean, shotChanges: number) {
    this.deck.update(dt, wanted === "show", wallpaper, shotChanges);
    this.placement.update(dt, wanted, this.deck.goal, 0);
  }
}

/** Steps a picture for `seconds` at 60 fps. */
function run(one: One, seconds: number, wanted: CornerWanted, wallpaper: boolean, shotChanges: number) {
  for (let t = 0; t < seconds; t += 1 / 60) one.update(1 / 60, wanted, wallpaper, shotChanges);
}

test("it fades in, moves on a corner at each new wallpaper shot (fading out and back in), and goes at once when hidden", () => {
  const placement = new One();
  run(placement, 0.5, "show", true, 0);
  assert.equal(placement.corner, "top-right");
  assert.ok(placement.alpha > 0.2 && placement.alpha < 0.8, `fading in: ${placement.alpha}`);
  run(placement, 1, "show", true, 0);
  assert.equal(placement.alpha, 1);

  const visited: string[] = [placement.corner];
  for (let shot = 1; shot <= 4; shot++) {
    placement.update(1 / 60, "show", true, shot);
    assert.equal(placement.corner, visited[visited.length - 1], "it fades out where it is before it moves");
    run(placement, 0.6, "show", true, shot);
    assert.notEqual(placement.corner, visited[visited.length - 1]);
    run(placement, 1.2, "show", true, shot);
    assert.equal(placement.alpha, 1);
    visited.push(placement.corner);
  }
  assert.deepEqual(visited, [...CORNERS, CORNERS[0]], "each corner in turn, and round again");

  run(placement, 3, "show", true, 5);
  assert.equal(placement.corner, "bottom-left");
  run(placement, 0.1, "hide", true, 5);
  assert.equal(placement.alpha, 0, "a menu or the full picture: gone at once");
  run(placement, 2, "show", true, 5);
  assert.equal(placement.corner, "bottom-left", "back where it was");
  assert.equal(placement.alpha, 1);
  run(placement, 2, "fade", true, 9);
  assert.equal(placement.corner, "bottom-left", "new shots don't move it while it isn't wanted");
});

test("in a wallpaper that never changes shot it still moves on a corner every so often", () => {
  const placement = new One();
  run(placement, CORNER_HOLD - 1, "show", true, 0);
  assert.equal(placement.corner, CORNERS[0]);
  run(placement, 4, "show", true, 0);
  assert.equal(placement.corner, CORNERS[1]);
  assert.equal(placement.alpha, 1);
});

test("when the controls come back it returns to the top right, the corner they leave clear", () => {
  const placement = new One();
  run(placement, 2, "show", true, 0);
  run(placement, 3, "show", true, 1);
  assert.equal(placement.corner, "bottom-left");
  placement.update(1 / 60, "show", false, 1);
  assert.equal(placement.corner, "bottom-left");
  assert.ok(placement.alpha < 1, "fading out first");
  run(placement, 3, "show", false, 1);
  assert.equal(placement.corner, "top-right");
  assert.equal(placement.alpha, 1);
  run(placement, 1, "fade", false, 1);
  assert.equal(placement.alpha, 0, "only wanted in the wallpaper: gone with it");
});

test("both pictures share a corner and move on together, its nervous system next to what it sees", () => {
  const deck = new CornerDeck(), eyes = new CornerPlacement(), nerves = new CornerPlacement();
  const step = (seconds: number, eyesWanted: CornerWanted, nervesWanted: CornerWanted, wallpaper: boolean, shots: number) => {
    for (let t = 0; t < seconds; t += 1 / 60) {
      deck.update(1 / 60, eyesWanted === "show" || nervesWanted === "show", wallpaper, shots);
      eyes.update(1 / 60, eyesWanted, deck.goal, 0);
      nerves.update(1 / 60, nervesWanted, deck.goal, nervesSlot(eyesWanted));
    }
  };
  step(2, "show", "show", true, 0);
  for (let shot = 1; shot <= 8; shot++) {
    step(2, "show", "show", true, shot);
    assert.equal(eyes.corner, nerves.corner, "the same corner");
    assert.equal(eyes.alpha, 1);
    assert.equal(nerves.alpha, 1);
    assert.equal(nerves.slot, 1, "next to what it sees");
  }
  // What it sees turned off (or its eyes): the nervous system fades out, and back in at the corner itself.
  step(0.1, "hide", "show", true, 8);
  assert.ok(nerves.alpha < 1);
  step(2, "hide", "show", true, 8);
  assert.equal(nerves.slot, 0);
  assert.equal(nerves.alpha, 1);
});

/** Both pictures, placed as the game places them each frame (game.ts). */
class Both {
  readonly deck = new CornerDeck();
  readonly eyes = new CornerPlacement();
  readonly nerves = new CornerPlacement();
  update(dt: number, eyesWanted: CornerWanted, nervesWanted: CornerWanted, wallpaper: boolean, shotChanges: number) {
    this.deck.update(dt, eyesWanted === "show" || nervesWanted === "show", wallpaper, shotChanges);
    const slot = nervesSlot(eyesWanted);
    this.eyes.update(dt, waitFor(eyesWanted, this.deck, 0, this.nerves), this.deck.goal, 0);
    this.nerves.update(dt, waitFor(nervesWanted, this.deck, slot, this.eyes), this.deck.goal, slot);
  }
}

test("in the Follow wallpaper, which never changes shot, they move on together at least once a minute, and so does its nervous system alone", () => {
  for (const eyesOn of [true, false]) {
    const both = new Both();
    const moves: number[] = [];
    let last = both.nerves.corner;
    for (let f = 0; f < 60 * 300; f++) {
      both.update(1 / 60, eyesOn ? "show" : "hide", "show", true, 0);
      if (both.nerves.corner !== last) {
        moves.push(f / 60);
        last = both.nerves.corner;
      }
      if (eyesOn && both.eyes.alpha === 1 && both.nerves.alpha === 1) assert.equal(both.eyes.corner, both.nerves.corner, "in the same corner whenever both show");
    }
    assert.ok(moves.length >= 4, `${moves.length} moves in five minutes`);
    for (let k = 1; k < moves.length; k++) assert.ok(moves[k] - moves[k - 1] <= CORNER_HOLD + 2, `moved after ${(moves[k] - moves[k - 1]).toFixed(1)} s`);
    assert.ok(moves[0] <= CORNER_HOLD + 2);
  }
});

test("whatever happens, at every shape, the two never overlap on screen, not even while one comes in and the other goes", () => {
  const settings: ShowWhen[] = ["off", "wallpaper", "always"];
  for (const [name, frame] of [["the TV", TV_FRAME] as const, ...frames()]) {
    const hud = hudLayout(frame);
    const eyesLayout = insetLayout(frame, hud), nervesAt = nervesLayout(frame, hud);
    const both = new Both();
    let seed = 7;
    const chance = (p: number) => (seed = (seed * 16807) % 2147483647) / 2147483647 < p;
    let eyesSetting: ShowWhen = "wallpaper", nervesSetting: ShowWhen = "wallpaper", wallpaper = true, full = false, shots = 0, overlapsSeen = 0, together = 0, moves = 0;
    for (let f = 0; f < 60 * 600; f++) {
      if (chance(0.004)) wallpaper = !wallpaper;
      if (chance(0.002)) eyesSetting = settings[f % 3];
      if (chance(0.002)) nervesSetting = settings[(f >> 3) % 3];
      if (chance(0.002)) full = !full;
      if (chance(0.003)) shots++;
      both.update(1 / 60, insetWanted(eyesSetting, "play", wallpaper, full, false), nervesWanted(nervesSetting, "play", wallpaper, full), wallpaper, shots);
      const { eyes, nerves } = both;
      if (eyes.alpha > 0 && nerves.alpha > 0) together++;
      if (eyes.alpha > 0 && nerves.alpha > 0 && overlaps(eyesLayout.rects[eyes.corner], nervesAt.rects[nerves.corner][nerves.slot])) overlapsSeen++;
      if (both.deck.goal !== CORNERS[0] && f % 60 === 0) moves++;
    }
    assert.equal(overlapsSeen, 0, `${name}: frames where they overlapped`);
    assert.ok(together > 60 * 60 && moves > 30, `${name}: both up together for ${(together / 60).toFixed(0)} s, away from the first corner ${moves} s`);
  }
});

test("at every shape, at every corner, the two together are inside the safe area, clear of each other and of the caption, the menu's button, the shelf and the label", () => {
  for (const [name, frame] of frames()) {
    const hud = hudLayout(frame);
    const eyes = insetLayout(frame, hud);
    const nerves = nervesLayout(frame, hud);
    const a = safeRect(frame);
    const shelf = { x: hud.shelfLeft, y: hud.shelfY - 26, width: hud.gap * TOOLS.length + hud.apart, height: 52 };
    const label = { x: hud.cx - 110, y: hud.labelY - 17, width: 220, height: 32 };
    const caption = { x: hud.cx - 70, y: hud.captionY - 15, width: 140, height: 30 };
    const menu = { x: hud.menuX, y: hud.menuY - 18, width: 36, height: 36 };
    const rightHint = { x: hud.rightX - 200, y: hud.rightY - 15, width: 200, height: 30 };
    for (const corner of CORNERS) {
      const [alone, next] = nerves.rects[corner];
      for (const [where, r] of [["alone", alone], ["next to what it sees", next]] as const) {
        assert.ok(r.x >= a.x - 1e-6 && r.y >= a.y - 1e-6 && r.x + r.width <= a.x + a.w + 1e-6 && r.y + r.height <= a.y + a.h + 1e-6, `${name}: ${corner}, ${where}, inside the safe area`);
        for (const [zone, z] of Object.entries({ shelf, label, caption })) assert.ok(!overlaps(r, z), `${name}: ${corner}, ${where}, and the ${zone}`);
      }
      assert.ok(!overlaps(eyes.rects[corner], next), `${name}: ${corner}, the two`);
    }
    // While playing they keep to the top right, clear of the menu's button and the hint under them.
    for (const r of [eyes.rects["top-right"], ...nerves.rects["top-right"]]) {
      assert.ok(!overlaps(r, menu), `${name}: the menu's button`);
      assert.ok(!overlaps(r, rightHint), `${name}: the hint at the bottom right`);
    }
    assert.ok(nerves.scale > 0.3, `${name}: big enough to read (${nerves.scale.toFixed(2)}, ${nerves.across ? "beside" : "under"} what it sees)`);
  }
});

test("on the TV it is at full size under what it sees", () => {
  const nerves = nervesLayout(TV_FRAME);
  assert.equal(nerves.scale, 1);
  assert.equal(nerves.across, false);
  assert.deepEqual(nerves.rects["top-right"][1], { x: 838 - NERVES_PANEL.width, y: 116, width: NERVES_PANEL.width, height: NERVES_PANEL.height });
});

test("the nervous system shows only in play, never over the loading screen, the title, a menu or the full picture", () => {
  for (const screen of ["loading", "title", "settings", "about", "brain"]) {
    assert.equal(nervesWanted("always", screen, false, false), "hide", screen);
    assert.equal(nervesWanted("always", screen, true, false), "hide", `${screen} in the wallpaper`);
  }
  assert.equal(nervesWanted("always", "play", false, true), "hide", "the full picture through its eyes is up");
  assert.equal(nervesWanted("off", "play", true, false), "hide");
  assert.equal(nervesWanted("always", "play", false, false), "show");
  assert.equal(nervesWanted("wallpaper", "play", true, false), "show");
  assert.equal(nervesWanted("wallpaper", "play", false, false), "fade", "the controls are back: it fades with them");
});
