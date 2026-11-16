// The title, the pause menu and the settings.

import { Menu, choiceValue, indexOf } from "@fly/ui";
import type { ChoiceItem, MenuItem, Option, SliderItem } from "@fly/ui";
import { INK_SOFT, glassPanel, orb, text } from "@fly/ui";
import { DESIGN_WIDTH } from "../../display.ts";
import type { PixelSize } from "../../display.ts";
import { PLACES } from "../../places/catalog.ts";
import type { EyesDetail, Settings, ShowWhen } from "../../settings.ts";
import { drawWordmark } from "../wordmark.ts";
import { MenuScreen } from "./menu-screen.ts";
import type { SettingsPage, Shell } from "./types.ts";

export function titleScreen(shell: Shell) {
  const menu = new Menu([
    { kind: "action", id: "play", label: "Visit the fly" },
    { kind: "action", id: "watch", label: "Just watch" },
    { kind: "action", id: "brain", label: "Inside its brain" },
    { kind: "action", id: "about", label: "About the fly" },
    { kind: "action", id: "settings", label: "Settings" },
  ]);
  return new MenuScreen(shell, {
    id: "title",
    pauses: false,
    menu,
    panel: { x: DESIGN_WIDTH - 360, y: 112, w: 320, h: 300 },
    onActivate(item) {
      if (item.id === "play") shell.play();
      else if (item.id === "watch") shell.watch();
      else shell.open(item.id as "brain" | "about" | "settings");
    },
    onBack: () => shell.back(),
    backdrop(g, t) {
      drawWordmark(g, 250, 100, 60, t);
      // How the brain is doing, quietly, under the name.
      const brain = shell.brain;
      const awake = brain.status === "running";
      const label = awake ? `Brain awake · ${brain.neurons.toLocaleString("en-US")} neurons` : brain.status === "failed" ? "Its brain couldn't wake" : "Its brain is waking…";
      glassPanel(g, 72, 128, 356, 34, 17, { alpha: 0.85, shadow: false });
      orb(g, 92, 145, 8, awake ? "green" : brain.status === "failed" ? "pink" : "orange");
      text(g, label, 108, 146, { size: 15, color: INK_SOFT, baseline: "middle" });
    },
  });
}

export function pauseScreen(shell: Shell) {
  const menu = new Menu([
    { kind: "action", id: "resume", label: "Carry on" },
    { kind: "action", id: "brain", label: "Inside its brain" },
    { kind: "action", id: "about", label: "About the fly" },
    { kind: "action", id: "settings", label: "Settings" },
    { kind: "action", id: "title", label: "Back to the title" },
  ]);
  return new MenuScreen(shell, {
    id: "pause",
    pauses: true,
    menu,
    heading: "Paused",
    panel: { x: (DESIGN_WIDTH - 340) / 2, y: 52, w: 340, h: 352 },
    onActivate(item) {
      if (item.id === "resume") shell.play();
      else if (item.id === "title") shell.title();
      else shell.open(item.id as "brain" | "about" | "settings");
    },
    onBack: () => shell.back(),
  });
}

const PIXELS: Option<PixelSize>[] = [
  { value: "classic", label: "Classic" },
  { value: "chunky", label: "Chunky" },
  { value: "chunkier", label: "Chunkier" },
];
const STARTS_AFTER: Option<number>[] = [
  { value: 30, label: "30 s" },
  { value: 60, label: "1 min" },
  { value: 120, label: "2 min" },
  { value: 300, label: "5 min" },
  { value: 0, label: "Never" },
];
const CAMERA: Option<Settings["wallpaperCamera"]>[] = [
  { value: "follow", label: "Follow" },
  { value: "calm", label: "Calm" },
  { value: "lively", label: "Lively" },
];
const EYES: Option<EyesDetail>[] = [
  { value: "off", label: "Off" },
  { value: "low", label: "Low" },
  { value: "high", label: "High" },
];
/** For each picture that can show over the world in a corner. */
const SHOWN: Option<ShowWhen>[] = [
  { value: "off", label: "Off" },
  { value: "wallpaper", label: "In the wallpaper" },
  { value: "always", label: "Always" },
];
const PLACE: Option<Settings["place"]>[] = [{ value: "turns", label: "Each in turn" }, ...PLACES.map((p) => ({ value: p.id, label: p.name }))];
const ON_OFF: Option<boolean>[] = [
  { value: false, label: "Off" },
  { value: true, label: "On" },
];

