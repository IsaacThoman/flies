import assert from "node:assert/strict";
import { test } from "node:test";
import { REGIONS } from "@fly/brain";
import type { BrainState } from "@fly/brain";
import type { BrainDriver } from "@fly/contracts";
import { HitMap } from "@fly/ui";
import { World } from "@fly/world";
import { TV_FRAME, frameFor } from "../src/display.ts";
import type { Frame } from "../src/display.ts";
import { pictureSize } from "../src/journal/capture.ts";
import { FLIGHT_SECONDS, GROOM_SECONDS, Moments } from "../src/journal/moments.ts";
import type { Lived, Moment } from "../src/journal/moments.ts";
import { Photos } from "../src/journal/photos.ts";
import { Journal, LARGE, SMALL, evictions, journalKey, memoryShelf, readEntry } from "../src/journal/store.ts";
import type { Adding, Entry, Shelf } from "../src/journal/store.ts";
import { Life } from "../src/life.ts";
import { places } from "../../../scripts/fuzz/body.ts";
import { DEFAULT_SETTINGS } from "../src/settings.ts";
import { JournalScreen, journalGrid, shortDate, twoWords } from "../src/ui/screens/journal.ts";
import type { Shell } from "../src/ui/screens/types.ts";
import { fitPane } from "../src/ui/layout.ts";
import { blankCanvas } from "./canvas.ts";

class Commands implements BrainDriver {
  readonly status = "running";
  readonly error = null;
  readonly neurons = 0;
  readonly connections = 0;
  readonly eyes = null;
  readonly regionRates = new Float32Array(REGIONS.length);
  stateAt = 0;
  state: BrainState = { command: { walk: 0, turn: 0, back: 0, escape: 0, wings: 0, groom: 0, feed: 0, sing: 0 }, stats: { simMs: 0, wallMs: 0, spikes: 0, active: 0, rates: {} } };
  tick() { this.stateAt = performance.now(); }
  dispose() {}
}

/** A life as the moments read it, set by hand. */
function lived(): { -readonly [K in keyof Lived]: Lived[K] } & { body: { mode: string; surface: { solid: number } }; senses: { tasting: { food: { name: string } | null } } } {
  return { activity: "resting", meals: 0, takeOffs: 0, body: { mode: "standing", surface: { solid: -1 } }, world: { solids: [{ name: "terracotta pot" }, { name: "fallen tomato" }] }, senses: { tasting: { food: null } } };
}

const keys = (found: Moment[]) => found.map((m) => m.key);

test("a real life's first meal of each food is a first, once; a meal before the watching began isn't", () => {
  const brain = new Commands();
  const life = new Life(new World(places.picnic), brain);
  const moments = new Moments();
  const found: Moment[] = [];
  const at = life.body.position;
  life.pantry.drop("honey", at.x, at.z, at.y);
  moments.watch(life, 0, found);
  brain.state.command.feed = 1;
  for (let i = 0; i < 30 && !life.meals; i++) {
    life.step(1 / 30, performance.now());
    moments.watch(life, 1 / 30, found);
  }
  assert.equal(life.meals, 1, "it ate");
  assert.deepEqual(keys(found), ["meal:honey"]);
  assert.equal(found[0].label, "honey");
  // Stops, and eats honey again: not a first.
  brain.state.command.feed = 0;
  const live = () => {
    life.step(1 / 30, performance.now());
    moments.watch(life, 1 / 30, found);
  };
  for (let i = 0; i < 10; i++) live();
  brain.state.command.feed = 1;
  for (let i = 0; i < 30 && life.meals < 2; i++) live();
  assert.equal(life.meals, 2);
  assert.deepEqual(keys(found), ["meal:honey"]);
  // Watched only from now on, an earlier meal is no first.
  const later = new Moments();
  const none: Moment[] = [];
  later.watch(life, 1 / 30, none);
  assert.deepEqual(none, []);
});

test("a real life's escape is a first at the jump; flight a first only after a second of wings beating", () => {
  const brain = new Commands();
  const life = new Life(new World(places.picnic), brain);
  const moments = new Moments();
  const found: Moment[] = [];
  // Its escape is armed once the command has been low.
  life.step(1 / 60, performance.now());
  moments.watch(life, 0, found);
  brain.state.command.escape = 1;
  brain.state.command.wings = 1;
  let flying = 0;
  for (let i = 0; i < 120 && !found.some((m) => m.kind === "flight"); i++) {
    life.step(1 / 60, performance.now());
    moments.watch(life, 1 / 60, found);
    if (life.activity === "flying") flying += 1 / 60;
    if (flying < FLIGHT_SECONDS - 1e-6) assert.ok(!found.some((m) => m.kind === "flight"), "not a flight yet");
  }
  assert.deepEqual(keys(found), ["escape", "flight"]);
});

