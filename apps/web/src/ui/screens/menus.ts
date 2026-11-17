// The menu and the settings: the whole of it.
//
//   menu ─┬─ Play
//         ├─ Watch
//         ├─ Settings: Screensaver (and how many flies) | On screen | Picture, as tabs
//         ├─ Online (where it can be): rooms with others (online.ts)
//         └─ About
//
// The menu is the title, at launch and from play alike (Back, Play/Pause or
// the menu button), with the fly living on behind it; Back there carries on
// playing (on the Apple TV it leaves the app, as the root of an app must).

import { Menu, choiceValue, indexOf } from "@fly/ui";
import type { ChoiceItem, MenuItem, Option } from "@fly/ui";
import type { PixelSize } from "../../display.ts";
import { PLACES } from "../../places/catalog.ts";
import { WALLPAPER_DELAYS } from "../../settings.ts";
import type { EyesDetail, OverlayOpacity, OverlaySize, Settings, ShowWhen, StatsKind } from "../../settings.ts";
import { fitMenu, menuSpace, titleLayout } from "../layout.ts";
import { drawWordmark } from "../wordmark.ts";
import { MenuScreen } from "./menu-screen.ts";
import type { SettingsPage, Shell } from "./types.ts";

export function titleScreen(shell: Shell) {
  const menu = new Menu([
    { kind: "action", id: "play", label: "Play" },
    { kind: "action", id: "watch", label: "Watch" },
    { kind: "action", id: "settings", label: "Settings" },
    // With others, where there is a way to reach them.
    ...(shell.canPlayOnline ? [{ kind: "action" as const, id: "online", label: "Online" }] : []),
    { kind: "action", id: "about", label: "About" },
  ], { wrap: true });
  // Laid out with the menu, for the backdrop to draw from.
  let title = titleLayout(shell.shape, menu.items.length);
  return new MenuScreen(shell, {
    id: "title",
    menu,
    root: true,
    place: (frame) => (title = titleLayout(frame, menu.items.length)).menu,
    onActivate(item) {
      if (item.id === "play") shell.play();
      else if (item.id === "watch") shell.watch();
      else shell.open(item.id as "about" | "settings" | "online");
    },
    // The world behind the menu is the game: tapping it plays.
    onOutside: () => shell.play(),
    onBack: () => shell.back(),
    backdrop(g) {
      const { wordmark } = title;
      drawWordmark(g, wordmark.x, wordmark.y, wordmark.size);
    },
  });
}

const PIXELS: Option<PixelSize>[] = [
  { value: "classic", label: "Classic" },
  { value: "chunky", label: "Chunky" },
  { value: "chunkier", label: "Chunkier" },
];
const CAMERA: Option<Settings["wallpaperCamera"]>[] = [
  { value: "follow", label: "Follow" },
  { value: "calm", label: "Calm" },
  { value: "lively", label: "Lively" },
  { value: "whole", label: "Whole place" },
];
const PACE: Option<Settings["pace"]>[] = [
  { value: "lively", label: "Lively" },
  { value: "natural", label: "Natural" },
];
const EYES: Option<EyesDetail>[] = [
  { value: "off", label: "Off" },
  { value: "low", label: "Low" },
  { value: "high", label: "High" },
];
/** For each picture that can show over the world in a corner. */
const SHOWN: Option<ShowWhen>[] = [
  { value: "off", label: "Off" },
  { value: "wallpaper", label: "Screensaver" },
  { value: "always", label: "Always" },
];
const STATS: Option<StatsKind>[] = [
  { value: "brain", label: "Its brain" },
  { value: "day", label: "Its day" },
  { value: "both", label: "Brain + day" },
  { value: "signals", label: "In and out" },
];
const SIZE: Option<OverlaySize>[] = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];
const OPACITY: Option<OverlayOpacity>[] = [
  { value: "full", label: "Solid" },
  { value: "soft", label: "Soft" },
  { value: "faint", label: "Faint" },
];
const PLACE: Option<Settings["place"]>[] = [{ value: "turns", label: "Each in turn" }, ...PLACES.map((p) => ({ value: p.id, label: p.name }))];
const flyCounts = (most: number): Option<number>[] => Array.from({ length: most }, (_, i) => ({ value: i + 1, label: String(i + 1) }));
const ON_OFF: Option<boolean>[] = [
  { value: false, label: "Off" },
  { value: true, label: "On" },
];

