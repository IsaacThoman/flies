// The menus as they are drawn and pressed: a setting showing what it can be,
// the line on what the focused row is for, the hints for what has the focus,
// the title's buttons, and a list sliding under its pane.

import assert from "node:assert/strict";
import { test } from "node:test";
import { HitMap, Menu } from "@fly/ui";
import type { ChoiceItem, Hit, MenuItem } from "@fly/ui";
import { TV_FRAME, frameFor } from "../src/display.ts";
import type { Frame } from "../src/display.ts";
import { DEFAULT_SETTINGS } from "../src/settings.ts";
import { MenuView } from "../src/ui/menu-view.ts";
import { journalGrid } from "../src/ui/screens/journal.ts";
import { settingsScreen, titleScreen } from "../src/ui/screens/menus.ts";
import type { MenuScreen } from "../src/ui/screens/menu-screen.ts";
import { OnlineScreen } from "../src/ui/screens/online.ts";
import type { Shell } from "../src/ui/screens/types.ts";
import { blankCanvas, writtenOn } from "./canvas.ts";
import { frames } from "./shapes.ts";

function shell(frame: Frame, glyphs: Shell["glyphs"] = null, more: Partial<Shell> = {}): Shell {
  return {
    settings: { ...DEFAULT_SETTINGS },
    maxFlies: 4,
    brain: { status: "running" } as unknown as Shell["brain"],
    meter: {} as unknown as Shell["meter"],
    life: {} as unknown as Shell["life"],
    journal: null,
    canSavePictures: false,
    savePicture: async () => "failed",
    weatherOutside: false,
    weatherAttribution: () => null,
    shape: frame,
    glyphs,
    open() {},
    back() {},
    play() {},
    watch() {},
    applySettings() {},
    canPlayOnline: true,
    table: null,
    tableEnded: null,
    knock: null,
    door() {},
    here: "picnic",
    rooms: null,
    typing: null,
    canShare: true,
    startRoom() {},
    joinRoom() {},
    shareTable: async () => "failed",
    removeFly() {},
    visiting: false,
    goHome() {},
    ...more,
  };
}

/** A screen drawn: its targets and what it wrote. */
function drawn(screen: { draw(g: CanvasRenderingContext2D, t: number, hits: HitMap): void }) {
  const g = blankCanvas();
  const hits = new HitMap();
  hits.begin("menu");
  screen.draw(g, 0, hits);
  return { hits: Array.from({ length: hits.count }, (_, i) => ({ ...hits.get(i)! })), words: writtenOn(g).map((w) => w.text), written: writtenOn(g) };
}

const page = (screen: MenuScreen, tab: number) => {
  for (let i = 0; i < tab; i++) screen.press("right", false);
  screen.press("down", false);
};
const rowOf = (screen: MenuScreen, id: string) => screen.menu.items.findIndex((i) => i.id === id);
const targets = (hits: Hit[], kind: string, row: number) => hits.filter((h) => h.kind === kind && h.index === row);

