import type { Page } from "playwright";
import type { Game } from "../src/game.ts";
import { gameUp } from "../../../scripts/play.ts";

/** Idle time on a slow runner must not hide the controls between steps. */
export async function disableScreensaver(page: Page) {
  await gameUp(page);
  await page.evaluate(() => {
    (globalThis as unknown as { __fly: Game }).__fly.settings.wallpaperAfter = 0;
  });
}
