import assert from "node:assert/strict";
import { test } from "node:test";
import { EYE_COLUMNS, facetDirection } from "@fly/brain";
import type { EyeMap } from "@fly/brain";
import { standInEyes } from "@fly/body";
import { TV_DESIGN_HEIGHT as DESIGN_HEIGHT, TV_DESIGN_WIDTH as DESIGN_WIDTH, TV_HEIGHT as RENDER_HEIGHT, TV_WIDTH as RENDER_WIDTH } from "../src/display.ts";
import { TV_FRAME } from "../src/display.ts";
import { CORNERS, CORNER_HOLD, INSET_PICTURE, InsetPlacement, insetLayout, insetRect, insetWanted, layoutFacets } from "../src/eyes/inset.ts";
import { TOOLS } from "../src/tools/hands.ts";
import { hudLayout, safeRect } from "../src/ui/layout.ts";
import { frames } from "./shapes.ts";
import type { InsetWanted } from "../src/eyes/inset.ts";
import { DEFAULT_SETTINGS, loadSettings } from "../src/settings.ts";

type Rect = { x: number; y: number; width: number; height: number };
const TV_HUD = hudLayout(TV_FRAME);
/** The shelf's glass on the TV, both halves. */
const SHELF = { x: TV_HUD.shelfLeft - 8, y: TV_HUD.shelfY - 26, width: TV_HUD.gap * TOOLS.length + TV_HUD.apart + 16, height: 52 };
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Where the HUD draws (ui/hud.ts), in design units, generously: the widest caption, label and hints. */
const HUD = {
  caption: { x: DESIGN_WIDTH / 2 - 120, y: 8, width: 240, height: 36 },
  menuHint: { x: 12, y: 10, width: 100, height: 30 },
  // With the tool chosen standing up out of it.
  shelf: { x: SHELF.x, y: SHELF.y - 8, width: SHELF.width, height: SHELF.height + 8 },
  toolLabel: { x: DESIGN_WIDTH / 2 - 140, y: 360, width: 280, height: 44 },
  leftHints: { x: 12, y: 362, width: 210, height: 100 },
  swipeHint: { x: DESIGN_WIDTH - 230, y: 430, width: 230, height: 30 },
  stats: { x: DESIGN_WIDTH - 320, y: 458, width: 320, height: 20 },
};

/** Steps the placement for `seconds` at 60 fps. */
function run(placement: InsetPlacement, seconds: number, wanted: InsetWanted, wallpaper: boolean, shotChanges: number) {
  for (let t = 0; t < seconds; t += 1 / 60) placement.update(1 / 60, wanted, wallpaper, shotChanges);
}

test("it shows only in play, never over the loading screen, the title, a menu or the full picture, nor with the eyes off", () => {
  for (const screen of ["loading", "title", "pause", "settings", "about", "brain"]) {
    assert.equal(insetWanted("always", screen, false, false, false), "hide", screen);
    assert.equal(insetWanted("always", screen, true, false, false), "hide", `${screen} in the wallpaper`);
  }
  assert.equal(insetWanted("always", "play", false, true, false), "hide", "the full picture is up");
  assert.equal(insetWanted("always", "play", true, false, true), "hide", "the eyes are off");
  assert.equal(insetWanted("off", "play", true, false, false), "hide");
  assert.equal(insetWanted("always", "play", false, false, false), "show");
  assert.equal(insetWanted("always", "play", true, false, false), "show");
  assert.equal(insetWanted("wallpaper", "play", true, false, false), "show");
  assert.equal(insetWanted("wallpaper", "play", false, false, false), "fade", "the controls are back: it fades with them");
});

test("it fades in, moves on a corner at each new wallpaper shot (fading out and back in), and goes at once when hidden", () => {
  const placement = new InsetPlacement();
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
  const placement = new InsetPlacement();
  run(placement, CORNER_HOLD - 1, "show", true, 0);
  assert.equal(placement.corner, CORNERS[0]);
  run(placement, 4, "show", true, 0);
  assert.equal(placement.corner, CORNERS[1]);
  assert.equal(placement.alpha, 1);
});

