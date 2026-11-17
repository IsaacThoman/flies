// What the game keeps between launches: the settings and the shelf's choices
// come back as they were left, a save from another build or a broken one never
// stops the game, and the settings' tabs reach every setting without
// scrolling.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { RemoteButton } from "@fly/contracts";
import { World } from "@fly/world";
import type { Place } from "@fly/world";
import { TV_DESIGN_HEIGHT as DESIGN_HEIGHT, TV_FRAME } from "../src/display.ts";
import { DEFAULT_SETTINGS, KEPT, loadDay, loadLearned, loadSettings, loadShelf, saveDay, saveLearned, saveSettings, saveShelf } from "../src/settings.ts";
import type { Settings } from "../src/settings.ts";
import { Hands, TOOLS } from "../src/tools/hands.ts";
import type { MenuScreen } from "../src/ui/screens/menu-screen.ts";
import { settingsScreen, settingsTab } from "../src/ui/screens/menus.ts";
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
const settingsSaved = (value: unknown) => memory({ "flies.settings": typeof value === "string" ? value : JSON.stringify(value) });
const shelfSaved = (value: unknown) => memory({ "flies.shelf": typeof value === "string" ? value : JSON.stringify(value) });

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 10, 16, 20);

test("settings come back as they were saved", () => {
  const store = memory();
  const settings: Settings = { flies: 3, pixels: "chunkier", wallpaperAfter: 300, wallpaperCamera: "whole", pace: "natural", eyes: "high", eyesInset: "always", nerves: "off", xray: "always", statsPanel: "wallpaper", statsKind: "day", overlaySize: "large", overlayOpacity: "faint", hints: false, rumble: false, stats: true, realWeather: false, place: "lab", scene: "greenhouse", joinOthers: false };
  saveSettings(settings, store);
  assert.deepEqual(loadSettings(store), settings);
});

test("joining others starts on for new and older saves and keeps an explicit opt-out", () => {
  assert.equal(DEFAULT_SETTINGS.joinOthers, true);
  assert.equal(loadSettings(null).joinOthers, true);
  assert.equal(loadSettings(memory()).joinOthers, true);
  assert.equal(loadSettings(settingsSaved({ hints: false })).joinOthers, true);
  const store = memory();
  saveSettings({ ...DEFAULT_SETTINGS, joinOthers: false }, store);
  assert.equal(loadSettings(store).joinOthers, false);
  saveSettings({ ...DEFAULT_SETTINGS, joinOthers: true }, store);
  assert.equal(loadSettings(store).joinOthers, true);
});

test("rumble starts on, including saves without the setting or with an invalid value", () => {
  assert.equal(DEFAULT_SETTINGS.rumble, true);
  assert.equal(loadSettings(null).rumble, true);
  assert.equal(loadSettings(settingsSaved({ hints: false, effects: 0 })).rumble, true);
  for (const rumble of [null, 0, 1, "off"]) assert.equal(loadSettings(settingsSaved({ rumble })).rumble, true);
});

test("Fly POV shows while playing by default, with nerves in the wallpaper and stats and X-ray off", () => {
  assert.equal(DEFAULT_SETTINGS.statsPanel, "off", "no stats unless asked for");
  assert.equal(DEFAULT_SETTINGS.xray, "off");
  assert.equal(DEFAULT_SETTINGS.eyesInset, "always");
  assert.equal(DEFAULT_SETTINGS.nerves, "wallpaper");
  assert.equal(DEFAULT_SETTINGS.overlaySize, "medium");
  assert.equal(DEFAULT_SETTINGS.overlayOpacity, "full");
  // A save from before them keeps its corners' settings under the same keys, and takes the new ones' defaults.
  const old = loadSettings(settingsSaved({ eyesInset: "always", nerves: "off", xray: "wallpaper", stats: true }));
  assert.deepEqual(old, { ...DEFAULT_SETTINGS, eyesInset: "always", nerves: "off", xray: "wallpaper", stats: true });
});

