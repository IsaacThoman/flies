// Tree and keyboard only for task actions; canvas state remains the test clock.
// --site <built directory> --evidence <directory> also drives a review artifact.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
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
if (evidence) fs.mkdirSync(evidence, { recursive: true });
if (!arg("--site")) await build({ logLevel: "warn", build: { outDir: dir, emptyOutDir: true } });
const site = await serveSite({ dir });
const rooms = await startServer({ port: 0, dataDir: path.join(scratch, "rooms"), log() {} });
const browser = await chromium.launch({ executablePath: chromiumPath(), args: gpuFlags() });
const code = tableCode((bytes) => crypto.getRandomValues(bytes));
const fake = new WebSocket(`ws://127.0.0.1:${rooms.port}/rooms`);
await new Promise<void>((resolve, reject) => {
  fake.onopen = () => fake.send(JSON.stringify({ type: "hello", v: PROTOCOL, table: code, key: crypto.randomUUID(), password: "apples", start: { name: "Garden", place: "picnic", listed: true, light: "noon", weather: "clear", zone: "UTC", offset: 0 } }));
  fake.onmessage = (event) => { if (typeof event.data === "string" && JSON.parse(event.data).type === "welcome") resolve(); };
  fake.onerror = () => reject(new Error("Room fixture failed"));
});
const transcript: string[] = [];
const errors: string[] = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, reducedMotion: "reduce" });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem("flies.settings", JSON.stringify({ wallpaperAfter: 0 })));
  await page.goto(`${site.url}?rooms=${encodeURIComponent(`ws://127.0.0.1:${rooms.port}/rooms`)}`);
  await waitFor(page, "screen=title", 120_000);
  async function dump(name: string) {
    const tree = await page.locator("body").ariaSnapshot();
    transcript.push(`\n${name}\n${tree}`);
    if (evidence) fs.writeFileSync(path.join(evidence, `${name}.tree.txt`), tree);
  }
  // Only inspect the accessibility name/role and move the keyboard focus with Tab.
  async function tab(role: "button" | "textbox" | "listbox", name: string | RegExp) {
    const target = page.getByRole(role, { name, exact: typeof name === "string" });
    await target.waitFor();
    for (let n = 0; n < 40; n++) {
      if (await target.evaluate((node) => node === document.activeElement)) return target;
      await page.keyboard.press("Tab");
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
  await activate("Settings");
  await waitFor(page, "screen=settings");
  await tab("listbox", "Starts after");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  assert.equal(await page.getByRole("listbox", { name: "Starts after" }).inputValue(), "5 min");
  await dump("settings");
  await audit("settings");
  await activate("Back");
  await activate("Online");
  await waitFor(page, "screen=online");
  await dump("rooms");
  await activate("New room");
  await type("Name", "Orchard");
  await dump("create");
  await activate("Create");
  await waitFor(page, "online=joined");
  await dump("joined");
  await audit("joined");
  await activate("Leave the room");
  await waitFor(page, "onlineView=rooms");
  await activate(/^Garden, Picnic table, 1 of 8 flies, Password required$/);
  // Password fields have no implicit textbox role in browsers.
  const password = page.getByLabel("Password", { exact: true });
  await password.waitFor();
  for (let n = 0; n < 30 && !await password.evaluate((node) => node === document.activeElement); n++) await page.keyboard.press("Tab");
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
  await activate("Leave the room");
  await waitFor(page, "onlineView=rooms");
  await page.getByRole("button", { name: /^Garden, Picnic table, 1 of 8 flies, Password required$/ }).waitFor();
  await dump("left");
  await audit("left");
  // Preference behavior is read from the actual camera across game time, without sleeping.
  const camera = () => page.evaluate(() => { const g = (globalThis as unknown as { __fly: { director: { camera: { matrixWorld: { elements: number[] } } }; reducedMotion: boolean } }).__fly; return { reduced: g.reducedMotion, matrix: [...g.director.camera.matrixWorld.elements] }; });
  await page.evaluate(() => {
    const state = { count: 0 };
    (globalThis as unknown as { __accessMutations: typeof state }).__accessMutations = state;
    new MutationObserver((entries) => { state.count += entries.length; }).observe(document.querySelector("section")!, { subtree: true, childList: true, attributes: true, characterData: true });
  });
  const first = await camera();
  await waitForGameTime(page, 2);
  assert.deepEqual(await camera(), first);
  assert.equal(first.reduced, true);
  assert.equal(await page.evaluate(() => (globalThis as unknown as { __accessMutations: { count: number } }).__accessMutations.count), 0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.waitForFunction(() => !(globalThis as unknown as { __fly: { reducedMotion: boolean } }).__fly.reducedMotion);
  assert.equal((await camera()).reduced, false);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await activate("Back");
  await activate("Settings");
  await tab("listbox", "Reduce motion");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  assert.equal((await camera()).reduced, false);
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  assert.equal((await camera()).reduced, true);
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
    transcript.push("Paused-frame full-page PNGs with and without semantic tree: byte-identical. Idle semantic DOM mutations across 2 seconds game time: 0.");
  }
  transcript.push("Tasks complete; axe: no additional WCAG A/AA violations; existing meta-viewport violation recorded; system motion and overrides passed; camera static across 2 seconds game time.");
  assert.deepEqual(errors, []);
  console.log(transcript.join("\n"));
} finally {
  if (evidence) fs.writeFileSync(path.join(evidence, "transcript.txt"), transcript.join("\n"));
  fake.close();
  await browser.close();
  await rooms.stop();
  await site.close();
  fs.rmSync(scratch, { recursive: true, force: true });
}