test("grooming, sleep and walking onto something are firsts as the life does them, never before", () => {
  const life = lived();
  const moments = new Moments();
  const found: Moment[] = [];
  const step = (dt = 0.1) => moments.watch(life, dt, found);
  step();
  life.activity = "grooming";
  step(GROOM_SECONDS / 2);
  life.activity = "resting";
  step();
  life.activity = "grooming";
  step(GROOM_SECONDS / 2);
  assert.deepEqual(found, [], "two short grooms aren't a groom");
  step(GROOM_SECONDS / 2 + 0.01);
  assert.deepEqual(keys(found), ["groom"]);
  life.activity = "sleeping";
  step();
  assert.deepEqual(keys(found), ["groom", "sleep"]);
  // Landing on the pot from the air isn't walking onto it.
  life.body.mode = "airborne";
  step();
  life.body.mode = "standing";
  life.body.surface.solid = 0;
  step();
  assert.deepEqual(keys(found), ["groom", "sleep"]);
  // Walking from the pot onto the tomato is.
  life.body.surface.solid = 1;
  step();
  assert.deepEqual(found.at(-1), { kind: "climb", key: "climb", label: "fallen tomato" });
  life.body.surface.solid = 0;
  step();
  assert.equal(found.length, 3, "only the first time");
});

test("arriving somewhere is a first visit once per place, and a set-down there isn't walking onto it", () => {
  const moments = new Moments();
  const found: Moment[] = [];
  moments.arrived("picnic", "Picnic table", found);
  moments.arrived("kitchen", "Kitchen counter", found);
  moments.arrived("picnic", "Picnic table", found);
  assert.deepEqual(keys(found), ["place:picnic", "place:kitchen"]);
  const life = lived();
  life.body.surface.solid = 0;
  moments.watch(life, 0.1, found);
  moments.arrived("lab", "Lab bench", found);
  life.body.surface.solid = 1;
  moments.watch(life, 0.1, found);
  assert.ok(!found.some((m) => m.kind === "climb"));
});

test("a journal's firsts are not had again", () => {
  const moments = new Moments(["meal:sugar", "sleep", "place:picnic"]);
  const found: Moment[] = [];
  moments.arrived("picnic", "Picnic table", found);
  const life = lived();
  moments.watch(life, 0.1, found);
  life.activity = "sleeping";
  life.meals = 1;
  life.senses.tasting.food = { name: "Sugar" };
  moments.watch(life, 0.1, found);
  assert.deepEqual(found, []);
});

const jpeg = (chars: number) => `data:image/jpeg;base64,${"A".repeat(Math.max(0, chars - 23))}`;
const first = (key: string, at: number, chars = 100): Adding => ({ kind: key.split(":")[0] as Adding["kind"], key, label: "", at, place: "picnic", picture: chars ? { url: jpeg(chars), w: 192, h: 108 } : null });
const photo = (at: number, chars = 100): Adding => ({ kind: "photo", key: "", label: "", at, place: "picnic", picture: { url: jpeg(chars), w: 256, h: 144 } });

test("the journal keeps entries and pictures across opening, oldest first", async () => {
  const map = new Map<string, string>();
  const journal = await Journal.open(memoryShelf(map), "fly", SMALL.budget);
  await journal.add(photo(2000));
  await journal.add(first("meal:sugar", 1000));
  assert.equal(await journal.add(first("meal:sugar", 3000)), null, "a first only once");
  const again = await Journal.open(memoryShelf(map), "fly", SMALL.budget);
  assert.deepEqual(again.entries.map((e) => e.key), ["meal:sugar", ""]);
  assert.equal(await again.picture(again.entries[0]), jpeg(100));
  assert.ok(again.has("meal:sugar"));
  // Another fly's journal is its own.
  const other = await Journal.open(memoryShelf(map), "another", SMALL.budget);
  assert.equal(other.entries.length, 0);
  assert.ok(map.has(journalKey("fly")));
});

