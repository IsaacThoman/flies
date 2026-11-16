import assert from "node:assert/strict";
import { test } from "node:test";
import { HitMap } from "@fly/ui";
import { TV_FRAME, frameFor } from "../src/display.ts";
import type { Frame } from "../src/display.ts";
import { DEFAULT_SETTINGS } from "../src/settings.ts";
import type { Learned } from "../src/settings.ts";
import { TOOLS, Hands } from "../src/tools/hands.ts";
import { HUD_HITS, drawHud } from "../src/ui/hud.ts";
import type { HudState } from "../src/ui/hud.ts";
import { hudLayout, loadingLayout, safeRect, titleLayout } from "../src/ui/layout.ts";
import { LOADING_HITS, drawLoading } from "../src/ui/loading.ts";
import type { Rect } from "../src/ui/layout.ts";
import { AboutScreen } from "../src/ui/screens/about.ts";
import { settingsScreen, titleScreen } from "../src/ui/screens/menus.ts";
import type { Shell } from "../src/ui/screens/types.ts";
import { createPicnic } from "@fly/world";
import { blankCanvas, writtenOn } from "./canvas.ts";
import { frames } from "./shapes.ts";

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
/** A finger needs about this much (design units, with the HUD's slop for a fingertip) to land on what it means. */
const FINGER = 40;
const inside = (r: Rect, a: Rect, slack = 0.5) => r.x >= a.x - slack && r.y >= a.y - slack && r.x + r.w <= a.x + a.w + slack && r.y + r.h <= a.y + a.h + slack;
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function shell(frame: Frame, glyphs: Shell["glyphs"] = null, online = true): Shell {
  return {
    settings: { ...DEFAULT_SETTINGS },
    brain: { status: "running", neurons: 166700, connections: 6242118, state: null } as unknown as Shell["brain"],
    meter: { history: new Float32Array(120), head: 0, spikesPerSecond: 0, active: 0, speed: 1 } as unknown as Shell["meter"],
    life: { sensed: { loomLeft: 0, loomRight: 0, touch: 0, bumpLeft: 0, bumpRight: 0, wind: 0, sweet: 0, grounded: true, light: null }, activity: "resting" } as unknown as Shell["life"],
    weatherOutside: false,
    weatherAttribution: () => null,
    shape: frame,
    glyphs,
    open() {},
    back() {},
    play() {},
    watch() {},
    applySettings() {},
    // With "Online" on the title and the pause menu, as in a browser: the longest they are.
    canPlayOnline: online,
    table: null,
    tableEnded: null,
    knock: null,
    door() {},
    here: "picnic",
    rooms: null,
    typing: null,
    startRoom() {},
    joinRoom() {},
    shareTable: async () => "failed",
    removeFly() {},
    leaveTable() {},
  };
}

