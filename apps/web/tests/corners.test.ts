// The pictures in a corner (what it sees, its nervous system, its stats): where they go
// on every shape of screen, how they keep moving so that neither burns into a
// screen, and that they never cover each other or what the HUD draws.

import assert from "node:assert/strict";
import { test } from "node:test";
import { TV_FRAME } from "../src/display.ts";
import type { Frame } from "../src/display.ts";
import { insetLayout, insetWanted } from "../src/eyes/inset.ts";
import { NERVES_PANEL, nervesLayout, nervesSlot, nervesWanted } from "../src/nerves/panel.ts";
import { OVERLAY_SIZES } from "../src/settings.ts";
import type { OverlaySize, ShowWhen, StatsKind } from "../src/settings.ts";
import { statsLayout, statsSlot, statsWanted } from "../src/stats/panel.ts";
import type { StatsLayout } from "../src/stats/panel.ts";
import { TOOLS } from "../src/tools/hands.ts";
import { CORNERS, CORNER_HOLD, CornerDeck, CornerPlacement, waitFor } from "../src/ui/corners.ts";
import type { CornerPicture, CornerWanted } from "../src/ui/corners.ts";
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

/** The pictures, laid out for a screen and placed as the game places them each frame (game.ts). */
class All {
  readonly deck = new CornerDeck();
  readonly eyes: CornerPicture;
  readonly nerves: CornerPicture;
  readonly stats: CornerPicture;
  readonly layout: StatsLayout;
  readonly #all: CornerPicture[];
  constructor(frame: Frame = TV_FRAME, size = 1, kind: StatsKind = "both") {
    const hud = hudLayout(frame);
    const eyes = insetLayout(frame, hud, size), nerves = nervesLayout(frame, hud, size), stats = statsLayout(frame, hud, size, kind);
    this.layout = stats;
    this.eyes = { placement: new CornerPlacement(), at: (c) => eyes.rects[c] };
    this.nerves = { placement: new CornerPlacement(), at: (c, slot) => nerves.rects[c][slot] };
    this.stats = { placement: new CornerPlacement(), at: (c, slot) => stats.rects[c][Math.min(slot, stats.rects[c].length - 1)] };
    this.#all = [this.eyes, this.nerves, this.stats];
  }
  update(dt: number, eyesWanted: CornerWanted, nervesWanted: CornerWanted, statsWanted: CornerWanted, wallpaper: boolean, shotChanges: number) {
    const deck = this.deck, all = this.#all;
    deck.update(dt, eyesWanted === "show" || nervesWanted === "show" || statsWanted === "show", wallpaper, shotChanges);
    const slot = nervesSlot(eyesWanted);
    const statsAt = statsSlot(this.layout, eyesWanted, nervesWanted);
    this.eyes.placement.update(dt, waitFor(eyesWanted, deck, 0, this.eyes, all), deck.goal, 0);
    this.nerves.placement.update(dt, waitFor(nervesWanted, deck, slot, this.nerves, all), deck.goal, slot);
    this.stats.placement.update(dt, waitFor(statsWanted, deck, statsAt, this.stats, all), deck.goal, statsAt);
  }
  /** Where each is on screen now, if it shows at all. */
  shown(): Rect[] {
    return this.#all.filter((p) => p.placement.alpha > 0).map((p) => p.at(p.placement.corner, p.placement.slot));
  }
}

test("in the Follow wallpaper, which never changes shot, they move on together at least once a minute, and so does any of them alone", () => {
  const cases: [boolean, boolean, boolean][] = [
    [true, true, false],
    [false, true, false],
    [false, false, true],
    [true, true, true],
  ];
  for (const [eyesOn, nervesOn, statsOn] of cases) {
    const all = new All();
    const moves: number[] = [];
    const one = statsOn ? all.stats : all.nerves;
    let last = one.placement.corner;
    for (let f = 0; f < 60 * 300; f++) {
      all.update(1 / 60, eyesOn ? "show" : "hide", nervesOn ? "show" : "hide", statsOn ? "show" : "hide", true, 0);
      if (one.placement.corner !== last) {
        moves.push(f / 60);
        last = one.placement.corner;
      }
      const up = [all.eyes, all.nerves, all.stats].filter((p) => p.placement.alpha === 1);
      for (const p of up) assert.equal(p.placement.corner, up[0].placement.corner, "with the deck, whenever they show");
    }
    assert.ok(moves.length >= 4, `${moves.length} moves in five minutes`);
    for (let k = 1; k < moves.length; k++) assert.ok(moves[k] - moves[k - 1] <= CORNER_HOLD + 2, `moved after ${(moves[k] - moves[k - 1]).toFixed(1)} s`);
    assert.ok(moves[0] <= CORNER_HOLD + 2);
  }
});