test("out of room, the player's photos go first, oldest first; a first loses only its picture, and only with no photo left", () => {
  const budget = { chars: 1000, pictures: 4 };
  const entries: Entry[] = [
    readEntry({ id: "a", kind: "meal", key: "meal:sugar", label: "", at: 1, place: "", w: 1, h: 1, size: 300 })!,
    readEntry({ id: "b", kind: "photo", key: "", label: "", at: 2, place: "", w: 1, h: 1, size: 300 })!,
    readEntry({ id: "c", kind: "photo", key: "", label: "", at: 3, place: "", w: 1, h: 1, size: 300 })!,
    readEntry({ id: "d", kind: "sleep", key: "sleep", label: "", at: 4, place: "", w: 1, h: 1, size: 300 })!,
  ];
  assert.deepEqual(evictions(entries, budget), { photos: [entries[1]], bare: [] });
  assert.deepEqual(evictions(entries, { chars: 500, pictures: 4 }), { photos: [entries[1], entries[2]], bare: [entries[0]] });
  assert.deepEqual(evictions(entries, { chars: 10_000, pictures: 3 }), { photos: [entries[1]], bare: [] });
});

test("adding past the budget: photos are dropped whole, firsts are kept bare, and a photo there is no room for isn't kept", async () => {
  const map = new Map<string, string>();
  const journal = await Journal.open(memoryShelf(map), "fly", { chars: 250, pictures: 10 });
  await journal.add(photo(1));
  await journal.add(photo(2));
  await journal.add(first("groom", 3));
  assert.deepEqual(journal.entries.map((e) => e.kind), ["photo", "groom"], "the oldest photo went");
  await journal.add(first("sleep", 4));
  assert.deepEqual(journal.entries.map((e) => `${e.kind}${e.size ? "+" : ""}`), ["groom+", "sleep+"], "then the other photo");
  await journal.add(first("flight", 5));
  assert.deepEqual(journal.entries.map((e) => `${e.kind}${e.size ? "+" : ""}`), ["groom", "sleep+", "flight+"], "then the oldest first's picture, not the first");
  assert.equal(await journal.add(photo(6)), null, "no room for a photo among firsts");
  assert.ok(![...map.keys()].some((k) => k.endsWith(`/${journal.entries[0].id}`)), "the bare first's picture is gone from the shelf");
});

/** A shelf that is full past `room` characters, as a real one is. */
function fullShelf(room: number): Shelf & { map: Map<string, string> } {
  const map = new Map<string, string>();
  const shelf = memoryShelf(map);
  const used = () => [...map.values()].reduce((sum, v) => sum + v.length, 0);
  return { ...shelf, map, set: async (key, value) => {
    if (used() - (map.get(key)?.length ?? 0) + value.length > room) throw new DOMException("full", "QuotaExceededError");
    map.set(key, value);
  } };
}

test("a shelf full of everything else: photos make room, and a first is kept without its picture rather than lost", async () => {
  const shelf = fullShelf(2500);
  const journal = await Journal.open(shelf, "fly", LARGE.budget);
  for (let i = 0; i < 3; i++) await journal.add(photo(i, 600));
  assert.equal(journal.entries.length, 3);
  const meal = await journal.add(first("meal:honey", 10, 1200));
  assert.ok(meal && meal.size > 0, "it fits once photos make room");
  assert.ok(journal.entries.filter((e) => e.kind === "photo").length < 3, "a photo went for it");
  const big = await journal.add(first("flight", 11, 5000));
  assert.ok(big, "kept");
  assert.equal(big.size, 0, "without a picture it had no room for");
  const again = await Journal.open(shelf, "fly", LARGE.budget);
  assert.ok(again.has("flight") && again.has("meal:honey"));
});

