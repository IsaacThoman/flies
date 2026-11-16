// What the game keeps between launches: the settings and the shelf's choices
// come back as they were left, a save from another build or a broken one never
// stops the game, and the settings' pages reach every setting a step from the
// top without scrolling.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { RemoteButton } from "@fly/contracts";
import { World } from "@fly/world";
import type { Place } from "@fly/world";
import { TV_DESIGN_HEIGHT as DESIGN_HEIGHT, TV_FRAME } from "../src/display.ts";
import { DEFAULT_SETTINGS, KEPT, loadLearned, loadSettings, loadShelf, saveLearned, saveSettings, saveShelf } from "../src/settings.ts";
import type { Settings } from "../src/settings.ts";
import { Hands, TOOLS } from "../src/tools/hands.ts";
import type { MenuScreen } from "../src/ui/screens/menu-screen.ts";
import { settingsPages, settingsScreen } from "../src/ui/screens/menus.ts";
import type { ScreenId, Shell } from "../src/ui/screens/types.ts";

/** localStorage, in memory. */
function memory(saved: Record<string, string> = {}) {
  return {
    saved,
    getItem: (key: string) => saved[key] ?? null,
    setItem: (key: string, value: string) => {
      saved[key] = value;
    },
  };
}
const settingsSaved = (value: unknown) => memory({ "apple-tv-fly.settings": typeof value === "string" ? value : JSON.stringify(value) });
const shelfSaved = (value: unknown) => memory({ "apple-tv-fly.shelf": typeof value === "string" ? value : JSON.stringify(value) });

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 10, 16, 20);

test("settings come back as they were saved", () => {
  const store = memory();
  const settings: Settings = { effects: 3, ambience: 0, pixels: "chunkier", wallpaperAfter: 300, wallpaperCamera: "lively", eyes: "high", eyesInset: "always", hints: false, stats: true, realWeather: false, place: "lab", scene: "bar" };
  saveSettings(settings, store);
  assert.deepEqual(loadSettings(store), settings);
});

test("a save from an older build keeps what it has and takes today's defaults for the rest", () => {
  // From before there were places, the corner picture or the wallpaper's camera, with a setting since dropped.
  const loaded = loadSettings(settingsSaved({ effects: 2, ambience: 9, pixels: "chunky", wallpaperAfter: 120, eyes: "off", hints: false, stats: false, fov: 60 }));
  assert.deepEqual(loaded, { ...DEFAULT_SETTINGS, effects: 2, ambience: 9, pixels: "chunky", wallpaperAfter: 120, eyes: "off", hints: false });
  assert.ok(!("fov" in loaded));
  // A place that has gone, where it was or where it lived.
  assert.deepEqual(loadSettings(settingsSaved({ place: "garden", scene: "garden" })), DEFAULT_SETTINGS);
});

test("a broken save, or none, is the defaults; nothing throws", () => {
  for (const raw of ["", "{", "null", "42", '"settings"', "[1,2]", "true"]) assert.deepEqual(loadSettings(settingsSaved(raw)), DEFAULT_SETTINGS, raw);
  assert.deepEqual(loadSettings(memory()), DEFAULT_SETTINGS);
  assert.deepEqual(loadSettings(null), DEFAULT_SETTINGS);
  const blocked = {
    getItem(): string {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("full");
    },
  };
  assert.deepEqual(loadSettings(blocked), DEFAULT_SETTINGS);
  assert.doesNotThrow(() => saveSettings(DEFAULT_SETTINGS, blocked));
  assert.doesNotThrow(() => saveShelf({ view: { kind: "wide", at: NOW } }, blocked));
  assert.deepEqual(loadShelf(NOW, blocked), {});
});

test("each setting keeps only a value the game can use", () => {
  const bad: Record<keyof Settings, unknown[]> = {
    effects: [-1, 11, "7", null],
    ambience: [100, true],
    pixels: ["huge", "toString", "__proto__", 2],
    wallpaperAfter: [-30, "60"],
    wallpaperCamera: ["drone", 0],
    eyes: ["medium", false],
    eyesInset: ["sometimes", "corner"],
    hints: ["yes", 1],
    stats: [0, "on"],
    realWeather: ["off", 0],
    place: ["moon", 3, null],
    scene: ["turns", "moon", {}],
  };
  for (const [key, values] of Object.entries(bad)) {
    for (const value of values) assert.deepEqual(loadSettings(settingsSaved({ [key]: value })), DEFAULT_SETTINGS, `${key}: ${JSON.stringify(value)}`);
  }
});