test("on the TV everything is where it always was", () => {
  const hud = hudLayout(TV_FRAME);
  assert.equal(hud.cx, 427);
  assert.equal(hud.captionY, 25);
  assert.equal(hud.shelfY, 446);
  assert.equal(hud.gap, 52);
  assert.deepEqual([hud.shelfLeft, hud.split, hud.apart], [203, TOOLS.findIndex((t) => t.id === "light"), 32]);
  assert.equal(hud.orb, 1);
  assert.equal(hud.labelY, 385);
  assert.deepEqual([hud.hintsX, hud.hintsY, hud.rightX, hud.rightY, hud.menuX, hud.menuY], [16, 446, 838, 446, 16, 24]);
  const p = hud.picture;
  assert.ok(near(p.x, 68.32) && near(p.y, 52.8) && near(p.w, 717.36) && near(p.h, 297.6), JSON.stringify(p));
  assert.deepEqual([hud.statsX, hud.statsY], [844, 470]);

  const title = titleLayout(TV_FRAME, 5);
  assert.deepEqual(title.menu.panel, { x: 494, y: 112, w: 320, h: 300 });
  assert.deepEqual(title.menu.list, { x: 522, y: 138, width: 264, row: 40, gap: 12, compact: false, columns: 1 });
  assert.ok(near(title.wordmark.x, 250) && title.wordmark.y === 100 && title.wordmark.size === 60);
  assert.ok(near(title.status.x, 72) && title.status.y === 128 && title.status.w === 356 && title.status.size === 15);
  assert.ok(near(title.fly.across, -0.56) && title.fly.low === 0.1);

  // The Apple TV has no way to a table yet.
  const s = shell(TV_FRAME, "remote", false);
  const settings = settingsScreen(s);
  // Sized for its longest tab (On screen: the tabs and seven rows, as Wallpaper was on an Apple TV that can tell the weather), so it keeps its size from tab to tab.
  assert.deepEqual(settings.pane.panel, { x: 157, y: 13, w: 540, h: 426 });
  assert.deepEqual(settings.pane.list, { x: 185, y: 39, width: 484, row: 36, gap: 12, compact: false, columns: 1 });
  assert.equal(settings.menu.rows, settings.menu.items.length);

  const loading = loadingLayout(TV_FRAME);
  assert.deepEqual(loading.panel, { x: 207, y: 292, w: 440, h: 132 });
  assert.deepEqual(loading.wordmark, { x: 427, y: 150, size: 64 });
});

test("at every shape the HUD is inside the safe area, nothing on it overlaps, and the shelf takes a finger", () => {
  for (const [name, frame] of frames()) {
    const a = safeRect(frame);
    const hud = hudLayout(frame);
    const shelf = { x: hud.shelfLeft - 8, y: hud.shelfY - 26, w: hud.gap * TOOLS.length + 16, h: 52 };
    const label = { x: hud.cx - 100, y: hud.labelY - 17, w: 200, h: 32 };
    const menu = { x: hud.menuX, y: hud.menuY - 18, w: 36, h: 36 };
    // The widest caption, kept clear of the menu's button as the HUD keeps it, and no wider than fits beside it.
    const cw = Math.min(200, a.x + a.w - 8 - (menu.x + menu.w + 8));
    const caption = { x: Math.max(hud.cx, menu.x + menu.w + 8 + cw / 2) - cw / 2, y: hud.captionY - 15, w: cw, h: 30 };
    for (const [part, r] of Object.entries({ shelf, label, caption, menu, picture: hud.picture })) assert.ok(inside(r, a), `${name}: the ${part} is inside the safe area`);
    assert.ok(!overlaps(shelf, label), `${name}: the shelf and the label`);
    assert.ok(!overlaps(caption, hud.picture) && !overlaps(label, hud.picture), `${name}: the eyes' picture between the caption and the label`);
    assert.ok(!overlaps(menu, caption), `${name}: the menu button and the caption`);
    // About a finger's width (44 CSS pixels is Apple's guide); on a phone, eight tools in two halves across leave a little less, and on the narrowest less again.
    if (frame.coarse) assert.ok(hud.gap * frame.unit >= (a.w * frame.unit >= 370 ? 42 : 34), `${name}: each tool ${(hud.gap * frame.unit).toFixed(0)} px across`);
  }
});