test("a setting shows what it can be: its options side by side, each to be pressed; a switch for off and on; arrows only where the options don't fit", () => {
  for (const [name, frame] of [["the TV", TV_FRAME] as const, ...frames()]) {
    const screen = settingsScreen(shell(frame));
    // On screen: Fly POV is off, in the screensaver, or always.
    screen.press("right", false);
    const pov = rowOf(screen, "eyesInset");
    screen.menu.focusOn("eyesInset");
    const onScreen = drawn(screen);
    const options = targets(onScreen.hits, "option", pov);
    if (!options.length) {
      // The smallest phones: three options a finger can press don't fit across them.
      assert.ok(frame.coarse && frame.design.width < 300, `${name}: options shown`);
      assert.deepEqual(targets(onScreen.hits, "step", pov).map((h) => h.value), [-1, 1], `${name}: arrows instead`);
      const at = onScreen.hits.find((h) => h.kind === "row" && h.index === pov)!;
      const inRow = onScreen.written.filter((w) => w.y > at.y && w.y < at.y + at.h).map((w) => w.text);
      assert.deepEqual(inRow, ["Fly POV", "Always"], `${name}: its name and the one chosen`);
      continue;
    }
    for (const label of ["Off", "Screensaver", "Always"]) assert.ok(onScreen.words.includes(label), `${name}: "${label}" shown`);
    assert.deepEqual(options.map((h) => h.value), [0, 1, 2], `${name}: each option a target`);
    assert.equal(targets(onScreen.hits, "step", pov).length, 0, `${name}: no arrows beside options that show`);
    // Side by side, in order, inside their row, and wide enough for a finger where there is one.
    const row = onScreen.hits.find((h) => h.kind === "row" && h.index === pov)!;
    for (let k = 0; k < options.length; k++) {
      const o = options[k];
      assert.ok(o.x >= row.x - 1e-6 && o.x + o.w <= row.x + row.w + 1e-6, `${name}: option ${k} inside its row`);
      if (k) assert.ok(o.x >= options[k - 1].x + options[k - 1].w - 1e-6, `${name}: option ${k} beside the one before`);
      if (frame.coarse) assert.ok(o.w * frame.unit >= 44, `${name}: option ${k} is ${(o.w * frame.unit).toFixed(0)} px wide`);
    }
    // Pressing one chooses it.
    screen.point({ type: "down", x: 0, y: 0, dx: 0, dy: 0, tap: false, hit: options[0] });
    screen.point({ type: "up", x: 0, y: 0, dx: 0, dy: 0, tap: true, hit: options[0] });
    assert.equal((screen.menu.items[pov] as ChoiceItem).index, 0, `${name}: the option pressed is chosen`);
  }
  // On the TV: what the stats show has too many words to show at once, and Hints is a switch.
  const tv = settingsScreen(shell(TV_FRAME, "remote"));
  tv.press("right", false);
  const kinds = drawn(tv);
  const stats = rowOf(tv, "statsKind");
  assert.deepEqual(targets(kinds.hits, "step", stats).map((h) => h.value), [-1, 1]);
  assert.equal(targets(kinds.hits, "option", stats).length, 0);
  assert.ok(kinds.words.includes("Brain + day") && !kinds.words.includes("In and out"), "only the one chosen is written");
  tv.press("right", false);
  const picture = drawn(tv);
  const hints = rowOf(tv, "hints");
  assert.equal(targets(picture.hits, "option", hints).length + targets(picture.hits, "step", hints).length, 0, "a switch is its row");
  assert.ok((tv.menu.items[hints] as ChoiceItem).toggle);
  assert.ok(picture.words.includes("On"));
});

test("a switch is thrown by Select, by Left and Right, and by a press anywhere on its row", () => {
  const s = shell(TV_FRAME, "remote");
  const screen = settingsScreen(s);
  page(screen, 2);
  screen.menu.focusOn("rumble");
  assert.equal(s.settings.rumble, true);
  screen.press("select", false);
  assert.equal(s.settings.rumble, false);
  screen.press("right", false);
  assert.equal(s.settings.rumble, true);
  screen.press("left", false);
  assert.equal(s.settings.rumble, false);
  const row = drawn(screen).hits.find((h) => h.kind === "row" && h.id === "rumble")!;
  screen.point({ type: "down", x: 0, y: 0, dx: 0, dy: 0, tap: false, hit: row });
  screen.point({ type: "up", x: 0, y: 0, dx: 0, dy: 0, tap: true, hit: row });
  assert.equal(s.settings.rumble, true);
});

test("a setting with nothing to act on is dimmed and passed over: what the stats show with no stats, how the corners look with nothing in them", () => {
  const s = shell(TV_FRAME, "remote");
  s.settings.eyesInset = "always";
  s.settings.nerves = "off";
  s.settings.statsPanel = "off";
  const screen = settingsScreen(s);
  screen.enter();
  screen.press("right", false);
  const item = (id: string) => screen.menu.item(id)!;
  assert.equal(item("statsKind").disabled, true);
  assert.equal(item("overlaySize").disabled, false);
  // Down from Stats goes past what it would show.
  screen.menu.focusOn("statsPanel");
  screen.press("down", false);
  assert.equal(screen.menu.focused?.id, "overlaySize");
  // Turning the stats on brings it back, at once.
  screen.menu.focusOn("statsPanel");
  screen.press("right", false);
  assert.equal(s.settings.statsPanel, "wallpaper");
  assert.equal(item("statsKind").disabled, false);
  screen.press("left", false);
  assert.equal(item("statsKind").disabled, true);
  // With nothing in the corners, their size and opacity have nothing to set.
  screen.menu.focusOn("eyesInset");
  screen.press("left", false);
  screen.press("left", false);
  assert.equal(s.settings.eyesInset, "off");
  assert.equal(item("overlaySize").disabled, true);
  assert.equal(item("overlayOpacity").disabled, true);
  assert.equal(item("xray").disabled ?? false, false);
  // And it is so when the page opens, too.
  const again = settingsScreen(s);
  again.enter();
  again.press("right", false);
  assert.equal(again.menu.item("overlaySize")!.disabled, true);
});