test("a saved wallpaper delay outside the menu's choices falls back to the default and shows that value", () => {
  for (const wallpaperAfter of [2, 45, 90, 600]) {
    const settings = loadSettings(settingsSaved({ wallpaperAfter }));
    assert.equal(settings.wallpaperAfter, DEFAULT_SETTINGS.wallpaperAfter);
    const { wallpaper } = settingsPages(fakeShell(settings));
    wallpaper.enter();
    const after = wallpaper.menu.item("wallpaperAfter");
    assert.ok(after?.kind === "choice");
    assert.equal(after.options[after.index].value, settings.wallpaperAfter);
    assert.equal(after.options[after.index].label, "1 min");
  }
});

test("the shelf keeps the view, the light and the weather, and nothing else", () => {
  assert.deepEqual(Object.keys(KEPT).sort(), ["light", "view", "weather"]);
  const store = memory();
  saveShelf({ view: { kind: "wide", at: NOW - HOUR }, light: { kind: "dusk", at: NOW - HOUR }, weather: { kind: "rain", at: NOW - HOUR } }, store);
  assert.deepEqual(loadShelf(NOW, store), { view: { kind: "wide", at: NOW - HOUR }, light: { kind: "dusk", at: NOW - HOUR }, weather: { kind: "rain", at: NOW - HOUR } });
  // The tools that act on the fly start fresh, whatever was saved for them.
  assert.deepEqual(loadShelf(NOW, shelfSaved({ feed: { kind: "water", at: NOW }, blow: { kind: "strong", at: NOW }, tool: 3 })), {});
});

test("a time of day or a weather is kept a few hours, then a launch follows the clock again; a view is kept", () => {
  const saved = (at: number) => shelfSaved({ view: { kind: "above", at }, light: { kind: "night", at }, weather: { kind: "mist", at } });
  assert.deepEqual(Object.keys(loadShelf(NOW, saved(NOW - 5 * HOUR))).sort(), ["light", "view", "weather"]);
  assert.deepEqual(Object.keys(loadShelf(NOW, saved(NOW - 7 * HOUR))), ["view"]);
  assert.deepEqual(Object.keys(loadShelf(NOW, saved(NOW - 400 * 24 * HOUR))), ["view"]);
});

test("a launch never opens through the fly's eyes", () => {
  assert.deepEqual(loadShelf(NOW, shelfSaved({ view: { kind: "eyes", at: NOW } })), {});
});

test("a kind or a tool the shelf no longer has is passed over, as is anything malformed", () => {
  const loaded = loadShelf(
    NOW,
    shelfSaved({
      view: { kind: "telescope", at: NOW },
      light: { kind: "dusk" },
      weather: ["rain", NOW],
      lamp: { kind: "on", at: NOW },
    }),
  );
  assert.deepEqual(loaded, {});
  for (const raw of ["", "}", "null", "[]", "7"]) assert.deepEqual(loadShelf(NOW, shelfSaved(raw)), {}, raw);
  assert.deepEqual(loadShelf(NOW, shelfSaved({ light: null, weather: { kind: 4, at: NOW }, view: { kind: "wide", at: "yesterday" } })), {});
});

test("what the hints have taught comes back, of the lessons this build has", () => {
  const store = memory();
  saveLearned({ tools: true, feed: true, feather: true }, store);
  assert.deepEqual(loadLearned(store), { tools: true, feed: true, feather: true });
  // A tool since dropped, or a value that isn't a plain yes, is passed over.
  const old = memory({ "apple-tv-fly.learned": JSON.stringify({ tools: true, lamp: true, swoop: 1, blow: "yes", place: true }) });
  assert.deepEqual(loadLearned(old), { tools: true, place: true });
  for (const raw of ["", "{", "null", '["tools"]', "true"]) assert.deepEqual(loadLearned(memory({ "apple-tv-fly.learned": raw })), {}, raw);
  assert.deepEqual(loadLearned(null), {});
});

const bare: Place = { floor: { kind: "rect", hx: 500, hz: 500 }, solids: [], patches: [], start: { x: 0, z: 0, yaw: 0 }, ceiling: 300 };
const kindOf = (hands: Hands, tool: string) => {
  const i = TOOLS.findIndex((t) => t.id === tool);
  return TOOLS[i].variants[hands.variants[i]].id;
};

test("the hands start on Feed with what was kept, by id, and on each tool's first kind otherwise", () => {
  const fresh = new Hands(new World(bare));
  const hands = new Hands(new World(bare), { view: { kind: "table" }, light: { kind: "golden" }, weather: { kind: "overcast" } });
  assert.equal(hands.current.id, "feed");
  assert.equal(hands.variant.id, "sugar");
  assert.equal(hands.view, "table");
  assert.equal(hands.timeOfDay, "golden");
  assert.equal(hands.weather, "overcast");
  for (const tool of ["feed", "blow", "place"]) assert.equal(kindOf(hands, tool), kindOf(fresh, tool));
  // A kind it doesn't have leaves the tool as it starts.
  const odd = new Hands(new World(bare), { view: { kind: "telescope" }, light: { kind: "Dusk" } });
  assert.equal(odd.view, "follow");
  assert.equal(odd.timeOfDay, "clock");
});

