import type { Page } from "playwright";
import type { Game } from "../src/game.ts";
import { gameUp, readState, waitFor } from "../../../scripts/play.ts";

/**
 * Idle time on a slow runner must not hide the controls between steps. A tab
 * opened beside others already living several brains can take longer than 30 s
 * to draw its first frame on a CI runner, so this waits as long as a brain may.
 */
export async function disableScreensaver(page: Page) {
  await gameUp(page, 120_000);
  await page.evaluate(() => {
    (globalThis as unknown as { __fly: Game }).__fly.settings.wallpaperAfter = 0;
  });
}

/** Choose a count through the settings' remote controls, keeping the persisted request even at a full table. */
export async function chooseFlies(page: Page, count: number) {
  await page.evaluate(() => (globalThis as unknown as { __fly: Game }).__fly.open("settings"));
  await waitFor(page, "screen=settings,tab=wallpaper");
  if ((await readState(page)).ring === "false") {
    await page.keyboard.press("ArrowDown");
    await waitFor(page, "ring=true");
  }
  for (let i = 0; i < 8 && (await readState(page)).focus !== "flies"; i++) {
    const before = (await readState(page)).focus;
    await page.keyboard.press("ArrowDown");
    await waitFor(page, `focus~^(?!${before}$)`);
  }
  await waitFor(page, "focus=flies");
  let chosen = await page.evaluate(() => (globalThis as unknown as { __fly: Game }).__fly.settings.flies);
  while (chosen !== count) {
    const next = chosen + Math.sign(count - chosen);
    await page.keyboard.press(next > chosen ? "ArrowRight" : "ArrowLeft");
    await page.waitForFunction((n) => JSON.parse(localStorage.getItem("flies.settings") ?? "{}").flies === n, next);
    chosen = next;
  }
  await page.keyboard.press("Escape");
}

export const companyOf = (s: Record<string, string>) => (s.company ?? "").split(";").filter(Boolean).map((entry) => {
  const [id, brain, activity, at, eyes, crowd, colour] = entry.split(":");
  const [x, z] = at.split(",").map(Number);
  return { id: Number(id), brain, activity, x, z, eyes: Number(eyes), crowd: Number(crowd), colour };
});

/** Every companion has woken and completed a picture of its own. */
export async function companyAwake(page: Page, count: number) {
  await waitFor(page, `flies=${count}`, 120_000);
  await page.waitForFunction((count) => {
    const s = (document.getElementById("game") as HTMLCanvasElement).dataset;
    const company = (s.company ?? "").split(";").filter(Boolean).map((e) => e.split(":"));
    return company.length === count - 1 && company.every((c) => c[1] === "running" && Number(c[4]) > 0);
  }, count, { timeout: 120_000 });
  return readState(page);
}