test("a broken save: an unreadable index starts afresh, broken entries are left out, and pictures nothing refers to are cleared", async () => {
  const map = new Map<string, string>();
  const key = journalKey("fly");
  map.set(key, "{not json");
  map.set(`${key}/zzz`, jpeg(50));
  const fresh = await Journal.open(memoryShelf(map), "fly", SMALL.budget);
  assert.equal(fresh.entries.length, 0);
  assert.ok(!map.has(`${key}/zzz`), "the orphan picture is cleared");

  map.set(key, JSON.stringify([
    { id: "ok1", kind: "meal", key: "meal:jam", label: "jam", at: 5, place: "kitchen", w: 192, h: 108, size: 60 },
    { id: "ok1", kind: "sleep", key: "sleep", label: "", at: 6, place: "", w: 0, h: 0, size: 0 },
    { id: "BAD!", kind: "sleep", key: "sleep", label: "", at: 6, place: "", w: 0, h: 0, size: 0 },
    { id: "p1", kind: "photo", key: "", label: "", at: 7, place: "", w: 0, h: 0, size: 0 },
    { id: "x1", kind: "dance", key: "dance", label: "", at: 8, place: "", w: 0, h: 0, size: 0 },
    { id: "m2", kind: "meal", key: "meal:jam", label: "", at: 9, place: "", w: 0, h: 0, size: 0 },
    "nonsense",
    { id: "ok2", kind: "photo", key: "", label: "", at: 10, place: "lab", w: 256, h: 144, size: 60 },
  ]));
  map.set(`${key}/ok1`, "data:text/html;base64,PHNjcmlwdD4=");
  map.set(`${key}/ok2`, jpeg(60));
  const journal = await Journal.open(memoryShelf(map), "fly", SMALL.budget);
  assert.deepEqual(journal.entries.map((e) => e.id), ["ok1", "ok2"]);
  // A picture that isn't a JPEG is let go, and its first kept without it.
  assert.equal(await journal.picture(journal.entries[0]), null);
  assert.equal(journal.entries[0].size, 0);
  assert.ok(!map.has(`${key}/ok1`));
  assert.equal(await journal.picture(journal.entries[1]), jpeg(60));
  // A photo whose picture has gone is gone.
  map.delete(`${key}/ok2`);
  assert.equal(await journal.picture(journal.entries[1]), null);
  assert.deepEqual(journal.entries.map((e) => e.id), ["ok1"]);
});

test("a build with less room brings a save from one with more within its budget", async () => {
  const map = new Map<string, string>();
  const big = await Journal.open(memoryShelf(map), "fly", LARGE.budget);
  for (let i = 0; i < 30; i++) await big.add(photo(i, 100));
  await big.add(first("sleep", 100, 100));
  const small = await Journal.open(memoryShelf(map), "fly", SMALL.budget);
  assert.equal(small.entries.filter((e) => e.size).length, SMALL.budget.pictures);
  assert.ok(small.has("sleep") && small.entries.find((e) => e.key === "sleep")!.size > 0, "the first keeps its picture");
  assert.equal(small.entries.at(-2)!.at, 29, "the newest photos stay");
});

test("removing: the player's photo goes, a first stays", async () => {
  const journal = await Journal.open(memoryShelf(), "fly", SMALL.budget);
  const p = (await journal.add(photo(1)))!;
  const f = (await journal.add(first("escape", 2)))!;
  await journal.remove(p);
  await journal.remove(f);
  assert.deepEqual(journal.entries.map((e) => e.key), ["escape"]);
});

test("pictures take the screen's shape, at the host's size", () => {
  assert.deepEqual(pictureSize(16 / 9, SMALL.auto), { w: 192, h: 108 });
  assert.deepEqual(pictureSize(376 / 816, LARGE.auto), { w: 147, h: 320 });
  assert.deepEqual(pictureSize(1, 256), { w: 256, h: 256 });
  // Past the frame's own range of shapes, as stretched as the frame is.
  assert.deepEqual(pictureSize(10, 320), { w: 320, h: 80 });
});

const yes = () => true;
const no = () => false;

test("the player's photo is taken from the next frame, whatever it shows; a first's only from one that shows the fly, or kept bare in time", async () => {
  const photos = new Photos(Promise.resolve({ shelf: memoryShelf(), keeping: SMALL }), "fly");
  assert.equal(photos.snap(), false, "not before the journal is open");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(photos.journal);
  assert.equal(photos.wants(0, no), null);
  assert.ok(photos.snap());
  assert.equal(photos.wants(0, no), "own");
  photos.arrived("picnic", "Picnic table", 0);
  assert.equal(photos.wants(1, yes), "own", "the player's photo first");
  // Arriving, its picture waits for the place to be seen.
  const fresh = new Photos(Promise.resolve({ shelf: memoryShelf(), keeping: SMALL }), "fly");
  await new Promise((resolve) => setTimeout(resolve, 0));
  fresh.arrived("picnic", "Picnic table", 0);
  assert.equal(fresh.wants(1, yes), null);
  assert.equal(fresh.wants(4, no), null, "not with the fly out of the picture");
  assert.equal(fresh.wants(4, yes), "moment");
  // Never framed: kept without a picture.
  fresh.wants(1000, no);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(fresh.journal!.entries.map((e) => [e.key, e.size]), [["place:picnic", 0]]);
});

