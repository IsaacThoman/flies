// Settings → Screensaver → Where it lives, as the game wires it: carrying the
// fly to a place builds the whole place, so stepping through the places
// carries it nowhere until the player settles on one, by a pause on it or by
// leaving the row or the screen; then it is carried once, to that one.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { RemoteButton } from "@fly/contracts";
import { TV_FRAME } from "../src/display.ts";
import { DEFAULT_SETTINGS } from "../src/settings.ts";
import type { Settings } from "../src/settings.ts";
import type { MenuScreen } from "../src/ui/screens/menu-screen.ts";
import { settingsScreen } from "../src/ui/screens/menus.ts";
import type { Shell } from "../src/ui/screens/types.ts";
import { SETTLE, Settle } from "../src/ui/settle.ts";

/** The settings screen over a game that lives at the picnic and records where it is carried. */
function game() {
  const settings: Settings = { ...DEFAULT_SETTINGS };
  const carried: string[] = [];
  let here = "picnic";
  let open = true;
  let screen: MenuScreen | null = null;
  const choice = new Settle(
    () => open && screen?.menu.focused?.id === "place",
    () => {
      if (settings.place !== "turns" && settings.place !== here) carried.push((here = settings.place));
    },
  );
  const shell = { settings, weatherOutside: false, shape: TV_FRAME, glyphs: "remote" as const, open: () => {}, back: () => (open = false), applySettings: () => choice.changed() };
  screen = settingsScreen(shell as typeof shell & Shell);
  screen.enter();
  const press = (...buttons: RemoteButton[]) => buttons.forEach((b) => screen.press(b, false));
  /** Frames of the game, a sixtieth of a second each. */
  const wait = (seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 60) choice.update(1 / 60);
  };
  // Down the Screensaver tab to Where it lives.
  press("down", "down", "down");
  assert.equal(screen.menu.focused?.id, "place");
  return { settings, carried, press, wait };
}

test("stepping through the places carries the fly nowhere until it rests on one, then once, there", () => {
  const { settings, carried, press, wait } = game();
  // Each in turn, the picnic, the windowsill, the lab bench, the bar: a step a third of a second.
  for (let i = 0; i < 4; i++) {
    press("right");
    wait(0.3);
  }
  assert.equal(settings.place, "bar", "the row and the setting show each step");
  assert.deepEqual(carried, [], "nowhere on the way");
  wait(SETTLE);
  assert.deepEqual(carried, ["bar"], "once, to where it rested");
  wait(5);
  assert.deepEqual(carried, ["bar"]);
});

test("leaving the row, or the screen, settles it at once", () => {
  const { carried, press, wait } = game();
  press("right", "right", "right", "up");
  wait(1 / 60);
  assert.deepEqual(carried, ["lab"], "up off the row");
  press("down", "right", "back");
  wait(1 / 60);
  assert.deepEqual(carried, ["lab", "bar"], "back out of Settings");
});

test("resting on Each in turn, or on where it is, carries it nowhere", () => {
  const { carried, press, wait } = game();
  press("right", "right", "left", "left");
  wait(SETTLE + 0.1);
  press("right");
  wait(SETTLE + 0.1);
  assert.deepEqual(carried, []);
});

test("a settled callback runs exactly once, and an idle choice never runs it", () => {
  let calls = 0;
  const settle = new Settle(() => true, () => calls++);
  settle.update(5);
  assert.equal(calls, 0);
  settle.changed();
  settle.update(0.75);
  assert.equal(calls, 0);
  settle.changed();
  settle.update(0.75);
  assert.equal(calls, 0, "changing the choice starts a fresh pause");
  settle.update(0.25);
  assert.equal(calls, 1, "one whole second settles it");
  settle.update(5);
  assert.equal(calls, 1, "the expensive action must not repeat");
});

test("a change outside its row acts immediately and cancels any pending action", () => {
  let choosing = true;
  let calls = 0;
  const settle = new Settle(() => choosing, () => calls++);
  settle.changed();
  settle.update(0.5);
  choosing = false;
  settle.changed();
  assert.equal(calls, 1);
  settle.update(5);
  assert.equal(calls, 1);
});