test("whatever happens, at every shape, size and choice of stats, they never overlap on screen, not even while one comes in and another goes, and keep moving", () => {
  const settings: ShowWhen[] = ["off", "wallpaper", "always"];
  for (const [name, frame] of [["the TV", TV_FRAME] as const, ...frames()]) {
    for (const size of Object.values(OVERLAY_SIZES)) {
      for (const kind of ["brain", "day", "both", "signals"] as const) {
        const all = new All(frame, size, kind);
        let seed = 7;
        const chance = (p: number) => (seed = (seed * 16807) % 2147483647) / 2147483647 < p;
        let eyesSetting: ShowWhen = "wallpaper", nervesSetting: ShowWhen = "wallpaper", statsSetting: ShowWhen = "wallpaper";
        let wallpaper = true, full = false, shots = 0, overlapsSeen = 0, together = 0, moves = 0;
        for (let f = 0; f < 60 * 300; f++) {
          if (chance(0.004)) wallpaper = !wallpaper;
          if (chance(0.002)) eyesSetting = settings[f % 3];
          if (chance(0.002)) nervesSetting = settings[(f >> 3) % 3];
          if (chance(0.002)) statsSetting = settings[(f >> 5) % 3];
          if (chance(0.002)) full = !full;
          if (chance(0.003)) shots++;
          all.update(1 / 60, insetWanted(eyesSetting, "play", wallpaper, full, false), nervesWanted(nervesSetting, "play", wallpaper, full), statsWanted(statsSetting, "play", wallpaper, full), wallpaper, shots);
          const shown = all.shown();
          if (shown.length === 3) together++;
          for (let i = 0; i < shown.length; i++) for (let j = i + 1; j < shown.length; j++) if (overlaps(shown[i], shown[j])) overlapsSeen++;
          if (all.deck.goal !== CORNERS[0] && f % 60 === 0) moves++;
        }
        const where = `${name}, size ${size}, ${kind}`;
        assert.equal(overlapsSeen, 0, `${where}: frames where they overlapped`);
        assert.ok(together > 60 * 10 && moves > 15, `${where}: all three up together for ${(together / 60).toFixed(0)} s, away from the first corner ${moves} s`);
      }
    }
  }
});

test("at every shape, size and choice of stats, at every corner, they are inside the safe area, clear of each other and of the caption, the menu's button, the shelf, the label and the hints", () => {
  for (const [name, frame] of [["the TV", TV_FRAME] as const, ...frames()]) {
    const hud = hudLayout(frame);
    const a = safeRect(frame);
    const inside = (r: Rect) => r.x >= a.x - 1e-6 && r.y >= a.y - 1e-6 && r.x + r.width <= a.x + a.w + 1e-6 && r.y + r.height <= a.y + a.h + 1e-6;
    const shelf = { x: hud.shelfLeft, y: hud.shelfY - 26, width: hud.gap * TOOLS.length + hud.apart, height: 52 };
    const label = { x: hud.cx - 110, y: hud.labelY - 17, width: 220, height: 32 };
    const caption = { x: hud.cx - 70, y: hud.captionY - 15, width: 140, height: 30 };
    // The remote's chip for the menu is wider than the pointer's button.
    const menu = { x: hud.menuX, y: hud.menuY - 18, width: 90, height: 36 };
    const rightHint = { x: hud.rightX - 200, y: hud.rightY - 15, width: 200, height: 30 };
    const leftHints = { x: hud.hintsX, y: hud.hintsY - 34 - 12, width: 200, height: 34 + 24 };
    for (const sizeName of Object.keys(OVERLAY_SIZES) as OverlaySize[]) {
      const size = OVERLAY_SIZES[sizeName];
      const eyes = insetLayout(frame, hud, size);
      const nerves = nervesLayout(frame, hud, size);
      for (const kind of ["brain", "day", "both", "signals"] as const) {
        const stats = statsLayout(frame, hud, size, kind);
        const where = `${name}, ${sizeName}, ${kind}`;
        for (const corner of CORNERS) {
          const [alone, next] = nerves.rects[corner];
          for (const [what, r] of [["what it sees", eyes.rects[corner]], ["its nervous system alone", alone], ["its nervous system next to what it sees", next], ...stats.rects[corner].map((r, i) => [`the stats at slot ${i}`, r] as const)] as const) {
            assert.ok(inside(r), `${where}: ${corner}, ${what}, inside the safe area`);
            for (const [zone, z] of Object.entries({ shelf, label, caption })) assert.ok(!overlaps(r, z), `${where}: ${corner}, ${what}, and the ${zone}`);
          }
          assert.ok(!overlaps(eyes.rects[corner], next), `${where}: ${corner}, the two`);
          // The stats, at the place they take for whichever of the others show.
          for (const eyesShow of [false, true]) {
            for (const nervesShow of [false, true]) {
              const r = stats.rects[corner][statsSlot(stats, eyesShow ? "show" : "hide", nervesShow ? "show" : "hide")];
              if (eyesShow) assert.ok(!overlaps(r, eyes.rects[corner]), `${where}: ${corner}, the stats and what it sees`);
              if (nervesShow) assert.ok(!overlaps(r, nerves.rects[corner][eyesShow ? 1 : 0]), `${where}: ${corner}, the stats and its nervous system`);
            }
          }
        }
        // While playing they keep to the top right (the stats across from them, or under them), clear of the menu's button and the hints.
        for (const r of [eyes.rects["top-right"], ...nerves.rects["top-right"], ...stats.rects["top-right"]]) {
          for (const [zone, z] of Object.entries({ menu, rightHint })) assert.ok(!overlaps(r, z), `${where}: while playing, and the ${zone}`);
        }
        // The stats may be across at the top left, over the hints at the bottom left.
        for (const r of stats.rects["top-right"]) assert.ok(!overlaps(r, leftHints), `${where}: while playing, the stats and the hints at the bottom left`);
        assert.ok(nerves.scale > 0.3, `${where}: its nervous system big enough to read (${nerves.scale.toFixed(2)}, ${nerves.across ? "beside" : "under"} what it sees)`);
        assert.ok(stats.scale > 0.5, `${where}: the stats big enough to read (${stats.scale.toFixed(2)}, ${stats.across ? "across from" : "under"} the others)`);
      }
    }
  }
});