test("under the rows, a line on what the focused setting is for: with the buttons, the focused one's; with a mouse, the one under it; none on a pane too narrow for it", () => {
  const screen = settingsScreen(shell(TV_FRAME, "remote"));
  assert.ok(screen.pane.detail);
  // On the tabs, nothing to say.
  const detailOf = (id: string) => screen.menu.item(id)!.detail!;
  assert.ok(!drawn(screen).words.includes(detailOf("wallpaperCamera")));
  screen.menu.focusOn("wallpaperCamera");
  const focused = drawn(screen);
  const line = focused.written.find((w) => w.text === detailOf("wallpaperCamera"))!;
  assert.ok(line, "the focused setting's line is written");
  const { panel, list } = screen.pane;
  const rowsEnd = list.y + screen.menu.rows * (list.row + list.gap) - list.gap;
  assert.ok(line.y > rowsEnd && line.y < panel.y + panel.h, "under the rows, inside the pane");
  assert.ok(line.width <= panel.w - 40, "inside the pane's width");
  // Every setting has one, short enough for a line at its size.
  for (const tab of [0, 1, 2]) {
    const s = settingsScreen(shell(TV_FRAME, "remote"));
    for (let i = 0; i < tab; i++) s.press("right", false);
    for (const item of s.menu.items.slice(1)) {
      assert.ok(item.detail, `${item.id} says what it is for`);
      assert.ok(item.detail.length * 12 * 0.55 <= s.pane.panel.w - 40, `${item.id}: "${item.detail}" fits on a line`);
    }
  }
  // Pointing: what the mouse is over, else what was last pressed.
  const pointed = settingsScreen(shell(TV_FRAME));
  const row = drawn(pointed).hits.find((h) => h.kind === "row" && h.id === "pace")!;
  pointed.point({ type: "hover", x: 0, y: 0, dx: 0, dy: 0, tap: false, hit: row });
  assert.ok(drawn(pointed).words.includes(pointed.menu.item("pace")!.detail!));
  pointed.point({ type: "hover", x: 0, y: 0, dx: 0, dy: 0, tap: false, hit: null });
  assert.ok(!drawn(pointed).words.includes(pointed.menu.item("pace")!.detail!));
  // A phone held upright has two lines to a row already.
  const phone = settingsScreen(shell(frameFor(393, 852, { top: 59, right: 0, bottom: 34, left: 0 }, true)));
  assert.equal(phone.pane.detail, null);
  phone.menu.focusOn("wallpaperCamera");
  assert.ok(!drawn(phone).words.includes(phone.menu.item("wallpaperCamera")!.detail!));
});