const choice = <K extends keyof Settings>(id: K, label: string, options: Option<Settings[K]>[]): ChoiceItem<Settings[K]> => ({ kind: "choice", id, label, options, index: 0 });

/**
 * The settings, a page for each part of the game, every one a step from the
 * top and short enough not to scroll. Each row is a setting, by its key.
 */
const PAGES: Record<SettingsPage, { heading: string; rows: (shell: Shell) => MenuItem[] }> = {
  wallpaper: {
    heading: "Screensaver",
    rows: (shell) => [
      choice("wallpaperAfter", "Starts after", WALLPAPER_DELAYS),
      choice("wallpaperCamera", "Camera", CAMERA),
      // Only when there is somewhere else to live.
      ...(PLACES.length > 1 ? [choice("place", "Where it lives", PLACE)] : []),
      // How many flies live here; only where this device can run more than one brain.
      ...(shell.maxFlies > 1 ? [choice("flies", "Flies", flyCounts(shell.maxFlies))] : []),
      // With everyone, in a room open to all, once awake: only where the device can be online.
      ...(shell.canPlayOnline ? [choice("joinOthers", "Join others", ON_OFF)] : []),
      // Whether the sky follows the weather outside, only where the Apple TV can tell it.
      ...(shell.weatherOutside ? [choice("realWeather", "Real weather", ON_OFF)] : []),
      // How its day goes: livelier than a fly's, or as a fly's.
      choice("pace", "Activity", PACE),
    ],
  },
  // Everything that can show over the world: each picture in a corner, the stats and the fly seen through, each off, in the screensaver, or always; then how the corners' pictures look.
  screen: {
    heading: "On screen",
    rows: () => [
      choice("eyesInset", "Fly POV", SHOWN),
      choice("nerves", "Nervous system", SHOWN),
      choice("statsPanel", "Stats", SHOWN),
      choice("statsKind", "Stats content", STATS),
      choice("overlaySize", "Overlay size", SIZE),
      choice("overlayOpacity", "Overlay opacity", OPACITY),
      choice("xray", "X-ray", SHOWN),
    ],
  },
  picture: {
    heading: "Picture",
    rows: () => [choice("pixels", "Pixels", PIXELS), choice("eyes", "Vision detail", EYES), choice("hints", "Hints", ON_OFF), choice("rumble", "Rumble", ON_OFF), choice("stats", "Frame stats", ON_OFF)],

  },
};

/** The settings: a row of tabs, one for each part of the game, over that part's settings, each a setting by its key. */
export function settingsScreen(shell: Shell) {
  const settings = shell.settings as Record<string, unknown>;
  const ids = Object.keys(PAGES) as SettingsPage[];
  const pages = {} as Record<SettingsPage, MenuItem[]>;
  for (const id of ids) pages[id] = PAGES[id].rows(shell);
  const tabs: ChoiceItem<SettingsPage> = { kind: "choice", id: "page", label: "", options: ids.map((id) => ({ value: id, label: PAGES[id].heading })), index: 0, tabs: true };
  const menu = new Menu([tabs, ...pages[ids[0]]], { wrap: true });
  // Room for the longest page, so the pane keeps its size from tab to tab.
  const most = 1 + Math.max(...ids.map((id) => pages[id].length));
  // As they are now: the Place tool, or a script, may have changed them since.
  const show = () => {
    for (const item of menu.items) {
      if (item === tabs) continue;
      if (item.kind === "choice") item.index = indexOf(item.options, settings[item.id]);
      else if (item.kind === "slider") item.value = settings[item.id] as number;
    }
  };
  return new MenuScreen(shell, {
    id: "settings",
    heading: "Settings",
    trimEmpty: true,
    menu,
    place: (frame) => fitMenu(menuSpace(frame), { items: most, width: 540, row: frame.design.height >= 440 ? 44 : 36, heading: true, foot: 28, values: true, raise: 14 }),
    onEnter: show,
    onChange(item) {
      if (item === tabs) {
        menu.replaceFrom(1, pages[choiceValue(tabs)]);
        show();
        return;
      }
      settings[item.id] = item.kind === "slider" ? item.value : choiceValue(item);
      shell.applySettings();
    },
    onBack: () => shell.back(),
  });
}

/** The settings tab shown. */
export const settingsTab = (screen: MenuScreen) => {
  const tabs = screen.menu.items[0];
  return tabs.kind === "choice" ? String(choiceValue(tabs)) : "";
};
