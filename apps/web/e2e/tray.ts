import assert from "node:assert/strict";
import type { Page } from "playwright";
import type { Game } from "../src/game.ts";
import { TRAY } from "../src/tools/tray.ts";
import type { TrayItem, TrayPage } from "../src/tools/tray.ts";

type TapOn = (kind: string, index?: number) => Promise<void>;

const trayState = (page: Page) => page.evaluate(() => {
  const { tray } = (globalThis as unknown as { __fly: Game }).__fly;
  return { open: tray.open, ring: tray.page, focus: tray.focus };
});

export async function waitForTray(page: Page, ring: TrayPage | null, focus?: number) {
  await page.waitForFunction(({ ring, focus }) => {
    const { tray } = (globalThis as unknown as { __fly: Game }).__fly;
    return ring === null ? !tray.open : tray.open && tray.page === ring && (focus === undefined || tray.focus === focus);
  }, { ring, focus });
}

/** Follows a path through the rings using the same input as the test's player. */
export async function chooseFromTray(page: Page, path: readonly string[], tap?: TapOn) {
  if (tap) await tap("held");
  else await page.keyboard.press("Space");
  let ring: TrayPage = "root";
  for (const id of path) {
    await waitForTray(page, ring);
    const items: readonly TrayItem[] = TRAY[ring];
    const index = items.findIndex((item) => item.id === id);
    assert.ok(index >= 0, `No ${id} in the ${ring} ring`);
    if (tap) await tap("slot", index);
    else {
      let { focus } = await trayState(page);
      const forward = (index - focus + items.length) % items.length;
      const direction = forward <= items.length / 2 ? 1 : -1;
      while (focus !== index) {
        await page.keyboard.press(direction === 1 ? "ArrowRight" : "ArrowLeft");
        focus = (focus + direction + items.length) % items.length;
        await waitForTray(page, ring, focus);
      }
      await page.keyboard.press("Enter");
    }
    const { action } = items[index];
    if (action.kind === "page") ring = action.page;
    else {
      await waitForTray(page, null);
      return;
    }
  }
  await waitForTray(page, ring);
}