function shell(frame: Frame, journal: Journal | null, glyphs: Shell["glyphs"] = "remote"): Shell & { backs: number } {
  const s = { backs: 0, shape: frame, glyphs, journal, canSavePictures: true, settings: { ...DEFAULT_SETTINGS }, savePicture: async () => "saved" as const, back() { s.backs++; } };
  return s as unknown as Shell & { backs: number };
}

const FRAMES: [string, Frame][] = [
  ["the TV", TV_FRAME],
  ["a laptop", frameFor(1440, 900)],
  ["a phone upright", frameFor(390, 844, { top: 47, right: 0, bottom: 34, left: 0 }, true)],
  ["a phone on its side", frameFor(844, 390, { top: 0, right: 47, bottom: 21, left: 47 }, true)],
];

for (const [name, frame] of FRAMES) {
  test(`the journal's grid on ${name}: at least two across, whole rows, every picture inside the pane`, async () => {
    const pane = fitPane(frame, 720, 420, 8);
    const grid = journalGrid(pane);
    assert.ok(grid.columns >= 2 && grid.rows >= 1);
    assert.ok(grid.x >= pane.x && grid.x + grid.w <= pane.x + pane.w + 0.5);
    assert.ok(grid.y + grid.rows * grid.rowH - grid.gap <= pane.y + pane.h, "the last row shown fits");
    const journal = await Journal.open(memoryShelf(), "fly", LARGE.budget);
    for (let i = 0; i < 25; i++) await journal.add(photo(i));
    await journal.add(first("meal:strawberry juice", 30));
    const screen = new JournalScreen(shell(frame, journal));
    screen.enter();
    screen.update(0);
    const hits = new HitMap();
    screen.draw(blankCanvas(), 0, hits);
    let cells = 0;
    for (let i = 0; i < hits.count; i++) {
      const h = hits.get(i)!;
      if (h.kind !== "cell") continue;
      cells++;
      assert.ok(h.x >= pane.x && h.y >= pane.y && h.x + h.w <= pane.x + pane.w + 0.5 && h.y + h.h <= pane.y + pane.h + 0.5, `cell ${h.index} inside the pane`);
    }
    assert.equal(cells, Math.min(26, grid.columns * grid.rows));
  });
}

test("the journal with the remote: newest first, the arrows go along and down the grid, Select opens one, Left and Right go through them, Back closes it and then leaves", async () => {
  const journal = await Journal.open(memoryShelf(), "fly", LARGE.budget);
  for (let i = 0; i < 12; i++) await journal.add(photo(i));
  const s = shell(TV_FRAME, journal);
  const screen = new JournalScreen(s);
  const data: Record<string, string> = {};
  screen.enter();
  screen.update(0);
  const { columns } = journalGrid(fitPane(TV_FRAME, 720, 420, 8));
  screen.press("right", false);
  screen.press("down", false);
  screen.publish(data);
  assert.equal(data.journalFocus, String(1 + columns));
  screen.press("select", false);
  screen.publish(data);
  assert.equal(data.journalOpen, "photo");
  screen.press("right", false);
  screen.publish(data);
  assert.equal(data.journalFocus, String(2 + columns));
  // Down to its buttons: Remove takes it out.
  screen.press("down", false);
  screen.press("right", false);
  screen.press("select", false);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(journal.entries.length, 11);
  screen.press("back", false);
  screen.publish(data);
  assert.equal(data.journalOpen, "");
  assert.equal(s.backs, 0);
  screen.press("back", false);
  assert.equal(s.backs, 1);
});

test("captions: a date in a few characters, and at most two words", () => {
  const now = new Date(2026, 10, 17, 12).getTime();
  assert.equal(shortDate(new Date(2026, 10, 3, 9).getTime(), now), "3 Nov");
  assert.equal(shortDate(new Date(2025, 0, 30).getTime(), now), "30 Jan 2025");
  assert.equal(twoWords("strawberry juice"), "strawberry juice");
  assert.equal(twoWords("  a very long name "), "a very");
});