const choice = <K extends keyof Settings>(id: K, label: string, options: Option<Settings[K]>[]): ChoiceItem<Settings[K]> => ({ kind: "choice", id, label, options, index: 0 });
const volume = (id: "effects" | "ambience", label: string): SliderItem => ({ kind: "slider", id, label, min: 0, max: 10, step: 1, value: 0 });

/**
 * The settings, a page for each part of the game, every one a step from the
 * top and short enough not to scroll. Each row is a setting, by its key.
 */
const PAGES: Record<SettingsPage, { heading: string; rows: () => MenuItem[] }> = {
  wallpaper: {
    heading: "Wallpaper",
    rows: () => [
      choice("wallpaperAfter", "Starts after", STARTS_AFTER),
      choice("wallpaperCamera", "Camera", CAMERA),
      // Only when there is somewhere else to live.
      ...(PLACES.length > 1 ? [choice("place", "Where it lives", PLACE)] : []),
      // Then the pictures that can show in a corner, each off, in the wallpaper, or always.
      choice("eyesInset", "What it sees", SHOWN),
    ],
  },
  sound: {
    heading: "Sound",
    rows: () => [volume("effects", "Effects"), volume("ambience", "Surroundings")],
  },
  picture: {
    heading: "Picture",
    rows: () => [choice("pixels", "Pixels", PIXELS), choice("eyes", "The fly's eyes", EYES), choice("hints", "Button hints", ON_OFF), choice("stats", "Frame stats", ON_OFF)],
  },
};

/** A pane for `rows` rows `row` tall under a heading, centred over the menu hints. */
function pane(width: number, rows: number, row: number) {
  const h = 70 + rows * (row + 12) - 12 + 28;
  return { x: (DESIGN_WIDTH - width) / 2, y: Math.round(226 - h / 2), w: width, h };
}

/** The top of the settings: a button for each page. */
export function settingsScreen(shell: Shell) {
  const items: MenuItem[] = (Object.keys(PAGES) as SettingsPage[]).map((id) => ({ kind: "action", id, label: PAGES[id].heading }));
  return new MenuScreen(shell, {
    id: "settings",
    pauses: true,
    menu: new Menu(items),
    heading: "Settings",
    panel: pane(340, items.length, 40),
    onActivate: (item) => shell.open(item.id as SettingsPage),
    onBack: () => shell.back(),
  });
}

/** Every page of the settings, by id. */
export function settingsPages(shell: Shell) {
  const settings = shell.settings as Record<string, unknown>;
  const pages = {} as Record<SettingsPage, MenuScreen>;
  for (const id of Object.keys(PAGES) as SettingsPage[]) {
    const items = PAGES[id].rows();
    pages[id] = new MenuScreen(shell, {
      id,
      pauses: true,
      menu: new Menu(items),
      heading: PAGES[id].heading,
      row: 36,
      panel: pane(540, items.length, 36),
      // As they are now: the Place tool, or a script, may have changed them since.
      onEnter() {
        for (const item of items) {
          if (item.kind === "choice") item.index = indexOf(item.options, settings[item.id]);
          else if (item.kind === "slider") item.value = settings[item.id] as number;
        }
      },
      onChange(item) {
        settings[item.id] = item.kind === "slider" ? item.value : choiceValue(item);
        shell.applySettings();
      },
      onBack: () => shell.back(),
    });
  }
  return pages;
}
