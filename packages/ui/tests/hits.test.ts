import assert from "node:assert/strict";
import { test } from "node:test";
import { HitMap } from "../src/hits.ts";
import { Menu } from "../src/menu.ts";
import type { MenuItem, SliderItem } from "../src/menu.ts";

test("a point lands on the topmost target drawn over it, or on nothing", () => {
  const hits = new HitMap();
  hits.begin("settings");
  hits.add("row", 0, 0, 100, 40, 3);
  hits.add("step", 80, 0, 20, 40, 3, 1);
  assert.equal(hits.owner, "settings");
  assert.equal(hits.at(10, 20)?.kind, "row");
  assert.deepEqual([hits.at(90, 20)?.kind, hits.at(90, 20)?.value], ["step", 1], "drawn later, on top");
  assert.equal(hits.at(150, 20), null);
});

test("a fingertip a little off a target still lands on it, on the nearest", () => {
  const hits = new HitMap();
  hits.begin("play");
  hits.add("tool", 0, 0, 40, 40, 0);
  hits.add("tool", 50, 0, 40, 40, 1);
  assert.equal(hits.at(46, 20), null, "a mouse is exact");
  assert.equal(hits.at(46, 20, 8)?.index, 1);
  assert.equal(hits.at(44, 20, 8)?.index, 0);
  assert.equal(hits.at(20, 60, 8), null, "too far from anything");
});

test("each drawing starts afresh, reusing its targets, and nothing is recorded where nothing points", () => {
  const hits = new HitMap();
  hits.begin("a");
  hits.add("row", 0, 0, 10, 10);
  const first = hits.get(0);
  hits.begin("b");
  assert.equal(hits.count, 0);
  assert.equal(hits.at(5, 5), null);
  hits.add("row", 0, 0, 10, 10, 4);
  assert.equal(hits.get(0), first, "no new objects for a redraw");
  hits.enabled = false;
  hits.begin("c");
  hits.add("row", 0, 0, 10, 10);
  assert.equal(hits.count, 0);
});

const items = (): MenuItem[] => [
  { kind: "action", id: "play", label: "Play" },
  { kind: "action", id: "soon", label: "Soon", disabled: true },
  { kind: "choice", id: "pixels", label: "Pixels", options: [{ value: "classic", label: "Classic" }, { value: "chunky", label: "Chunky" }, { value: "chunkier", label: "Chunkier" }], index: 0 },
  { kind: "slider", id: "volume", label: "Volume", min: 0, max: 10, step: 1, value: 9 },
  { kind: "action", id: "back", label: "Back" },
];

test("a pointer focuses an item by hovering, and a tap does what Select does there", () => {
  const menu = new Menu(items());
  assert.equal(menu.focusIndex(2), true);
  assert.equal(menu.focusIndex(2), false, "already there");
  assert.equal(menu.focusIndex(1), false, "a disabled item takes no focus");
  assert.equal(menu.focused?.id, "pixels");
  const tapped = menu.tap(0);
  assert.equal(tapped.kind, "activate");
  assert.equal(menu.focused?.id, "play");
  assert.equal(menu.tap(1).kind, "blocked");
  const choice = menu.tap(2);
  assert.equal(choice.kind, "change");
  assert.equal(menu.items[2].kind === "choice" && menu.items[2].index, 1, "a tapped choice steps on, round to the start");
});

test("a choice's arrows step it either way and stop at its ends; a slider follows a finger along its track", () => {
  const menu = new Menu(items());
  assert.equal(menu.stepAt(2, -1).kind, "blocked");
  assert.equal(menu.stepAt(2, 1).kind, "change");
  assert.equal(menu.stepAt(2, 1).kind, "change");
  assert.equal(menu.stepAt(2, 1).kind, "blocked");
  const volume = menu.items[3] as SliderItem;
  assert.equal(menu.slideAt(3, 0.31).kind, "change");
  assert.equal(volume.value, 3, "to the nearest step");
  assert.equal(menu.slideAt(3, 0.29).kind, "none", "the same step: nothing changes");
  menu.slideAt(3, -2);
  assert.equal(volume.value, 0);
  menu.slideAt(3, 5);
  assert.equal(volume.value, 10);
  assert.equal(menu.focused?.id, "volume");
  assert.equal(menu.slideAt(0, 0.5).kind, "none", "only sliders slide");
});

test("dragging the list scrolls it a row at a time, bringing the focus along", () => {
  const menu = new Menu(items(), { rows: 2 });
  assert.equal(menu.scroll, 0);
  assert.equal(menu.scrollBy(-1), false, "already at the top");
  assert.equal(menu.scrollBy(2), true);
  assert.equal(menu.scroll, 2);
  assert.equal(menu.focused?.id, "pixels", "the focus comes into view");
  assert.equal(menu.scrollBy(10), true);
  assert.equal(menu.scroll, 3, "no further than the last row");
  assert.equal(menu.focused?.id, "volume");
  menu.setRows(5);
  assert.equal(menu.scroll, 0, "with room for every row, nothing scrolls");
});