test("the hints say what the buttons in hand do with what has the focus, and nothing once the menus have been learned, with Hints off, or for a pointer", () => {
  const s = shell(TV_FRAME, "remote", { teachingMenu: true });
  // At the root there is nothing to go back to.
  const title = titleScreen(s);
  const root = drawn(title).words;
  assert.ok(root.includes("Select") && !root.includes("Back"));
  const settings = settingsScreen(s);
  // On the tabs and on a setting, Left and Right change it.
  assert.ok(drawn(settings).words.includes("Change"));
  settings.press("down", false);
  const onSetting = drawn(settings).words;
  assert.ok(onSetting.includes("Change") && onSetting.includes("Back") && !onSetting.includes("Select"));
  // On a button, Select; on a field, typing.
  const online = new OnlineScreen({ ...s, typing: { active: null, end() {}, take: () => null } as unknown as Shell["typing"] });
  online.enter();
  online.menu.focusOn("new");
  assert.ok(drawn(online).words.includes("Select"));
  online.menu.focusOn("code");
  const onField = drawn(online).words;
  assert.ok(onField.includes("Type") && !onField.includes("Select"));
  // Learned, switched off, or pointing: none.
  for (const quiet of [shell(TV_FRAME, "remote", { teachingMenu: false }), { ...shell(TV_FRAME, "remote", { teachingMenu: true }), settings: { ...DEFAULT_SETTINGS, hints: false } }, shell(TV_FRAME, null, { teachingMenu: true })]) {
    const words = drawn(settingsScreen(quiet)).words;
    assert.ok(!words.includes("Change") && !words.includes("Back"));
  }
  // On a screen too narrow for the words, the buttons alone.
  const narrow = drawn(settingsScreen(shell(frameFor(200, 480), "keys", { teachingMenu: true }))).words;
  assert.ok(!narrow.includes("Change"));
});

test("the title's buttons: each with a picture of what it is, Play the one that stands out, and Online saying which room the fly is at", () => {
  const s = shell(TV_FRAME, "remote");
  const title = titleScreen(s);
  const items = title.menu.items.map((i) => (i.kind === "action" ? [i.id, i.icon, !!i.primary] : []));
  assert.deepEqual(items, [["play", "play", true], ["watch", "watch", false], ["settings", "settings", false], ["online", "online", false], ["journal", "journal", false], ["about", "about", false]]);
  assert.ok(!drawn(title).words.includes("Sunny Crumbs"));
  // At a room, once it has let this device in.
  const table = { name: "Sunny Crumbs", code: "abcdefghjk", link: "", starting: false, joined: false, everyone: false, others: [] };
  const at = { ...s, table } as Shell;
  const there = titleScreen(at);
  there.update(0);
  assert.ok(!drawn(there).words.includes("Sunny Crumbs"), "not while it is still on the way in");
  (at as { table: Shell["table"] }).table = { ...table, joined: true };
  assert.equal(there.update(0), true);
  assert.ok(drawn(there).words.includes("Sunny Crumbs"));
  (at as { table: Shell["table"] }).table = null;
  there.update(0);
  assert.ok(!drawn(there).words.includes("Sunny Crumbs"), "home again");
});

test("a list longer than its pane slides to where the focus went, its rows pressed where they come to rest from the first frame", () => {
  const items: MenuItem[] = Array.from({ length: 12 }, (_, i) => ({ kind: "action", id: `a${i}`, label: `Row ${i}` }));
  const menu = new Menu(items, { rows: 4 });
  const layout = { x: 20, y: 30, width: 300, row: 40, gap: 8 };
  const view = new MenuView(menu, layout);
  const rows = () => {
    const hits = new HitMap();
    hits.begin("list");
    view.draw(blankCanvas(), 0, hits, true);
    return Array.from({ length: hits.count }, (_, i) => ({ ...hits.get(i)! })).filter((h) => h.kind === "row");
  };
  assert.deepEqual(rows().map((h) => h.index), [0, 1, 2, 3]);
  menu.focusOn("a9");
  assert.equal(menu.scroll, 6);
  // Not yet moved a frame: the rows are already where they will rest.
  const sliding = rows();
  assert.deepEqual(sliding.map((h) => h.index), [6, 7, 8, 9]);
  assert.deepEqual(sliding.map((h) => h.y), [30, 78, 126, 174]);
  // It moves for a moment, then is still, and the same.
  assert.equal(view.update(1 / 60), true);
  for (let i = 0; i < 240; i++) view.update(1 / 60);
  assert.equal(view.update(1 / 60), false);
  assert.deepEqual(rows(), sliding);
});