test("the HUD's targets are where it draws them, inside the safe area, and big enough for a finger", () => {
  const world = createPicnic();
  for (const [name, frame] of frames()) {
    const hands = new Hands(world);
    hands.chooseTool(TOOLS.findIndex((t) => t.id === "place"));
    // Somewhere it isn't, so there is a place to go.
    hands.stepVariant(1);
    const hits = new HitMap();
    hits.begin("play");
    const state: HudState = { hands, here: "picnic", activity: "walking", food: null, hints: true, glyphs: null, learned: {}, teachSwipe: false, changed: 10, spikes: 0, brainRunning: true, eyes: null, layout: hudLayout(frame) };
    drawHud(blankCanvas(), 0, state, hits);
    const kinds = new Set<string>();
    for (let i = 0; i < hits.count; i++) {
      const h = hits.get(i)!;
      kinds.add(h.kind);
      assert.ok(inside(h, safeRect(frame), 8), `${name}: ${h.kind} ${h.index} inside the safe area`);
      if (frame.coarse) assert.ok(Math.min(h.w, h.h) + 16 >= FINGER, `${name}: ${h.kind} ${h.index} takes a finger (${h.w.toFixed(0)}×${h.h.toFixed(0)})`);
    }
    for (const kind of [HUD_HITS.tool, HUD_HITS.kind, HUD_HITS.label, HUD_HITS.go, HUD_HITS.menu]) assert.ok(kinds.has(kind), `${name}: ${kind}`);
    // Each tool's slot is under its orb.
    const slots = Array.from({ length: hits.count }, (_, i) => hits.get(i)!).filter((h) => h.kind === HUD_HITS.tool);
    assert.equal(slots.length, TOOLS.length);
    for (let i = 1; i < slots.length; i++) assert.ok(slots[i].x >= slots[i - 1].x + slots[i - 1].w - 1e-6, `${name}: slots side by side`);
  }
});

test("with the remote in hand the HUD records no targets of its own but the menu's hint, and with nothing pointing, none at all", () => {
  const hands = new Hands(createPicnic());
  const hits = new HitMap();
  hits.enabled = false;
  drawHud(blankCanvas(), 0, { hands, here: "picnic", activity: "walking", food: null, hints: true, glyphs: "remote", learned: {}, teachSwipe: true, changed: 10, spikes: 0, brainRunning: true, eyes: null, layout: hudLayout(TV_FRAME) }, hits);
  assert.equal(hits.count, 0);
});

test("every menu fits inside the safe area at every shape, its rows big enough for a finger, scrolling what doesn't fit", () => {
  // And the shortest phone held on its side, for the menu, which never scrolls.
  for (const [name, frame] of [...frames(), ["a small phone on its side", frameFor(568, 320, { top: 0, right: 0, bottom: 0, left: 0 }, true)] as const]) {
    const a = safeRect(frame);
    const s = shell(frame);
    for (const screen of [titleScreen(s), settingsScreen(s)]) {
      const { panel, list, rows } = screen.pane;
      assert.ok(inside(panel, a), `${name}: ${screen.id} inside the safe area: ${JSON.stringify(panel)}`);
      assert.ok(list.y + Math.ceil(rows / list.columns) * (list.row + list.gap) - list.gap <= panel.y + panel.h + 1e-6, `${name}: ${screen.id}'s rows inside its pane`);
      assert.ok(list.row >= 34, `${name}: ${screen.id}'s rows ${list.row} tall`);
      // A tab shorter than the longest leaves room spare.
      assert.equal(screen.menu.rows, Math.min(rows, screen.menu.items.length));
      if (frame.coarse) assert.ok(list.row * frame.unit >= 42, `${name}: ${screen.id}'s rows ${(list.row * frame.unit).toFixed(0)} px tall`);
      // Drawn, its targets are the rows shown.
      const hits = new HitMap();
      hits.begin(screen.id);
      screen.draw(blankCanvas(), 0, hits);
      let shown = 0;
      for (let i = 0; i < hits.count; i++) if (hits.get(i)!.kind === "row") shown++;
      assert.equal(shown, screen.menu.rows, `${name}: ${screen.id}`);
    }
    // The menu's five rows (with Online) all show: in two columns where one is too short for them.
    const title = titleScreen(s);
    assert.equal(title.menu.rows, title.menu.items.length, `${name}: the menu doesn't scroll`);
    // Each row where it is drawn, inside the pane and clear of the others.
    const hits = new HitMap();
    hits.begin(title.id);
    const drawn = blankCanvas();
    title.draw(drawn, 0, hits);
    const rows: Rect[] = [];
    for (let i = 0; i < hits.count; i++) {
      const hit = hits.get(i)!;
      if (hit.kind === "row") rows.push({ x: hit.x, y: hit.y, w: hit.w, h: hit.h });
    }
    assert.equal(rows.length, title.menu.items.length, `${name}: every row drawn`);
    for (const r of rows) assert.ok(inside(r, title.pane.panel), `${name}: a row inside the pane`);
    for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) assert.ok(!overlaps(rows[i], rows[j]), `${name}: rows ${i} and ${j}`);
    // Each label inside its button.
    for (const item of title.menu.items) {
      const w = writtenOn(drawn).find((t) => t.text === item.label)!;
      assert.ok(w.width <= rows[0].w - 16, `${name}: "${item.label}" ${w.width.toFixed(0)} wide on a button ${rows[0].w.toFixed(0)} wide`);
    }
    // The brain's state, under the name, clear of the menu.
    const t = titleLayout(frame, title.menu.items.length);
    assert.ok(!overlaps(t.status, t.menu.panel) && inside(t.status, a), `${name}: the brain's state`);
  }
});

