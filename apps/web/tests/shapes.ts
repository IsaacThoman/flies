// Screens the game is played on, for the tests of what follows the screen's
// shape: windows, phones and tablets either way up (with what their notches
// and home indicators cover), a tablet split in three, an ultrawide.

import { frameFor } from "../src/display.ts";
import type { Frame, Insets } from "../src/display.ts";

const none: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

export const SHAPES: Record<string, { width: number; height: number; safe: Insets; coarse: boolean }> = {
  "a 16:9 window": { width: 1280, height: 720, safe: none, coarse: false },
  "a 16:10 laptop": { width: 1440, height: 900, safe: none, coarse: false },
  "a 4:3 window": { width: 1024, height: 768, safe: none, coarse: false },
  "a small window": { width: 640, height: 400, safe: none, coarse: false },
  "an ultrawide": { width: 3440, height: 1440, safe: none, coarse: false },
  "a phone upright": { width: 393, height: 852, safe: { top: 59, right: 0, bottom: 34, left: 0 }, coarse: true },
  "a phone on its side": { width: 852, height: 393, safe: { top: 0, right: 59, bottom: 21, left: 59 }, coarse: true },
  "a small phone upright": { width: 320, height: 568, safe: none, coarse: true },
  "a tablet upright": { width: 834, height: 1194, safe: { top: 24, right: 0, bottom: 20, left: 0 }, coarse: true },
  "a tablet on its side": { width: 1194, height: 834, safe: { top: 24, right: 0, bottom: 20, left: 0 }, coarse: true },
  "a third of a tablet": { width: 320, height: 1024, safe: { top: 24, right: 0, bottom: 20, left: 0 }, coarse: true },
};

/** Every shape's frame, by name. */
export function frames(): [string, Frame][] {
  return Object.entries(SHAPES).map(([name, s]) => [name, frameFor(s.width, s.height, s.safe, s.coarse)]);
}
