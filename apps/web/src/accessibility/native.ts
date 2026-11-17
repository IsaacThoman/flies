// The JavaScriptCore host can opt into the same projection without a DOM.
import type { Game } from "../game.ts";
import { MenuAccess } from "./model.ts";
import type { AccessCommand } from "./model.ts";

type NativeAccess = {
  connect(receive: (event: string, value: string) => void): void;
  publish(json: string): void;
};

export function nativeAccessibility(game: Game) {
  const bridge = (globalThis as { __native?: { accessibility?: NativeAccess } }).__native?.accessibility;
  if (!bridge) return;
  const model = new MenuAccess(game);
  let enabled = false;
  let pending = false;
  const sync = () => {
    pending = false;
    if (!enabled) return;
    const state = model.read();
    for (const item of state.items) if (item.secret) item.value = item.value ? "Password entered" : "No password";
    bridge.publish(JSON.stringify(state));
  };
  game.accessibilityChanged = () => {
    if (enabled && !pending) { pending = true; queueMicrotask(sync); }
  };
  bridge.connect((event, value) => {
    if (event === "enabled") { enabled = value === "true"; sync(); }
    else if (event === "motion") game.systemReduceMotion = value === "true";
    else if (event === "command") model.send(JSON.parse(value) as AccessCommand);
  });
}