test("the settings' tabs can be read at every shape: every one, or, where they are too narrow for that, the one chosen with arrows to step along them", () => {
  const labels = ["Wallpaper", "On screen", "Picture"];
  for (const [name, frame] of [["the TV", TV_FRAME] as const, ...frames()]) {
    for (const glyphs of [null, "remote"] as const) {
      const screen = settingsScreen(shell(frame, glyphs));
      const g = blankCanvas();
      const hits = new HitMap();
      hits.begin(screen.id);
      screen.draw(g, 0, hits);
      const tabs = writtenOn(g).filter((w) => labels.includes(w.text));
      const where = `${name}, ${glyphs ?? "pointing"}`;
      if (tabs.length === labels.length) {
        assert.ok(tabs.every((w) => w.size === tabs[0].size && w.size >= 7), `${where}: tabs at ${tabs.map((w) => w.size).join(", ")}`);
      } else {
        assert.deepEqual(tabs.map((w) => w.text), ["Wallpaper"], `${where}: the tab chosen`);
        assert.ok(tabs[0].size >= 12, `${where}: at ${tabs[0].size}`);
        let steps = 0;
        for (let i = 0; i < hits.count; i++) if (hits.get(i)!.kind === "step" && hits.get(i)!.index === 0) steps++;
        assert.equal(steps, 2, `${where}: arrows either side`);
      }
    }
  }
  // The TV's four tabs are as big as a row's words.
  const g = blankCanvas();
  settingsScreen(shell(TV_FRAME, "remote")).draw(g, 0, new HitMap());
  assert.ok(writtenOn(g).filter((w) => labels.includes(w.text)).every((w) => w.size === 17), "on the TV");
});

test("the title leaves room for the fly, clear of the name, the brain's state and the menu", () => {
  for (const [name, frame] of frames()) {
    const t = titleLayout(frame, 5);
    const a = safeRect(frame);
    const { width, height } = frame.design;
    assert.ok(inside(t.menu.panel, a), `${name}: menu`);
    assert.ok(inside(t.status, a), `${name}: status`);
    assert.ok(!overlaps(t.status, t.menu.panel), `${name}: the brain's state and the menu`);
    // Where the fly is, in design units.
    const fx = (t.fly.across + 1) * (width / 2);
    const fy = (t.fly.low + 1) * (height / 2);
    const fly = { x: fx - 20, y: fy - 12, w: 40, h: 24 };
    assert.ok(!overlaps(fly, t.menu.panel) && !overlaps(fly, t.status), `${name}: the fly at ${fx.toFixed(0)}, ${fy.toFixed(0)} is in the clear`);
  }
});

