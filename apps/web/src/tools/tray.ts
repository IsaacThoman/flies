// The tray: everything the hand can take up, kept out of sight until it is
// asked for (Play/Pause, a pad's Y, Tab, or the button at the foot of the
// screen). It is a ring of things round the middle of the screen, two deep at
// most: the empty hand, the fingertip and the camera are taken straight from
// the first ring; food, the kit, the toys, the views and the world each open
// a ring of their own. This is the logic only (what is in it and what taking
// each does); ui/tray.ts draws it and game.ts acts on what is taken.

import { PIECE_KINDS } from "@fly/world";
import { TOOLS, kindsOf, toolIndex } from "./hands.ts";
import type { Dial, Hands, ToolId } from "./hands.ts";

export type TrayPage = "root" | "food" | "build" | "toys" | "look" | "world" | "time" | "weather" | "place";

/** What taking a thing from the tray does. */
export type TrayAction =
  /** It goes into the hand: a tool, on one of its kinds. */
  | { kind: "take"; tool: ToolId; variant: number }
  /** Another ring of things opens. */
  | { kind: "page"; page: TrayPage }
  /** A kind is chosen on a tool's dial without taking it up: a view, the time of day, the weather. */
  | { kind: "choose"; tool: ToolId; dial: Dial; variant: number }
  /** The fly is carried to a place. */
  | { kind: "go"; variant: number }
  /** What was dropped, or what was built, is cleared away. */
  | { kind: "clear"; what: "food" | "built" };

export type TrayItem = { id: string; label: string; action: TrayAction };

const take = (tool: ToolId, variant = 0): TrayAction => ({ kind: "take", tool, variant });
const page = (p: TrayPage): TrayAction => ({ kind: "page", page: p });
const tool = (id: ToolId) => TOOLS[toolIndex(id)];
const variantOf = (id: ToolId, kind: string) => tool(id).variants.findIndex((v) => v.id === kind);

/** The rings, each in order round from the top, clockwise. */
function build(): Record<TrayPage, readonly TrayItem[]> {
  const hasPlace = toolIndex("place") >= 0;
  const foods = tool("feed").variants.filter((v) => v.id !== "clear");
  const pieces = tool("build").variants.filter((v) => (PIECE_KINDS as readonly string[]).includes(v.id));
  const dial = (id: ToolId, d: Dial): TrayItem[] => kindsOf(tool(id), d).map((v, i) => ({ id: v.id, label: v.label, action: { kind: "choose", tool: id, dial: d, variant: i } }));
  return {
    root: [
      { id: "hand", label: "Hand", action: take("hand") },
      { id: "food", label: "Food", action: page("food") },
      { id: "build", label: "Build", action: page("build") },
      { id: "toys", label: "Toys", action: page("toys") },
      { id: "finger", label: "Finger", action: take("finger") },
      { id: "photo", label: "Photo", action: take("photo") },
      { id: "look", label: "Look", action: page("look") },
      { id: "world", label: "World", action: page("world") },
    ],
    food: foods.map((v) => ({ id: v.id, label: v.label, action: take("feed", variantOf("feed", v.id)) })),
    build: pieces.map((v) => ({ id: v.id, label: v.label, action: take("build", variantOf("build", v.id)) })),
    toys: [
      { id: "feather", label: "Feather", action: take("feather") },
      { id: "gentle", label: "Breath", action: take("blow", variantOf("blow", "gentle")) },
      { id: "strong", label: "Puff", action: take("blow", variantOf("blow", "strong")) },
      { id: "ball", label: "Ball", action: take("swoop") },
    ],
    look: dial("view", 0),
    world: [
      { id: "time", label: "Time", action: page("time") },
      { id: "weather", label: "Weather", action: page("weather") },
      ...(hasPlace ? [{ id: "place", label: "Place", action: page("place") }] : []),
      { id: "clearFood", label: "Clear food", action: { kind: "clear", what: "food" } },
      { id: "clearBuilt", label: "Clear built", action: { kind: "clear", what: "built" } },
    ],
    time: dial("sky", 0),
    weather: dial("sky", 1),
    place: hasPlace ? tool("place").variants.map((v, i) => ({ id: v.id, label: v.label, action: { kind: "go", variant: i } })) : [],
  };
}