test("at the TV's medium size the stats are at their full size, across the screen from the others", () => {
  for (const kind of ["brain", "day", "both", "signals"] as const) {
    const stats = statsLayout(TV_FRAME, hudLayout(TV_FRAME), 1, kind);
    assert.equal(stats.scale, 1, kind);
    assert.equal(stats.across, true, kind);
    assert.equal(stats.rects["top-right"][0].x, 16, "with the others at the top right, at the top left");
  }
});

test("the pictures' own size is the corners' medium: what it sees and its nervous system are where they always were", () => {
  for (const [name, frame] of [["the TV", TV_FRAME] as const, ...frames()]) {
    const hud = hudLayout(frame);
    assert.deepEqual(insetLayout(frame, hud, OVERLAY_SIZES.medium), insetLayout(frame, hud), name);
    assert.deepEqual(nervesLayout(frame, hud, OVERLAY_SIZES.medium), nervesLayout(frame, hud), name);
    const small = insetLayout(frame, hud, OVERLAY_SIZES.small).scale, medium = insetLayout(frame, hud).scale, large = insetLayout(frame, hud, OVERLAY_SIZES.large).scale;
    assert.ok(small < medium && medium <= large, `${name}: ${small.toFixed(2)} < ${medium.toFixed(2)} <= ${large.toFixed(2)}`);
  }
});

test("on the TV it is at full size under what it sees", () => {
  const nerves = nervesLayout(TV_FRAME);
  assert.equal(nerves.scale, 1);
  assert.equal(nerves.across, false);
  assert.deepEqual(nerves.rects["top-right"][1], { x: 838 - NERVES_PANEL.width, y: 116, width: NERVES_PANEL.width, height: NERVES_PANEL.height });
});

test("the nervous system shows only in play, never over the loading screen, the title, a menu or the full picture", () => {
  for (const screen of ["loading", "title", "settings", "about"]) {
    assert.equal(nervesWanted("always", screen, false, false), "hide", screen);
    assert.equal(nervesWanted("always", screen, true, false), "hide", `${screen} in the wallpaper`);
  }
  assert.equal(nervesWanted("always", "play", false, true), "hide", "the full picture through its eyes is up");
  assert.equal(nervesWanted("off", "play", true, false), "hide");
  assert.equal(nervesWanted("always", "play", false, false), "show");
  assert.equal(nervesWanted("wallpaper", "play", true, false), "show");
  assert.equal(nervesWanted("wallpaper", "play", false, false), "fade", "the controls are back: it fades with them");
});
