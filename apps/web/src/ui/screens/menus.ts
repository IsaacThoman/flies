// The title, the pause menu and the settings.

import { Menu, choiceValue, indexOf } from "@fly/ui";
import type { ChoiceItem, MenuItem, Option, SliderItem } from "@fly/ui";
import { INK_SOFT, glassPanel, orb, text } from "@fly/ui";
import { DESIGN_WIDTH } from "../../display.ts";
import type { PixelSize } from "../../display.ts";
import type { EyesDetail, EyesInsetMode, Settings } from "../../settings.ts";
import { drawWordmark } from "../wordmark.ts";
import { MenuScreen } from "./menu-screen.ts";
import type { Shell } from "./types.ts";

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
const WALLPAPER: Option<number>[] = [
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
const INSET: Option<EyesInsetMode>[] = [
  { value: "off", label: "Off" },
  { value: "wallpaper", label: "In the wallpaper" },
  { value: "always", label: "Always" },
];
const ON_OFF: Option<boolean>[] = [
  { value: false, label: "Off" },
  { value: true, label: "On" },
];

export function settingsScreen(shell: Shell) {
  const s = shell.settings;
  const choice = <V>(id: string, label: string, options: Option<V>[], value: V): ChoiceItem<V> => ({ kind: "choice", id, label, options, index: indexOf(options, value) });
  const items: MenuItem[] = [
    { kind: "slider", id: "effects", label: "Sounds", min: 0, max: 10, step: 1, value: s.effects },
    { kind: "slider", id: "ambience", label: "Outdoors", min: 0, max: 10, step: 1, value: s.ambience },
    choice("pixels", "Pixels", PIXELS, s.pixels) as ChoiceItem,
    choice("wallpaperAfter", "Wallpaper after", WALLPAPER, s.wallpaperAfter) as ChoiceItem,
    choice("wallpaperCamera", "Wallpaper camera", CAMERA, s.wallpaperCamera) as ChoiceItem,
    choice("eyes", "The fly's eyes", EYES, s.eyes) as ChoiceItem,
    choice("eyesInset", "What it sees", INSET, s.eyesInset) as ChoiceItem,
    choice("hints", "Button hints", ON_OFF, s.hints) as ChoiceItem,
    choice("stats", "Frame stats", ON_OFF, s.stats) as ChoiceItem,
    { kind: "action", id: "done", label: "Done" },
  ];
  const menu = new Menu(items, { rows: 6 });
  return new MenuScreen(shell, {
    id: "settings",
    pauses: true,
    menu,
    heading: "Settings",
    row: 36,
    panel: { x: (DESIGN_WIDTH - 540) / 2, y: 40, w: 540, h: 372 },
    onActivate(item) {
      if (item.id === "done") shell.back();
    },
    onChange(item) {
      const settings = shell.settings as Record<string, unknown>;
      settings[item.id] = item.kind === "slider" ? (item as SliderItem).value : choiceValue(item as ChoiceItem);
      shell.applySettings();
    },
    onBack: () => shell.back(),
  });
}