export const TRAY: Readonly<Record<TrayPage, readonly TrayItem[]>> = build();

/** The ring each ring goes back to. */
const PARENT: Record<TrayPage, TrayPage | null> = { root: null, food: "root", build: "root", toys: "root", look: "root", world: "root", time: "world", weather: "world", place: "world" };

/** Which ring of the first a tool lives in: the hand's place is found there when the tray opens. */
const HOME: Partial<Record<ToolId, string>> = { hand: "hand", feed: "food", build: "build", feather: "toys", blow: "toys", swoop: "toys", finger: "finger", photo: "photo", view: "look", sky: "world", place: "world" };

export class Tray {
  open = false;
  page: TrayPage = "root";
  /** The slot the remote, the keys or a pad are on (and a mouse over). */
  focus = 0;
  /** Counts every change to what it shows, for the screen to draw it again. */
  changes = 0;
  /** Seconds since it last opened or changed ring, for the ring's little bloom. */
  since = 9;

  get items(): readonly TrayItem[] {
    return TRAY[this.page];
  }

  get focused(): TrayItem | null {
    return this.items[this.focus] ?? null;
  }

  /** Opens on the first ring, on what is in hand. */
  show(hands: Hands) {
    this.open = true;
    this.page = "root";
    const home = HOME[hands.current.id] ?? "hand";
    this.focus = Math.max(0, TRAY.root.findIndex((it) => it.id === home));
    this.#changed();
  }

  hide() {
    if (!this.open) return;
    this.open = false;
    this.#changed();
  }

  /** Another ring, on what is chosen there now (in hand, or the kind its dial is on). */
  enter(p: TrayPage, hands: Hands) {
    this.page = p;
    this.focus = Math.max(0, this.items.findIndex((it) => isCurrent(it, hands)));
    this.#changed();
  }

  /** Back a ring; on the first, closed. Whether it is still open. */
  back(): boolean {
    const parent = PARENT[this.page];
    if (!parent) {
      this.hide();
      return false;
    }
    const from = this.page;
    this.page = parent;
    this.focus = Math.max(0, this.items.findIndex((it) => it.action.kind === "page" && it.action.page === from));
    this.#changed();
    return true;
  }

  /** Round the ring, clockwise (1) or back. */
  step(dir: -1 | 1) {
    const n = this.items.length;
    if (n === 0) return;
    this.focus = (this.focus + dir + n) % n;
    this.#changed();
  }

  /** Onto the slot nearest a direction (radians, clockwise from up). */
  aim(angle: number) {
    const n = this.items.length;
    if (n === 0) return;
    const turn = Math.PI * 2;
    const i = ((Math.round((((angle % turn) + turn) % turn) / (turn / n)) % n) + n) % n;
    if (i === this.focus) return;
    this.focus = i;
    this.#changed();
  }

  /** Onto a slot by its place in the ring. */
  point(i: number) {
    if (i === this.focus || i < 0 || i >= this.items.length) return;
    this.focus = i;
    this.#changed();
  }

  update(dt: number) {
    this.since += dt;
  }

  #changed() {
    this.changes++;
    this.since = 0;
  }
}

/** Whether a thing in the tray is what is in hand now, or the kind its dial is on: it is marked so. */
export function isCurrent(item: TrayItem, hands: Hands): boolean {
  const a = item.action;
  switch (a.kind) {
    case "take":
      return hands.current.id === a.tool && hands.variants[hands.tool] === a.variant;
    case "choose": {
      const i = toolIndex(a.tool);
      return (a.dial === 1 ? hands.seconds : hands.variants)[i] === a.variant;
    }
    case "go":
      return hands.variants[toolIndex("place")] === a.variant;
    case "page":
      return Object.entries(HOME).some(([id, home]) => home === item.id && id === hands.current.id);
    default:
      return false;
  }
}
