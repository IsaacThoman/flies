// Browser-only host adapter. The tree is available without detecting a screen
// reader (browsers deliberately provide no reliable API for that).
import type { Game } from "../game.ts";
import { MenuAccess } from "./model.ts";
import type { AccessibleItem } from "./model.ts";

export function browserAccessibility(game: Game) {
  const model = new MenuAccess(game);
  const root = document.createElement("section");
  root.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;";
  const heading = document.createElement("h1");
  const body = document.createElement("p");
  const controls = document.createElement("div");
  const live = document.createElement("div");
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");
  live.setAttribute("aria-atomic", "true");
  root.append(heading, body, controls, live);
  document.body.append(root);
  const nodes = new Map<string, HTMLElement>();
  const composing = new WeakSet<Element>();
  let key = "";
  let engaged = false;
  let pending = false;
  let restoreFocus = false;
  const send = (id: string, action: "activate" | "value" | "submit", value?: string | number) => { engaged = true; model.send({ id, action, value }); };
  root.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); send("back", "activate"); }
  });
  root.addEventListener("keyup", (e) => e.stopPropagation());
  root.addEventListener("keypress", (e) => e.stopPropagation());

  function create(item: AccessibleItem) {
    let node: HTMLInputElement | HTMLSelectElement | HTMLButtonElement;
    if (item.kind === "choice") {
      node = document.createElement("select");
      const select = node;
      select.addEventListener("change", () => send(item.id, "value", select.selectedIndex));
    } else if (item.kind === "field" || item.kind === "slider") {
      node = document.createElement("input");
      node.name = item.id;
      node.type = item.kind === "slider" ? "range" : item.secret ? "password" : "text";
      node.style.fontSize = "16px";
      node.autocomplete = item.secret ? (key === "online:new" ? "new-password" : "current-password") : "off";
      const input = node;
      input.addEventListener("compositionstart", () => composing.add(input));
      input.addEventListener("compositionend", () => { composing.delete(input); send(item.id, "value", input.value); });
      input.addEventListener("input", () => { if (!composing.has(input)) send(item.id, "value", input.value); });
      input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); send(item.id, "submit"); } });
    } else {
      node = document.createElement("button");
      node.type = "button";
      node.addEventListener("click", () => send(item.id, "activate"));
    }
    node.addEventListener("focus", () => { restoreFocus = false; engaged = true; model.send({ id: item.id, action: "focus" }); });
    return node;
  }

  function sync() {
    pending = false;
    const state = model.read();
    const changed = key !== state.key;
    const ownedFocus = root.contains(document.activeElement);
    const focusedId = [...nodes].find(([, node]) => node === document.activeElement)?.[0];
    if (focusedId && !state.items.some((item) => item.id === focusedId && !item.disabled)) restoreFocus = true;
    if (changed) { controls.replaceChildren(); nodes.clear(); key = state.key; }
    root.setAttribute("aria-label", state.name);
    heading.textContent = state.name;
    body.textContent = state.body ?? "";
    body.hidden = !state.body;
    if (live.textContent !== state.status) live.textContent = state.status;
    const ids = new Set(state.items.map((i) => i.id));
    for (const [id, node] of nodes) if (!ids.has(id)) { node.remove(); nodes.delete(id); }
    let previous: HTMLElement | null = null;
    for (const item of state.items) {
      let node = nodes.get(item.id);
      if (!node) { node = create(item); nodes.set(item.id, node); }
      // Keep the focused node in place while network rows change around it.
      if (node.parentElement !== controls || node.previousElementSibling !== previous) controls.insertBefore(node, previous ? previous.nextSibling : controls.firstChild);
      previous = node;
      node.setAttribute("aria-label", item.name);
      if (node instanceof HTMLButtonElement) node.textContent = item.name;
      if (node instanceof HTMLSelectElement) {
        const options = item.options ?? [];
        // An inline native list keeps keyboard choices in the semantic tree;
        // a clipped popup select cannot open a usable visual menu.
        node.size = Math.max(2, options.length);
        if (node.options.length !== options.length || options.some((label, i) => node.options[i].text !== label)) node.replaceChildren(...options.map((label) => new Option(label)));
        node.selectedIndex = Number(item.value);
      }
      if (node instanceof HTMLInputElement) {
        if (node.type === "range") { node.min = String(item.min); node.max = String(item.max); node.step = String(item.step); }
        if (!composing.has(node) && node.value !== String(item.value ?? "")) node.value = String(item.value ?? "");
      }
      (node as HTMLButtonElement).disabled = !!item.disabled;
    }
    if (engaged && (changed || restoreFocus || (ownedFocus && !root.contains(document.activeElement)))) {
      const preferred = nodes.get(state.focus);
      const available = preferred && !(preferred as HTMLButtonElement).disabled;
      const target = available ? preferred : [...nodes.values()].find((n) => !(n as HTMLButtonElement).disabled);
      target?.focus({ preventScroll: true });
      // Joining temporarily disables the door's controls. Return to its field
      // when the server answers, including on an incorrect password.
      restoreFocus = !available;
    }
  }
  game.accessibilityChanged = () => {
    if (!pending) { pending = true; queueMicrotask(sync); }
  };
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const updateMotion = () => { game.systemReduceMotion = motion.matches; };
  updateMotion();
  motion.addEventListener("change", updateMotion);
  sync();
  return () => { game.accessibilityChanged = null; motion.removeEventListener("change", updateMotion); root.remove(); };
}
