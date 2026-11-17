import assert from "node:assert/strict";
import { test } from "node:test";
import { MenuAccess, projectItem } from "../src/accessibility/model.ts";
import type { Game } from "../src/game.ts";
import { Menu } from "@fly/ui";

test("room semantics carry the meaning of dots, occupancy and the lock", () => {
  assert.deepEqual(projectItem({ id: "room:abc", kind: "action", label: "Garden", description: "Picnic", count: [3, 8], locked: true }).name, "Garden, Picnic, 3 of 8 flies, Password required");
  assert.equal(projectItem({ id: "page", kind: "choice", label: "", options: [{ label: "Picture", value: "picture" }], index: 0 }).name, "Settings page");
});

test("focusing a navigation button never activates it", () => {
  let back = 0, retries = 0;
  const access = new MenuAccess({ accessInput() {}, back() { back++; }, retryBrain() { retries++; } } as unknown as Game);
  access.send({ id: "back", action: "focus" });
  access.send({ id: "retry", action: "focus" });
  assert.equal(back + retries, 0);
  access.send({ id: "back", action: "activate" });
  assert.equal(back, 1);
});

test("stale and disabled semantic actions cannot activate a different menu row", () => {
  let actions = 0;
  const access = new MenuAccess({ screen: "title", accessInput() {}, menuChanged() {}, screens: { title: { menu: new Menu([{ id: "online", label: "Online", kind: "action", disabled: true }]), access() { actions++; } } } } as unknown as Game);
  access.send({ id: "online", action: "activate" });
  access.send({ id: "room:gone", action: "activate" });
  assert.equal(actions, 0);
});