test("the fly's day comes back on the same day, and starts again from nothing on another; a broken count is nothing", () => {
  const store = memory();
  const day = { date: "2026-11-16", walked: 412.5, meals: 3, takeOffs: 7, flown: 12.25, groomed: 80 };
  saveDay(day, store);
  assert.deepEqual(loadDay("2026-11-16", store), day);
  assert.deepEqual(loadDay("2026-11-17", store), { date: "2026-11-17", walked: 0, meals: 0, takeOffs: 0, flown: 0, groomed: 0 });
  const broken = memory({ "flies.day": JSON.stringify({ date: "2026-11-16", walked: -4, meals: "3", takeOffs: null, flown: 5, groomed: Infinity }) });
  assert.deepEqual(loadDay("2026-11-16", broken), { date: "2026-11-16", walked: 0, meals: 0, takeOffs: 0, flown: 5, groomed: 0 });
  for (const raw of ["", "{", "[]", "null"]) assert.deepEqual(loadDay("2026-11-16", memory({ "flies.day": raw })).meals, 0, raw);
  assert.equal(loadDay("2026-11-16", null).walked, 0);
});

test("a save from an older build keeps what it has and takes today's defaults for the rest", () => {
  // From before there were places, the corner picture or the wallpaper's camera, with settings since dropped.
  const loaded = loadSettings(settingsSaved({ effects: 2, ambience: 9, pixels: "chunky", wallpaperAfter: 120, eyes: "off", hints: false, stats: false, fov: 60 }));
  assert.deepEqual(loaded, { ...DEFAULT_SETTINGS, pixels: "chunky", wallpaperAfter: 120, eyes: "off", hints: false });
  for (const key of ["effects", "ambience", "fov"]) assert.ok(!(key in loaded), `${key} is ignored`);
  // A place that has gone, where it was or where it lived: each falls back alone, and the rest is kept.
  for (const gone of ["garden", "bar"]) assert.deepEqual(loadSettings(settingsSaved({ place: gone, scene: gone, hints: false })), { ...DEFAULT_SETTINGS, hints: false }, gone);
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
    flies: [0, 5, 1.5, "2", null],
    rumble: [0, 1, "off", null],
    pixels: ["huge", "toString", "__proto__", 2],
    wallpaperAfter: [-30, "60"],
    wallpaperCamera: ["drone", 0],
    pace: ["sleepy", "toString", 1],
    eyes: ["medium", false],
    eyesInset: ["sometimes", "corner"],
    nerves: ["glowing", 1],
    xray: ["on", true],
    statsPanel: ["on", true, 1],
    statsKind: ["all", "everything", 0],
    overlaySize: ["huge", 1.3, "toString"],
    overlayOpacity: ["clear", 0.5, "__proto__"],
    hints: ["yes", 1],
    stats: [0, "on"],
    realWeather: ["off", 0],
    place: ["moon", 3, null],
    scene: ["turns", "moon", {}],
    joinOthers: ["off", 0, null],
  };
  for (const [key, values] of Object.entries(bad)) {
    for (const value of values) assert.deepEqual(loadSettings(settingsSaved({ [key]: value })), DEFAULT_SETTINGS, `${key}: ${JSON.stringify(value)}`);
  }
});

