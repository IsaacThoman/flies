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

type Tasted = { sweet: number; bitter: number; feed: number; eaten: number };

/**
 * Sets the fly down where the place starts it, on open table: wherever it has walked to (its brain's
 * choice) may be the edge of something raised, and food dropped in front of it there lands on the
 * surface below, which it can't taste from where it stands. Then drops food at its mouth and
 * watches four seconds of game time: the most of each taste its brain was sent, its most `feed`,
 * and how much it ate.
 */
async function dropAtMouth(page: Page, drop: () => Promise<void>): Promise<Tasted> {
  await page.evaluate(() => {
    const { hands, life } = (globalThis as unknown as { __fly: Game }).__fly;
    hands.release();
    const start = life.world.place.start;
    life.body.place(start.x, start.z, start.yaw, start.y);
  });
  // The hand and the camera ease after it (a quarter of a second or so): settled, the hand is at its mouth.
  await waitForGameTime(page, 1.5);
  const observation = page.evaluate(() => new Promise<Tasted>((resolve, reject) => {
    const g = (globalThis as unknown as { __fly: Game }).__fly;
    const until = g.time + 4;
    const before = g.life.eaten;
    let sweet = 0, bitter = 0, feed = 0, frame = 0;
    const timer = setTimeout(() => {
      cancelAnimationFrame(frame);
      reject(new Error("feeding: the game did not advance four seconds in 120 s"));
    }, 120_000);
    const sample = () => {
      sweet = Math.max(sweet, g.life.sensed.sweet);
      bitter = Math.max(bitter, g.life.sensed.bitter);
      feed = Math.max(feed, g.life.brain.state?.command.feed ?? 0);
      if (g.time >= until) {
        clearTimeout(timer);
        resolve({ sweet, bitter, feed, eaten: g.life.eaten - before });
      } else frame = requestAnimationFrame(sample);
    };
    sample();
  }));
  // Attach both handlers immediately so a failed input cannot leave the probe's rejection unhandled.
  const [, result] = await Promise.all([drop(), observation]);
  return result;
}

/** Where the dropped food of a kind lies from the fly, for telling a fly that wouldn't from food that couldn't be reached (another surface, out of reach). */
const whereIs = (page: Page, kind: string) =>
  page.evaluate((kind) => {
    const { life } = (globalThis as unknown as { __fly: Game }).__fly;
    const p = life.body.position;
    return life.pantry.foods.filter((f) => f.kind === kind).map((f) => `${Math.hypot(f.x - p.x, f.z - p.z).toFixed(1)} mm off, ${(f.y - p.y).toFixed(1)} up, r ${f.r.toFixed(1)}`).join("; ");
  }, kind);

/** The brain can leave a meal: drop again, keeping the guaranteed path (honey reaches its taste senses) separate from its choice to eat. */
export async function feedHoney(page: Page, drop: () => Promise<void>) {
  let sweet = 0, feed = 0, eaten = 0;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const result = await dropAtMouth(page, drop);
    sweet = Math.max(sweet, result.sweet);
    feed = Math.max(feed, result.feed);
    eaten += result.eaten;
    console.log(`  drop ${attempt}: sweet ${result.sweet.toFixed(3)}, feed ${result.feed.toFixed(3)}, eaten ${result.eaten.toFixed(3)}`);
    if (sweet > 0 && feed > 0.05 && eaten > 0.05) break;
  }
  if (sweet <= 0) assert.fail(`five drops: honey never reached the taste senses (from the fly: ${await whereIs(page, "honey")})`);
  assert.ok(feed > 0.05, "five drops: the brain never produced a feed command");
  if (eaten <= 0.05) console.log("  tasted and commanded feeding; chose not to stay and eat within five drops (consumption is covered by life.test.ts)");
}

/**
 * Bitter sugar at its mouth: its bitterness reaches the taste senses with its sweetness (the
 * guaranteed path, retried only until it does), and the brain doesn't feed on it, as its taste
 * measurements say (bitter at this strength on full sugar leaves the proboscis motor neuron
 * silent, packages/brain/README.md, Senses). Nothing here makes it refuse: the brain is sent both.
 */
export async function refuseBitterSugar(page: Page, drop: () => Promise<void>) {
  let tasted: Tasted | null = null;
  // As many drops as honey gets: a lump is smaller than a drop of honey, and lands off the mouth more often.
  for (let attempt = 1; attempt <= 5 && !tasted; attempt++) {
    const result = await dropAtMouth(page, drop);
    console.log(`  drop ${attempt}: sweet ${result.sweet.toFixed(3)}, bitter ${result.bitter.toFixed(3)}, feed ${result.feed.toFixed(3)}, eaten ${result.eaten.toFixed(3)}`);
    if (result.bitter > 0 && result.sweet > 0) tasted = result;
  }
  if (!tasted) assert.fail(`five drops: the bitter sugar never reached the taste senses (from the fly: ${await whereIs(page, "laced")})`);
  assert.ok(tasted.eaten < 0.05, `it ate ${tasted.eaten.toFixed(3)} of sugar this bitter, which its brain's measurements say it leaves`);
}
