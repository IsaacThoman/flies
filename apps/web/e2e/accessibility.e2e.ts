// Tree and keyboard only for task actions; canvas state remains the test clock.
// --site <built directory> --evidence <directory> also drives a review artifact.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, webkit } from "playwright";
import axe from "axe-core";
import { build } from "vite";
import { startServer } from "../../server/src/server.ts";
import { serveSite } from "../../../scripts/serve.ts";
import { chromiumPath, gpuFlags, waitFor, waitForGameTime } from "../../../scripts/play.ts";
import { PROTOCOL, tableCode } from "@fly/net";

const arg = (name: string) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null;
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "flies-access-"));
const dir = arg("--site") ?? path.join(scratch, "site");
const evidence = arg("--evidence");
const nextTab = arg("--browser") === "webkit" ? "Alt+Tab" : "Tab";
if (evidence) fs.mkdirSync(evidence, { recursive: true });
if (!arg("--site")) await build({ logLevel: "warn", build: { outDir: dir, emptyOutDir: true } });
const site = await serveSite({ dir });
const rooms = await startServer({ port: 0, dataDir: path.join(scratch, "rooms"), log() {} });
const browser = arg("--browser") === "webkit" ? await webkit.launch({ executablePath: process.env.WEBKIT_PATH }) : await chromium.launch({ executablePath: chromiumPath(), args: gpuFlags() });
const code = tableCode((bytes) => crypto.getRandomValues(bytes));
const fake = new WebSocket(`ws://127.0.0.1:${rooms.port}/rooms`);
await new Promise<void>((resolve, reject) => {
  fake.onopen = () => fake.send(JSON.stringify({ type: "hello", v: PROTOCOL, table: code, key: crypto.randomUUID(), password: "apples", start: { name: "Garden", place: "picnic", listed: true, light: "noon", weather: "clear", zone: "UTC", offset: 0 } }));
  fake.onmessage = (event) => { if (typeof event.data === "string" && JSON.parse(event.data).type === "welcome") resolve(); };
  fake.onerror = () => reject(new Error("Room fixture failed"));
});
const extraPeers: WebSocket[] = [];
const transcript: string[] = [];
const errors: string[] = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem("flies.settings", JSON.stringify({ wallpaperAfter: 0 })));
  await page.goto(`${site.url}?rooms=${encodeURIComponent(`ws://127.0.0.1:${rooms.port}/rooms`)}`);
  await waitFor(page, "screen=title", 120_000);
  assert.equal(await page.getByRole("button", { name: "Play", exact: true }).count(), 0);
  assert.equal(await page.evaluate(() => (globalThis as unknown as { __fly: { accessibilityChanged: unknown } }).__fly.accessibilityChanged), null);
  transcript.push("Default entry: no semantic controls or host subscription; explicit accessibility=1 opts in.");
  await page.goto(`${site.url}?accessibility=1&rooms=${encodeURIComponent(`ws://127.0.0.1:${rooms.port}/rooms`)}`);
  await waitFor(page, "screen=title", 120_000);
  async function dump(name: string) {
    const tree = await page.locator("body").ariaSnapshot();
    transcript.push(`\n${name}\n${tree}`);
    if (evidence) {
      fs.writeFileSync(path.join(evidence, `${name}.tree.txt`), tree);
      if (/rooms|joined|password/.test(name)) await page.locator("#game").screenshot({ path: path.join(evidence, `${name}.png`) });
    }
  }
  // Only inspect the accessibility name/role and move the keyboard focus with Tab.
  async function tab(role: "button" | "textbox" | "listbox", name: string | RegExp) {
    const target = page.getByRole(role, { name, exact: typeof name === "string" });
    await target.waitFor();
    for (let n = 0; n < 40; n++) {
      if (await target.evaluate((node) => node === document.activeElement)) return target;
      await page.keyboard.press(nextTab);
    }
    throw new Error(`Tab never reached ${name}`);
  }
  async function activate(name: string | RegExp) { await tab("button", name); await page.keyboard.press("Enter"); }
  async function type(name: string, value: string) { await tab("textbox", name); await page.keyboard.press("ControlOrMeta+A"); await page.keyboard.type(value); }
  async function audit(name: string) {
    await page.addScriptTag({ content: axe.source });
    const result = await page.evaluate(async () => (globalThis as unknown as { axe: typeof axe }).axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } }));
    if (evidence) fs.writeFileSync(path.join(evidence, `${name}.axe.json`), JSON.stringify(result.violations, null, 2));
    // Existing canvas viewport forbids page zoom; retain that finding in evidence.
    assert.deepEqual(result.violations.filter((v) => v.id !== "meta-viewport").map((v) => v.id), [], name);
  }
  await dump("title");
  if (evidence) await page.locator("#game").screenshot({ path: path.join(evidence, "title.png") });
  await audit("title");
  await activate("Play");
  await waitFor(page, "screen=play");
  await dump("playing");
  await activate("Open menu");
  await waitFor(page, "screen=title");
  assert.equal(await page.getByRole("button", { name: "Play", exact: true }).evaluate((node) => node === document.activeElement), true);
  await activate("Settings");
  await waitFor(page, "screen=settings");
  await tab("listbox", "Starts after");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  assert.equal(await page.getByRole("listbox", { name: "Starts after" }).inputValue(), "5 min");
  await dump("settings");
  await audit("settings");
  await activate("Back");
  assert.equal(await page.getByRole("button", { name: "Settings", exact: true }).evaluate((node) => node === document.activeElement), true);
  await waitFor(page, "online=joined,everyone=yes");
  await activate("Online");
  await waitFor(page, "screen=online");
  await activate("Browse rooms");
  await waitFor(page, "onlineView=rooms");
  await dump("rooms");
  const garden = await tab("button", /^Garden, Picnic table, 1 of 128 flies, Password required$/);
  const focusedRoom = await garden.elementHandle();
  await waitFor(page, "ring=true");
  const peer = new WebSocket(`ws://127.0.0.1:${rooms.port}/rooms`);
  extraPeers.push(peer);
  await new Promise<void>((resolve, reject) => {
    peer.onopen = () => peer.send(JSON.stringify({ type: "hello", v: PROTOCOL, table: code, key: crypto.randomUUID(), password: "apples" }));
    peer.onmessage = (event) => { if (typeof event.data === "string" && JSON.parse(event.data).type === "welcome") resolve(); };
    peer.onerror = () => reject(new Error("Occupancy fixture failed"));
  });
  await page.getByRole("button", { name: /^Garden, Picnic table, 2 of 128 flies, Password required$/ }).waitFor();
  assert.equal(await focusedRoom!.evaluate((node) => node === document.activeElement), true);
  await dump("rooms-occupied");
  peer.send(JSON.stringify({ type: "bye" }));
  peer.close();
  await garden.waitFor();
  assert.equal(await focusedRoom!.evaluate((node) => node === document.activeElement), true);
  transcript.push("Room occupancy changed 1 → 2 → 1 while the same DOM node retained keyboard focus. Menu focus returned to Play and Settings on navigation.");
  await activate("New room");
  await type("Name", "𐐀".repeat(25));
  assert.equal(await page.getByRole("textbox", { name: "Name", exact: true }).inputValue(), "𐐀".repeat(24));
  await type("Name", "Orchard");
  await dump("create");
  await activate("Create");
  await waitFor(page, "online=joined");
  await dump("joined");
  await audit("joined");
  // Leaving a room of someone's own is back with everyone, whose rooms are a step away.
  await activate("Leave the room");
  await waitFor(page, "online=joined,everyone=yes,onlineView=room");
  await activate("Browse rooms");
  await waitFor(page, "onlineView=rooms");
  await activate(/^Garden, Picnic table, 1 of 128 flies, Password required$/);
  // Password fields have no implicit textbox role in browsers.
  const password = page.getByLabel("Password", { exact: true });
  await password.waitFor();
  for (let n = 0; n < 30 && !await password.evaluate((node) => node === document.activeElement); n++) await page.keyboard.press(nextTab);
  await page.keyboard.type("wrong");
  await page.keyboard.press("Enter");
  await page.getByRole("status").filter({ hasText: "Wrong password" }).waitFor();
  await dump("wrong-password");
  assert.equal(await password.evaluate((node) => node === document.activeElement), true, "password focus returns after refusal");
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("apples");
  await page.keyboard.press("Enter");
  await waitFor(page, "online=joined");
  await dump("joined-locked");
  // Leaving a room of someone's own is back with everyone, whose rooms are a step away.
  await activate("Leave the room");
  await waitFor(page, "online=joined,everyone=yes,onlineView=room");
  await activate("Browse rooms");
  await waitFor(page, "onlineView=rooms");
  await page.getByRole("button", { name: /^Garden, Picnic table, 1 of 128 flies, Password required$/ }).waitFor();
  await dump("left");
  await audit("left");
  await page.evaluate(() => {
    const state = { count: 0 };
    (globalThis as unknown as { __accessMutations: typeof state }).__accessMutations = state;
    new MutationObserver((entries) => { state.count += entries.length; }).observe(document.querySelector("section")!, { subtree: true, childList: true, attributes: true, characterData: true });
  });
  await waitForGameTime(page, 2);
  assert.equal(await page.evaluate(() => (globalThis as unknown as { __accessMutations: { count: number } }).__accessMutations.count), 0);
  transcript.push("Idle semantic DOM mutations across two seconds game time: 0.");
  if (evidence) {
    // Stop the game's RAF after its pending frame so two screenshots compare the
    // DOM adapter's paint alone, without the fly moving between captures.
    await page.evaluate(async () => {
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = () => 0;
      await new Promise<void>((resolve) => raf(() => raf(() => resolve())));
    });
    const mirrored = await page.screenshot({ path: path.join(evidence, "mirror.png") });
    await page.locator("section").evaluate((node) => node.remove());
    const canvasOnly = await page.screenshot({ path: path.join(evidence, "canvas.png") });
    assert.ok(mirrored.equals(canvasOnly), "hidden semantic tree changes no screen pixels");
    transcript.push("Paused-frame full-page PNGs with and without semantic tree: byte-identical.");
  }
  transcript.push("Tasks complete; axe: no additional WCAG A/AA violations; existing meta-viewport violation recorded;");
  assert.deepEqual(errors, []);
  console.log(transcript.join("\n"));
} finally {
  if (evidence) fs.writeFileSync(path.join(evidence, "transcript.txt"), transcript.join("\n"));
  fake.close();
  for (const peer of extraPeers) peer.close();
  await browser.close();
  await rooms.stop();
  await site.close();
  fs.rmSync(scratch, { recursive: true, force: true });
}