test("the weather kept is Now by its id, whether Now was the real weather outside or the forecast", () => {
  // Kept while it said "Outside": a launch comes back to Now, real again if the Apple TV can tell it.
  const hands = new Hands(new World(bare), { weather: { kind: "now" }, light: { kind: "clock" } });
  assert.equal(hands.weather, "now");
  assert.equal(hands.timeOfDay, "clock");
  hands.tool = TOOLS.findIndex((t) => t.id === "weather");
  assert.equal(hands.label, "Now");
  hands.outside = true;
  assert.equal(hands.label, "Outside");
  assert.equal(hands.variant.id, "now", "what is kept is the kind, not what it is called");
});

/** A game for the screens to ask things of: it keeps the settings and remembers what it was asked. */
function fakeShell(settings: Settings = { ...DEFAULT_SETTINGS }, weatherOutside = false) {
  const asked: string[] = [];
  const shell = {
    settings,
    asked,
    weatherOutside,
    shape: TV_FRAME,
    glyphs: "remote" as const,
    open: (screen: ScreenId) => asked.push(`open ${screen}`),
    back: () => asked.push("back"),
    applySettings: () => asked.push("apply"),
    sound() {},
  };
  return shell as typeof shell & Shell;
}
const press = (screen: MenuScreen, ...buttons: RemoteButton[]) => buttons.forEach((b) => screen.press(b, false));

test("the top of the settings opens each page, and Back from it goes back", () => {
  const shell = fakeShell();
  const top = settingsScreen(shell);
  const pages = settingsPages(shell);
  assert.deepEqual(
    top.menu.items.map((item) => item.id),
    Object.keys(pages),
  );
  assert.equal(top.menu.focused?.id, "wallpaper");
  press(top, "select", "down", "select", "down", "select", "back");
  assert.deepEqual(shell.asked, ["open wallpaper", "open sound", "open picture", "back"]);
  shell.asked.length = 0;
  press(pages.sound, "back");
  assert.deepEqual(shell.asked, ["back"]);
});

test("every setting the player chooses is on exactly one page, each a step from the top and short enough not to scroll", () => {
  // Real weather only where the Apple TV can tell the weather outside.
  for (const weatherOutside of [false, true]) {
    const pages = settingsPages(fakeShell(undefined, weatherOutside));
    const ids = Object.values(pages).flatMap((page) => page.menu.items.map((item) => item.id));
    assert.deepEqual(
      [...ids].sort(),
      Object.keys(DEFAULT_SETTINGS)
        .filter((key) => key !== "scene" && (weatherOutside || key !== "realWeather"))
        .sort(),
    );
    assert.equal(pages.wallpaper.menu.items.some((item) => item.id === "realWeather"), weatherOutside);
    for (const [id, page] of Object.entries(pages)) {
      assert.equal(page.menu.rows, page.menu.items.length, `${id} shows all its rows`);
      assert.ok(page.menu.items.every((item) => item.kind !== "action"), `${id} is all settings`);
      const { y } = page.view.layout;
      assert.ok(y > 0 && y + page.view.height < DESIGN_HEIGHT - 50, `${id} clear of the menu hints`);
    }
  }
});

test("a page shows the settings as they are when it opens, and a change is kept and applied", () => {
  const shell = fakeShell();
  const { wallpaper, sound } = settingsPages(shell);
  // Changed elsewhere since the page was made: by the Place tool, say.
  shell.settings.place = "bar";
  shell.settings.effects = 2;
  wallpaper.enter();
  sound.enter();
  const place = wallpaper.menu.item("place");
  assert.ok(place?.kind === "choice" && place.options[place.index].value === "bar");
  const effects = sound.menu.item("effects");
  assert.ok(effects?.kind === "slider" && effects.value === 2);
  // Camera: Follow, then Calm.
  press(wallpaper, "down", "right");
  assert.equal(shell.settings.wallpaperCamera, "calm");
  press(sound, "left");
  assert.equal(shell.settings.effects, 1);
  assert.deepEqual(shell.asked, ["apply", "apply"]);
});

test("every value a page offers is one a save keeps", () => {
  const pages = settingsPages(fakeShell());
  for (const page of Object.values(pages)) {
    for (const item of page.menu.items) {
      const values = item.kind === "choice" ? item.options.map((o) => o.value) : item.kind === "slider" ? [item.min, item.max] : [];
      for (const value of values) {
        const store = memory();
        saveSettings({ ...DEFAULT_SETTINGS, [item.id]: value }, store);
        assert.equal(loadSettings(store)[item.id as keyof Settings], value, `${item.id}: ${JSON.stringify(value)}`);
      }
    }
  }
});