test("the About page is inside the safe area at every shape, and scroll what doesn't fit", () => {
  for (const [name, frame] of frames()) {
    const s = shell(frame);
    for (const screen of [new AboutScreen(s)]) {
      const hits = new HitMap();
      hits.begin(screen.id);
      screen.draw(blankCanvas(), 0, hits);
      const panel = hits.get(0)!;
      assert.equal(panel.kind, "panel");
      assert.ok(inside(panel, safeRect(frame)), `${name}: ${screen.id}`);
      let back = false;
      for (let i = 0; i < hits.count; i++) back ||= hits.get(i)!.kind === "back";
      assert.ok(back, `${name}: ${screen.id} has a back button for a pointer`);
    }
  }
});

test("with a remote, a keyboard or a pad in hand, the hints keep clear of the shelf at every shape", () => {
  for (const [name, frame] of frames()) {
    const hud = hudLayout(frame);
    const glass = { x: hud.shelfLeft - 8, y: hud.shelfY - 26, w: hud.gap * TOOLS.length + hud.apart + 16, h: 52 };
    for (const glyphs of ["remote", "keys", "pad"] as const) {
      for (const tool of ["feed", "blow"]) {
        const hands = new Hands(createPicnic());
        hands.chooseTool(TOOLS.findIndex((t) => t.id === tool));
        for (const learned of [{}, { tools: true }] as Learned[]) {
          const g = blankCanvas();
          drawHud(g, 0, { hands, here: "picnic", activity: "walking", food: null, hints: true, glyphs, learned, teachSwipe: true, changed: 10, spikes: 0, brainRunning: true, eyes: null, layout: hud }, new HitMap());
          for (const chip of writtenOn(g).filter((w) => w.size === 13)) {
            // A chip: from the hints' edge on the left; on the right, its glyph before its words (a chip 13 high starts 0.95 of its 22.75 height before them), and a little after them.
            const left = chip.x < hud.cx ? hud.hintsX : chip.x - 0.95 * 22.75;
            const r = { x: left, y: chip.y - 11.4, w: chip.x + chip.width + 12 - left, h: 22.8 };
            assert.ok(!overlaps(r, glass), `${name}, ${glyphs}, ${tool}: "${chip.text}" over the shelf`);
          }
        }
      }
    }
  }
});

test("the loading screen and its failure panel: where they always were on the TV, and at every shape inside the safe area, with Try again a finger can press", () => {
  const tv = loadingLayout(TV_FRAME);
  assert.deepEqual(tv.failure, { x: 167, y: 274, w: 520, h: 150 });
  assert.deepEqual(tv.retry, { x: 337, y: 378, w: 180, h: 34 });
  const failed = { status: "failed", error: "", neurons: 0, failure: "download", phase: "download", progress: 0.4, source: { received: 4e6, total: 14.2e6, from: "network" }, retry() {} } as unknown as Parameters<typeof drawLoading>[2];
  for (const [name, frame] of frames()) {
    const l = loadingLayout(frame);
    const a = safeRect(frame);
    for (const [part, r] of Object.entries({ panel: l.panel, failure: l.failure, retry: l.retry })) assert.ok(inside(r, a), `${name}: the ${part} inside the safe area`);
    assert.ok(inside(l.retry, l.failure), `${name}: Try again inside its panel`);
    assert.ok(l.wordmark.y + l.wordmark.size * 0.25 <= l.failure.y && l.wordmark.y - l.wordmark.size * 0.8 >= a.y, `${name}: the name clear of the panes, inside the safe area`);
    if (frame.coarse) assert.ok(l.retry.h * frame.unit >= 42 && l.retry.w * frame.unit >= 120, `${name}: Try again ${(l.retry.w * frame.unit).toFixed(0)}×${(l.retry.h * frame.unit).toFixed(0)} px`);
    const hits = new HitMap();
    hits.begin("loading");
    drawLoading(blankCanvas(), 0, failed, l, hits);
    const hit = hits.at(l.retry.x + l.retry.w / 2, l.retry.y + l.retry.h / 2);
    assert.equal(hit?.kind, LOADING_HITS.retry, `${name}: Try again is where it is drawn`);
  }
});
