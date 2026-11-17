import assert from "node:assert/strict";
import { test } from "node:test";
import { MenuAccess, projectItem } from "../src/accessibility/model.ts";
import type { Game } from "../src/game.ts";
import { MAX_FLIES } from "@fly/net";
import { Menu } from "@fly/ui";
import { accessibilityEnabled } from "../src/accessibility/browser.ts";

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


test("a failed brain is never announced as awake on the title", () => {
  const game = { loading: false, screen: "title", brain: { status: "failed" }, screens: { title: { heading: "Title", menu: new Menu([]) }, online: { view: "rooms" } }, rooms: [], table: null } as unknown as Game;
  assert.equal(new MenuAccess(game).read().status, "Its brain could not wake");
});


test("semantic DOM is enabled only by an explicit opt-in", () => {
  assert.equal(accessibilityEnabled(""), false);
  assert.equal(accessibilityEnabled("?accessibility=0"), false);
  assert.equal(accessibilityEnabled("?accessibility=true"), false);
  assert.equal(accessibilityEnabled("?accessibility=1"), true);
});


test("everyone rooms and multi-fly devices retain meaningful semantics", () => {
  assert.equal(projectItem({ id: "room:all", kind: "action", label: "Everyone", swatch: ["red", "blue"], everyone: true, count: [8, 8] }).name, "Everyone, 8 of 8 flies, Open to everyone");
  const game = {
    loading: false, screen: "online", here: "picnic", rooms: [],
    screens: { online: { view: "room", heading: "Garden", menu: new Menu([]) } },
    table: { joined: true, name: "Garden", code: "abcdefghjk", others: [{ id: 2, colours: ["red", "blue", "green"] }] },
    online: { place: "picnic", room: { locked: false }, mine: [{}, {}], others: { list: [{}, {}, {}] } },
  } as unknown as Game;
  assert.equal(new MenuAccess(game).read().body, `Picnic table, 5 of ${MAX_FLIES} flies, No password`);
});