test("a saved wallpaper delay outside the menu's choices falls back to the default and shows that value", () => {
  for (const wallpaperAfter of [2, 45, 90, 600]) {
    const settings = loadSettings(settingsSaved({ wallpaperAfter }));
    assert.equal(settings.wallpaperAfter, DEFAULT_SETTINGS.wallpaperAfter);
    const screen = settingsScreen(fakeShell(settings));
    screen.enter();
    const after = screen.menu.item("wallpaperAfter");
    assert.ok(after?.kind === "choice");
    assert.equal(after.options[after.index].value, settings.wallpaperAfter);
    assert.equal(after.options[after.index].label, "30 s");
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
  saveLearned({ arrival: true, tools: true, hand: true, feed: true, feather: true }, store);
  assert.deepEqual(loadLearned(store), { arrival: true, tools: true, hand: true, feed: true, feather: true });
  // A tool since dropped, or a value that isn't a plain yes, is passed over.
  const old = memory({ "flies.learned": JSON.stringify({ tools: true, lamp: true, swoop: 1, blow: "yes", place: true }) });
  assert.deepEqual(loadLearned(old), { tools: true, place: true });
  for (const raw of ["", "{", "null", '["tools"]', "true"]) assert.deepEqual(loadLearned(memory({ "flies.learned": raw })), {}, raw);
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
function fakeShell(settings: Settings = { ...DEFAULT_SETTINGS }, weatherOutside = false, canPlayOnline = false) {
  const asked: string[] = [];
  const shell = {
    settings,
    maxFlies: 4,
    asked,
    weatherOutside,
    canPlayOnline,
    shape: TV_FRAME,
    glyphs: "remote" as const,
    open: (screen: ScreenId) => asked.push(`open ${screen}`),
    back: () => asked.push("back"),
    applySettings: () => asked.push("apply"),
  };
  return shell as typeof shell & Shell;
}
const press = (screen: MenuScreen, ...buttons: RemoteButton[]) => buttons.forEach((b) => screen.press(b, false));

/** Every tab of the settings in turn, from the first: Right along the row of tabs. */
function eachTab(screen: MenuScreen, visit: (tab: string) => void) {
  screen.enter();
  screen.menu.focusOn("page");
  const tabs = screen.menu.items[0];
  for (let i = 0; i < (tabs.kind === "choice" ? tabs.options.length : 0); i++) {
    visit(settingsTab(screen));
    press(screen, "right");
  }
}

test("the settings are a row of tabs over each part's settings: Left and Right on the tabs, Down into a tab, Back goes back", () => {
  const shell = fakeShell();
  const screen = settingsScreen(shell);
  screen.enter();
  assert.equal(screen.menu.focused?.id, "page", "it opens on the tabs");
  assert.equal(settingsTab(screen), "wallpaper");
  press(screen, "right");
  assert.equal(settingsTab(screen), "screen");
  assert.deepEqual(
    screen.menu.items.slice(1).map((item) => item.id),
    ["eyesInset", "nerves", "statsPanel", "statsKind", "overlaySize", "overlayOpacity", "xray"],
    "everything that can show over the world, in one place",
  );
  press(screen, "right");
  assert.equal(settingsTab(screen), "picture");
  assert.deepEqual(screen.menu.items.slice(1).map((item) => item.id), ["pixels", "eyes", "hints", "rumble", "stats"]);
  press(screen, "down");
  assert.equal(screen.menu.focused?.id, "pixels");
  press(screen, "up");
  press(screen, "right");
  assert.equal(settingsTab(screen), "picture", "the last tab is the last");
  press(screen, "select");
  assert.equal(settingsTab(screen), "wallpaper", "Select steps round the tabs, for a remote held in one hand");
  press(screen, "back");
  assert.deepEqual(shell.asked, ["back"], "changing tabs changes no setting");
});

test("every setting the player chooses is on exactly one tab, and every tab fits without scrolling", () => {
  // Real weather only where the Apple TV can tell the weather outside; being online is the Online menu's (Disconnect, Go online), not a setting's.
  for (const [weatherOutside, online] of [[false, false], [true, false], [false, true], [true, true]]) {
    const screen = settingsScreen(fakeShell(undefined, weatherOutside, online));
    const ids: string[] = [];
    eachTab(screen, (tab) => {
      const rows = screen.menu.items.slice(1);
      ids.push(...rows.map((item) => item.id));
      assert.equal(screen.menu.rows, screen.menu.items.length, `${tab} shows all its rows`);
      assert.ok(rows.every((item) => item.kind !== "action"), `${tab} is all settings`);
      const { y } = screen.view.layout;
      assert.ok(y > 0 && y + screen.view.height < DESIGN_HEIGHT - 50, `${tab} clear of the menu hints`);
    });
    assert.deepEqual(
      [...ids].sort(),
      Object.keys(DEFAULT_SETTINGS)
        .filter((key) => key !== "scene" && key !== "joinOthers" && (weatherOutside || key !== "realWeather"))
        .sort(),
    );
  }
});

test("a tab shows the settings as they are when it opens, and a change is kept and applied", () => {
  const shell = fakeShell();
  const screen = settingsScreen(shell);
  // Changed elsewhere since the screen was made: by the Place tool, say.
  shell.settings.place = "greenhouse";
  shell.settings.pixels = "chunky";
  screen.enter();
  const place = screen.menu.item("place");
  assert.ok(place?.kind === "choice" && place.options[place.index].value === "greenhouse");
  // Camera: Follow, then Calm.
  press(screen, "down", "down", "right");
  assert.equal(shell.settings.wallpaperCamera, "calm");
  press(screen, "up", "up", "right", "right");
  const pixels = screen.menu.item("pixels");
  assert.ok(pixels?.kind === "choice" && pixels.options[pixels.index].value === "chunky");
  press(screen, "down", "right");
  assert.equal(shell.settings.pixels, "chunkier");
  assert.deepEqual(shell.asked, ["apply", "apply"]);
});

test("every value a tab offers is one a save keeps", () => {
  const screen = settingsScreen(fakeShell());
  eachTab(screen, () => {
    for (const item of screen.menu.items.slice(1)) {
      const values = item.kind === "choice" ? item.options.map((o) => o.value) : item.kind === "slider" ? [item.min, item.max] : [];
      for (const value of values) {
        const store = memory();
        saveSettings({ ...DEFAULT_SETTINGS, [item.id]: value }, store);
        assert.equal(loadSettings(store)[item.id as keyof Settings], value, `${item.id}: ${JSON.stringify(value)}`);
      }
    }
  });
});

test("the Activity row is lively at first and goes natural, last on the screensaver's tab", () => {
  const shell = fakeShell();
  const screen = settingsScreen(shell);
  screen.enter();
  const rows = screen.menu.items.slice(1);
  const pace = rows.at(-1);
  assert.ok(pace?.kind === "choice" && pace.id === "pace");
  assert.equal(pace.label, "Activity");
  assert.equal(pace.options[pace.index].label, "Lively");
  screen.menu.focusOn("pace");
  press(screen, "right");
  assert.equal(shell.settings.pace, "natural");
  assert.equal(pace.options[pace.index].label, "Natural");
  assert.deepEqual(shell.asked, ["apply"]);
});

test("the Rumble row applies Off and On like the other on/off settings", () => {
  const shell = fakeShell();
  const screen = settingsScreen(shell);
  screen.enter();
  press(screen, "right", "right");
  const rumble = screen.menu.item("rumble");
  assert.ok(rumble?.kind === "choice");
  assert.equal(rumble.label, "Rumble");
  assert.equal(rumble.options[rumble.index].label, "On");
  screen.menu.focusOn("rumble");
  press(screen, "left");
  assert.equal(shell.settings.rumble, false);
  assert.equal(rumble.options[rumble.index].label, "Off");
  press(screen, "right");
  assert.equal(shell.settings.rumble, true);
  assert.deepEqual(shell.asked, ["apply", "apply"]);
});


test("Flies is offered only where several brains can run, with counts up to the device's limit", () => {
  for (const maxFlies of [1, 2, 3, 4]) {
    const shell = fakeShell();
    shell.maxFlies = maxFlies;
    const screen = settingsScreen(shell);
    screen.enter();
    const row = screen.menu.item("flies");
    if (maxFlies === 1) {
      assert.equal(row, undefined);
      continue;
    }
    assert.ok(row?.kind === "choice");
    assert.equal(row.label, "Flies");
    assert.deepEqual(row.options.map((o) => o.value), Array.from({ length: maxFlies }, (_, i) => i + 1));
    screen.menu.focusOn("flies");
    for (let n = 2; n <= maxFlies; n++) {
      press(screen, "right");
      assert.equal(shell.settings.flies, n);
    }
    assert.deepEqual(shell.asked, Array(maxFlies - 1).fill("apply"));
  }
});

test("a kept weather expires exactly six hours after the choice, while a view is kept", () => {
  const store = shelfSaved({ weather: { kind: "rain", at: NOW }, view: { kind: "wide", at: NOW } });
  assert.equal(loadShelf(NOW + 6 * HOUR - 1, store).weather?.kind, "rain");
  assert.deepEqual(loadShelf(NOW + 6 * HOUR, store), { view: { kind: "wide", at: NOW } });
});