test("options too narrow to read or to press are the one chosen, between arrows", () => {
  const options = ["Morning", "Midday", "Golden hour", "Dusk", "Night"].map((label, value) => ({ value, label }));
  const item: ChoiceItem = { kind: "choice", id: "light", label: "Light", options, index: 1 };
  const draw = (width: number, finger: number, compact = false) => {
    const view = new MenuView(new Menu([item]), { x: 0, y: 0, width, row: compact ? 54 : 44, gap: 8, compact });
    view.finger = finger;
    const g = blankCanvas();
    const hits = new HitMap();
    hits.begin("list");
    view.draw(g, 0, hits, true);
    const all = Array.from({ length: hits.count }, (_, i) => ({ ...hits.get(i)! }));
    return { options: all.filter((h) => h.kind === "option").length, steps: all.filter((h) => h.kind === "step").length, words: writtenOn(g) };
  };
  // Wide enough for all five.
  const wide = draw(900, 0);
  assert.deepEqual([wide.options, wide.steps], [5, 0]);
  assert.ok(wide.words.filter((w) => options.some((o) => o.label === w.text)).every((w) => w.size >= 12));
  // Too narrow for their words at a size that can be read.
  const narrow = draw(380, 0);
  assert.deepEqual([narrow.options, narrow.steps], [0, 2]);
  assert.deepEqual(narrow.words.filter((w) => options.some((o) => o.label === w.text)).map((w) => w.text), ["Midday"]);
  // Readable, but not each wide enough for a finger.
  const short = [1, 2, 3, 4, 5, 6, 7, 8].map((value) => ({ value, label: String(value) }));
  const counts: ChoiceItem = { kind: "choice", id: "n", label: "N", options: short, index: 0 };
  const view = new MenuView(new Menu([counts]), { x: 0, y: 0, width: 240, row: 54, gap: 8, compact: true });
  const press = (finger: number) => {
    view.finger = finger;
    const hits = new HitMap();
    hits.begin("list");
    view.draw(blankCanvas(), 0, hits, true);
    return Array.from({ length: hits.count }, (_, i) => hits.get(i)!.kind).filter((k) => k === "option").length;
  };
  assert.equal(press(0), 8);
  assert.equal(press(36), 0);
});

test("the journal's pictures are as big as fills the pane with whole rows", () => {
  // The TV's pane: three across fill its height in two rows, where four would leave a third of it empty.
  const tv = journalGrid({ x: 67, y: 22, w: 720, h: 420 });
  assert.deepEqual([tv.columns, tv.rows], [3, 2]);
  assert.ok(tv.rows * tv.rowH <= tv.h + tv.gap && tv.h - tv.rows * tv.rowH < tv.rowH / 3, "little of its height spare");
  // A phone's: two across, as many rows as fit.
  const phone = journalGrid({ x: 8, y: 60, w: 298, h: 560 });
  assert.equal(phone.columns, 2);
  assert.ok(phone.rows >= 3);
  for (const g of [tv, phone]) assert.ok(g.cellW >= 110 && g.cellW <= 230 + 1e-6, `pictures ${g.cellW.toFixed(0)} wide`);
});

test("how things stand with the rooms is said in plain words, not on a button that can't be pressed; a room is an entry with its name at the left", () => {
  const looking = new OnlineScreen({ ...shell(TV_FRAME, "remote"), typing: { active: null, end() {}, take: () => null } as unknown as Shell["typing"] });
  looking.enter();
  const status = looking.menu.item("looking")!;
  assert.ok(status.kind === "action" && status.quiet && status.disabled);
  assert.ok(drawn(looking).words.includes("Looking for rooms…"));
  // It is passed over by the focus.
  looking.menu.focusOn("code");
  looking.press("down", false);
  assert.equal(looking.menu.focused?.id, "code");
  const rooms = [{ code: "aaaaaaaaaa", name: "Sunny Crumbs", place: "picnic", flies: 3, locked: true }];
  const listed = new OnlineScreen({ ...shell(TV_FRAME, "remote"), rooms });
  listed.enter();
  const page = drawn(listed);
  const name = page.written.find((w) => w.text === "Sunny Crumbs")!;
  const row = page.hits.find((h) => h.kind === "row" && h.id === "room:aaaaaaaaaa")!;
  assert.equal(name.align, "left");
  assert.ok(name.x > row.x && name.x + name.width < row.x + row.w, "its name inside its entry");
  const count = page.written.find((w) => w.text === "3/128")!;
  assert.ok(count.align === "right" && count.x <= row.x + row.w && count.x - count.width > name.x + name.width, "its flies at the right, clear of its name");
});
