import assert from "node:assert/strict";
import type { Page } from "playwright";
import { waitForGameTime } from "../../../scripts/play.ts";
import type { Game } from "../src/game.ts";

/**
 * Does what drops food, then waits for it to land: a new dropped food, not a
 * higher count of them, which the fly finishing another at that moment hides.
 */
export async function dropFood(page: Page, drop: () => Promise<void>) {
  const newest = () =>
    page.evaluate(() => {
      const foods = (globalThis as unknown as { __fly: Game }).__fly.life.pantry.foods;
      return Math.max(0, ...foods.filter((f) => f.kind !== "patch" && f.kind !== "found").map((f) => f.id));
    });
  const before = await newest();
  await drop();
  const started = Date.now();
  while ((await newest()) <= before) {
    if (Date.now() - started > 60_000) throw new Error("no food landed within 60 s of dropping it");
    await waitForGameTime(page, 0.1);
  }
}

/** The brain can leave a meal. Retry at its new mouth position, keeping the guaranteed path separate from its choice to eat. */
export async function feedHoney(page: Page, drop: () => Promise<void>) {
  let sweet = 0, feed = 0, eaten = 0;
  for (let attempt = 1; attempt <= 5; attempt++) {
    await page.evaluate(() => (globalThis as unknown as { __fly: Game }).__fly.hands.release());
    await waitForGameTime(page, 0.4);
    const observation = page.evaluate(() => new Promise<{ sweet: number; feed: number; eaten: number }>((resolve, reject) => {
      const g = (globalThis as unknown as { __fly: Game }).__fly;
      const until = g.time + 4;
      const before = g.life.eaten;
      let sweet = 0, feed = 0, frame = 0;
      const timer = setTimeout(() => {
        cancelAnimationFrame(frame);
        reject(new Error("feeding: the game did not advance four seconds in 120 s"));
      }, 120_000);
      const sample = () => {
        sweet = Math.max(sweet, g.life.sensed.sweet);
        feed = Math.max(feed, g.life.brain.state?.command.feed ?? 0);
        if (g.time >= until) {
          clearTimeout(timer);
          resolve({ sweet, feed, eaten: g.life.eaten - before });
        } else frame = requestAnimationFrame(sample);
      };
      sample();
    }));
    // Attach both handlers immediately so a failed input cannot leave the probe's rejection unhandled.
    const [, result] = await Promise.all([drop(), observation]);
    sweet = Math.max(sweet, result.sweet);
    feed = Math.max(feed, result.feed);
    eaten += result.eaten;
    console.log(`  drop ${attempt}: sweet ${result.sweet.toFixed(3)}, feed ${result.feed.toFixed(3)}, eaten ${result.eaten.toFixed(3)}`);
    if (sweet > 0 && feed > 0.05 && eaten > 0.05) break;
  }
  if (sweet <= 0) {
    // Where it landed, for telling a fly that wouldn't from honey that couldn't be reached (another surface, out of reach).
    const where = await page.evaluate(() => {
      const { life } = (globalThis as unknown as { __fly: Game }).__fly;
      const p = life.body.position;
      return life.pantry.foods.filter((f) => f.kind === "honey").map((f) => `${Math.hypot(f.x - p.x, f.z - p.z).toFixed(1)} mm off, ${(f.y - p.y).toFixed(1)} up, r ${f.r.toFixed(1)}`).join("; ");
    });
    assert.fail(`five drops: honey never reached the taste senses (from the fly: ${where})`);
  }
  assert.ok(feed > 0.05, "five drops: the brain never produced a feed command");
  if (eaten <= 0.05) console.log("  tasted and commanded feeding; chose not to stay and eat within five drops (consumption is covered by life.test.ts)");
}
