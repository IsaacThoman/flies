// Optional host projection: no DOM, draw calls, polling or simulation commands.
import type { MenuItem } from "@fly/ui";
import type { Game } from "../game.ts";
import { ABOUT } from "../ui/screens/about.ts";

export type AccessibleItem = {
  id: string;
  name: string;
  kind: MenuItem["kind"];
  disabled?: boolean;
  value?: string | number;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  secret?: boolean;
};
export type AccessibleScreen = { key: string; name: string; status: string; focus: string; items: AccessibleItem[]; body?: string };
export type AccessCommand = { id: string; action: "activate" | "focus" | "value" | "submit"; value?: string | number };

export function projectItem(item: MenuItem): AccessibleItem {
  const result: AccessibleItem = { id: item.id, name: item.label || "Settings page", kind: item.kind, disabled: item.disabled };
  if (item.kind === "action") {
    const details = [item.description, item.count ? `${item.count[0]} of ${item.count[1]} flies` : "", item.locked ? "Password required" : ""];
    result.name = [result.name, ...details].filter(Boolean).join(", ");
  } else if (item.kind === "choice") {
    result.options = item.options.map((o) => o.label);
    result.value = item.index;
  } else if (item.kind === "slider") Object.assign(result, { value: item.value, min: item.min, max: item.max, step: item.step });
  else { result.value = item.value; result.secret = item.secret; }
  return result;
}

export class MenuAccess {
  readonly game: Game;
  constructor(game: Game) { this.game = game; }

  read(): AccessibleScreen {
    const g = this.game;
    if (g.loading) return { key: "loading", name: "Flies", status: g.brain.status === "failed" ? "The brain could not wake. Try again." : "The brain is waking", focus: "retry", items: g.brain.status === "failed" ? [{ id: "retry", kind: "action", name: "Try again" }] : [] };
    const id = g.screen;
    const screen = id === "title" || id === "settings" || id === "online" ? g.screens[id] : null;
    const table = g.table;
    const rooms = g.screens.online.view === "rooms" ? g.rooms === null ? "Looking for rooms" : g.rooms.length ? `${g.rooms.length} ${g.rooms.length === 1 ? "room" : "rooms"} available` : "No rooms open" : "";
    const status = id === "online" ? [g.screens.online.heading, table ? table.joined ? `Joined ${table.name ?? "room"}. Code ${table.code}` : "Joining room" : g.tableEnded === "left" ? "Left the room" : "", rooms].filter(Boolean).join(". ") : id === "title" ? "Brain awake" : "";
    const items = screen ? screen.menu.items.map(projectItem) : [];
    if (id !== "title") items.push({ id: "back", name: id === "play" ? "Open menu" : "Back", kind: "action" });
    return { key: id === "online" ? `online:${g.screens.online.view}` : id, name: id === "title" ? "Flies" : screen?.heading ?? (id === "play" ? "Playing" : "About"), status, focus: screen?.menu.focused?.id ?? "back", items, body: id === "about" ? ABOUT.map((b) => `${b.heading ?? ""}. ${b.body}`).join("\n\n") : undefined };
  }

  send(command: AccessCommand) {
    const g = this.game;
    g.accessInput();
    if ((command.id === "retry" || command.id === "back") && command.action === "focus") return;
    if (command.id === "retry") { g.retryBrain(); return; }
    if (command.id === "back") { g.back(); return; }
    const id = g.screen;
    if (id !== "title" && id !== "settings" && id !== "online") return;
    const screen = g.screens[id];
    const item = screen.menu.item(command.id);
    if (!item || item.disabled) return;
    if (command.action === "focus") { screen.menu.focusOn(item.id); return; }
    if (command.action === "submit") { if (id === "online") g.screens.online.submitField(item.id); }
    else if (command.action === "value" && item.kind === "field") {
      if (id === "online") g.screens.online.editValue(item.id, String(command.value ?? ""));
    } else {
      const value = command.action === "value" ? Number(command.value) : undefined;
      screen.access(item.id, item.kind === "slider" && value !== undefined ? (value - item.min) / (item.max - item.min) : value);
    }
    g.menuChanged();
  }
}
