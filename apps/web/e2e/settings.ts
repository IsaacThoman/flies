import type { Page } from "playwright";
import type { Game } from "../src/game.ts";
import { gameUp } from "../../../scripts/play.ts";

/**
 * Pins what a suite must not leave to the game's defaults, once it is up: no
 * screensaver (idle time on a slow runner must not hide the controls between
 * steps), and alone unless the suite is about playing with others (the game
 * sits with everyone once the brain is awake, which it hasn't by the time
 * the first frame is drawn).
 */
export async function pinSettings(page: Page, { joinOthers = false } = {}) {
  await gameUp(page);
  await page.evaluate((joinOthers) => {
    const settings = (globalThis as unknown as { __fly: Game }).__fly.settings;
    settings.wallpaperAfter = 0;
    settings.joinOthers = joinOthers;
  }, joinOthers);
}
