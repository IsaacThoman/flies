import assert from "node:assert/strict";
import { test } from "node:test";
import { Menu, choiceValue } from "../src/menu.ts";
import { Eased, Navigator, Ring, Scroller } from "../src/nav.ts";
import type { ChoiceItem, MenuItem, SliderItem } from "../src/menu.ts";

const items = (): MenuItem[] => [
  { kind: "action", id: "play", label: "Play" },
  { kind: "action", id: "soon", label: "Soon", disabled: true },
  { kind: "choice", id: "pixels", label: "Pixels", options: [{ value: "classic", label: "Classic" }, { value: "chunky", label: "Chunky" }], index: 0 },
  { kind: "slider", id: "volume", label: "Volume", min: 0, max: 10, step: 1, value: 9 },
  { kind: "action", id: "back", label: "Back" },
];

test("focus starts on the first enabled item, or the one asked for", () => {
  assert.equal(new Menu(items()).focused?.id, "play");
  assert.equal(new Menu(items(), { focus: "volume" }).focused?.id, "volume");
  assert.equal(new Menu(items(), { focus: "soon" }).focused?.id, "play");
});

test("in two columns, left and right go across between actions, and up and down along the list as ever", () => {
  const six = ["play", "watch", "online", "brain", "about", "settings"].map((id): MenuItem => ({ kind: "action", id, label: id }));
  const menu = new Menu(six);
  menu.columns = 2;
  assert.deepEqual(menu.press("right"), { kind: "moved" });
  assert.equal(menu.focused?.id, "brain", "across from Play");
  assert.deepEqual(menu.press("right"), { kind: "blocked" }, "no third column");
  menu.press("down");
  menu.press("down");
  assert.equal(menu.focused?.id, "settings");
  assert.deepEqual(menu.press("down"), { kind: "blocked" });
  menu.press("left");
  assert.equal(menu.focused?.id, "online");
  assert.deepEqual(menu.press("left"), { kind: "blocked" });
  menu.press("down");
  assert.equal(menu.focused?.id, "brain", "down from the foot of a column is the top of the next");
  // Five in two columns: three, then two; nothing across from the third.
  const five = new Menu(six.slice(0, 5));
  five.columns = 2;
  five.focusOn("online");
  assert.deepEqual(five.press("right"), { kind: "blocked" });
  // One column: left and right do nothing to an action.
  assert.deepEqual(new Menu(six).press("right"), { kind: "none" });
});

test("up and down skip disabled items and stop at the ends", () => {
  const menu = new Menu(items());
  assert.equal(menu.press("up").kind, "blocked");
  assert.equal(menu.press("down").kind, "moved");
  assert.equal(menu.focused?.id, "pixels");
  menu.press("down");
  menu.press("down");
  assert.equal(menu.focused?.id, "back");
  assert.equal(menu.press("down").kind, "blocked");
  assert.equal(menu.press("down", true).kind, "none", "a held key doesn't keep bumping");
});

test("select activates actions; back is back", () => {
  const menu = new Menu(items());
  const outcome = menu.press("select");
  assert.equal(outcome.kind, "activate");
  assert.equal(outcome.kind === "activate" && outcome.item.id, "play");
  assert.equal(menu.press("select", true).kind, "none");
  assert.equal(menu.press("back").kind, "back");
});

test("left and right change a choice within its options; select steps round it", () => {
  const menu = new Menu(items(), { focus: "pixels" });
  const pixels = menu.focused as ChoiceItem<string>;
  assert.equal(menu.press("left").kind, "blocked");
  assert.equal(menu.press("right").kind, "change");
  assert.equal(choiceValue(pixels), "chunky");
  assert.equal(menu.press("right").kind, "blocked");
  menu.press("select");
  assert.equal(choiceValue(pixels), "classic");
});

test("sliders step and stop at their ends; select wraps them for remotes without arrows", () => {
  const menu = new Menu(items(), { focus: "volume" });
  const volume = menu.focused as SliderItem;
  menu.press("right");
  assert.equal(volume.value, 10);
  assert.equal(menu.press("right").kind, "blocked");
  menu.press("select");
  assert.equal(volume.value, 0);
  assert.equal(menu.press("left").kind, "blocked");
});

test("left and right do nothing on an action", () => {
  assert.equal(new Menu(items()).press("right").kind, "none");
});

test("the list scrolls to keep the focus in view", () => {
  const long: MenuItem[] = Array.from({ length: 10 }, (_, i) => ({ kind: "action", id: `i${i}`, label: `Item ${i}` }));
  const menu = new Menu(long, { rows: 4 });
  for (let i = 0; i < 6; i++) menu.press("down");
  assert.equal(menu.focus, 6);
  assert.equal(menu.scroll, 3);
  for (let i = 0; i < 6; i++) menu.press("up");
  assert.equal(menu.scroll, 0);
  menu.focusOn("i9");
  assert.equal(menu.scroll, 6);
});

test("a ring goes round both ways", () => {
  const ring = new Ring(4);
  assert.equal(ring.step(-1), 3);
  assert.equal(ring.step(1), 0);
  assert.equal(new Ring(3, 7).index, 1);
});

test("a scroller stops at its ends", () => {
  const s = new Scroller(20);
  s.setExtent(100, 60);
  assert.equal(s.step(-1), false);
  assert.equal(s.step(1), true);
  assert.equal(s.step(1), true);
  assert.equal(s.offset, 40);
  assert.equal(s.step(1), false);
  s.setExtent(70, 60);
  assert.equal(s.offset, 10);
});

test("the navigator walks back to its root and no further", () => {
  const nav = new Navigator<"title" | "play" | "about" | "settings">("title");
  assert.equal(nav.atRoot, true);
  nav.push("play");
  nav.push("about");
  nav.push("about");
  nav.push("settings");
  assert.deepEqual(nav.stack, ["title", "play", "about", "settings"]);
  assert.equal(nav.pop(), true);
  assert.equal(nav.current, "about");
  nav.reset();
  assert.equal(nav.current, "title");
  assert.equal(nav.pop(), false);
});

test("an eased value settles on its target", () => {
  const e = new Eased(0, 10);
  e.target = 1;
  let moving = true;
  for (let i = 0; i < 200 && moving; i++) moving = e.update(1 / 60);
  assert.equal(e.value, 1);
});