test("when the controls come back it returns to the top right, the corner they leave clear", () => {
  const placement = new InsetPlacement();
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

test("each corner is on screen and clear of the caption and the shelf; the one used while playing is clear of every hint too", () => {
  for (const corner of CORNERS) {
    const r = insetRect(corner);
    assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.width <= DESIGN_WIDTH && r.y + r.height <= DESIGN_HEIGHT, corner);
    assert.ok(r.width > DESIGN_WIDTH * 0.17 && r.width < DESIGN_WIDTH * 0.23, "about a fifth of the screen's width");
    for (const zone of ["caption", "shelf", "toolLabel"] as const) assert.ok(!overlaps(r, HUD[zone]), `${corner} and the ${zone}`);
  }
  const playing = insetRect(CORNERS[0]);
  for (const [zone, rect] of Object.entries(HUD)) assert.ok(!overlaps(playing, rect), `${CORNERS[0]} and the ${zone}`);
});

function brainEyes(): EyeMap {
  const eye = (side: "left" | "right") => ({ directions: Float32Array.from(EYE_COLUMNS[side].flatMap((row) => facetDirection(side, row[0], row[1]))) });
  return { left: eye("left"), right: eye("right"), acceptance: 0.05 };
}

test("every facet gets a dot on whole pixels inside the picture, left eye on the left, after the panel's instance", () => {
  for (const [name, map] of [["the brain's", brainEyes()], ["the stand-in", standInEyes()]] as const) {
    const offsets = layoutFacets(map);
    const left = map.left.directions.length / 3;
    const n = left + map.right.directions.length / 3;
    assert.equal(offsets.length, (n + 1) * 4, name);
    assert.deepEqual([...offsets.slice(0, 3)], [0, 0, 2], "the panel first, at its own corner");
    // The picture's space in frame pixels, half a pixel's rounding either way.
    const x0 = (INSET_PICTURE.x * RENDER_WIDTH) / DESIGN_WIDTH - 0.5;
    const x1 = ((INSET_PICTURE.x + INSET_PICTURE.width) * RENDER_WIDTH) / DESIGN_WIDTH + 0.5;
    const y0 = (INSET_PICTURE.y * RENDER_HEIGHT) / DESIGN_HEIGHT - 0.5;
    const y1 = ((INSET_PICTURE.y + INSET_PICTURE.height) * RENDER_HEIGHT) / DESIGN_HEIGHT + 0.5;
    let leftX = 0;
    let rightX = 0;
    for (let i = 1; i <= n; i++) {
      const [x, y, side, width] = offsets.slice(i * 4, i * 4 + 4);
      assert.ok(Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(width), `${name} facet ${i} on whole pixels`);
      assert.ok(x >= x0 && x + width <= x1 && y >= y0 && y + 3 <= y1, `${name} facet ${i} at ${x}, ${y} inside the picture`);
      assert.equal(side, i <= left ? 0 : 1);
      if (side === 0) leftX += x / left;
      else rightX += x / (n - left);
    }
    assert.ok(leftX < rightX, `${name}: the left eye on the left`);
  }
});

test("the setting is kept with the others, in the wallpaper by default", () => {
  assert.equal(DEFAULT_SETTINGS.eyesInset, "wallpaper");
  const store = { getItem: () => JSON.stringify({ eyesInset: "always" }), setItem() {} };
  assert.equal(loadSettings(store).eyesInset, "always");
});

test("at every shape each corner is inside the safe area and clear of the caption, the menu's button, the shelf and the label", () => {
  for (const [name, frame] of frames()) {
    const hud = hudLayout(frame);
    const layout = insetLayout(frame, hud);
    const a = safeRect(frame);
    const shelf = { x: hud.shelfLeft, y: hud.shelfY - 26, width: hud.gap * TOOLS.length + hud.apart, height: 52 };
    const label = { x: hud.cx - 110, y: hud.labelY - 17, width: 220, height: 32 };
    const caption = { x: hud.cx - 70, y: hud.captionY - 15, width: 140, height: 30 };
    const menu = { x: hud.menuX, y: hud.menuY - 18, width: 36, height: 36 };
    for (const corner of CORNERS) {
      const r = layout.rects[corner];
      assert.ok(r.x >= a.x && r.y >= a.y && r.x + r.width <= a.x + a.w + 1e-6 && r.y + r.height <= a.y + a.h + 1e-6, `${name}: ${corner} inside the safe area`);
      for (const [zone, z] of Object.entries({ shelf, label, caption })) assert.ok(!overlaps(r, z), `${name}: ${corner} and the ${zone}`);
    }
    assert.ok(!overlaps(layout.rects["top-right"], menu), `${name}: the corner it keeps to while playing and the menu's button`);
    assert.ok(layout.rects["top-right"].width <= a.w * 0.45, `${name}: no more than a little under half the width`);
    const offsets = layoutFacets(brainEyes(), layout);
    for (let i = 4; i < offsets.length; i += 4) {
      assert.ok(Number.isInteger(offsets[i]) && Number.isInteger(offsets[i + 1]), `${name}: on whole pixels`);
      assert.ok(offsets[i] >= 0 && offsets[i] + offsets[i + 3] <= layout.panel.width + 1 && offsets[i + 1] >= 0 && offsets[i + 1] + 3 <= layout.panel.height + 1, `${name}: facet ${i / 4} inside the panel`);
    }
  }
});

test("on the TV the corners are where they always were", () => {
  const layout = insetLayout(TV_FRAME);
  assert.deepEqual(layout.rects["top-right"], { x: 662, y: 16, width: 176, height: 92 });
  assert.deepEqual(layout.rects["bottom-left"], { x: 16, y: 372, width: 176, height: 92 });
  assert.deepEqual(layout.panel, { width: 132, height: 92 });
  assert.deepEqual(layout.origins["top-right"], { x: 496, y: 16 });
});
