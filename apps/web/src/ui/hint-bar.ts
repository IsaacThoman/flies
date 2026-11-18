// What the buttons in hand do on the screen showing, along the foot of the
// safe area: each button as its glyph, with a word where what it does isn't
// plain from the glyph (Left and Right change the setting under the focus;
// Select types into a field). A screen passes the hints for what has the
// focus, so the bar says what a press will do now, not what it might do
// somewhere. None for a pointer, which presses what it sees; none with Hints
// off.

import { drawGlyph, hintChip, hintWidth } from "@fly/ui";
import type { Glyph, GlyphSet } from "@fly/ui";
import type { Frame } from "../display.ts";

export type Hint = { readonly glyph: Glyph; readonly label?: string };

const SIZE = 13;
const GAP = 12;
/** How tall a glyph is without a word beside it. */
const BARE = 24;

/** Kept between frames: a bar is measured when its hints or the buttons in hand change, not every time it is drawn. */
const measured: { hints: readonly Hint[] | null; set: GlyphSet | null; width: number; total: number; widths: number[] } = { hints: null, set: null, width: 0, total: 0, widths: [] };

export function drawHintBar(g: CanvasRenderingContext2D, t: number, shell: { shape: Frame; glyphs: GlyphSet | null; settings?: { hints: boolean } }, hints: readonly Hint[]) {
  const set = shell.glyphs;
  if (!set || shell.settings?.hints === false || !hints.length) return;
  const { design, safe } = shell.shape;
  const y = design.height - safe.bottom - 26;
  const width = design.width - safe.left - safe.right;
  const cx = safe.left + width / 2;
  if (measured.hints !== hints || measured.set !== set || measured.width !== width) {
    measured.hints = hints;
    measured.set = set;
    measured.width = width;
    measured.total = -GAP;
    measured.widths.length = 0;
    for (const hint of hints) {
      // Without a word, only the room its glyph takes in a chip.
      const w = hintWidth(g, hint.label ?? "", SIZE, hint.glyph, set) - (hint.label ? 0 : SIZE * 0.9);
      measured.widths.push(w);
      measured.total += GAP + w;
    }
  }
  if (measured.total > width - 16) {
    // Too narrow for words: the buttons alone, spread across it.
    const step = Math.min(72, width / (hints.length + 1));
    for (let i = 0; i < hints.length; i++) drawGlyph(g, hints[i].glyph, cx + (i - (hints.length - 1) / 2) * step, y, BARE, t, set);
    return;
  }
  let x = cx - measured.total / 2;
  for (let i = 0; i < hints.length; i++) {
    const hint = hints[i];
    if (hint.label) hintChip(g, x, y, hint.glyph, hint.label, t, SIZE, set);
    else drawGlyph(g, hint.glyph, x + measured.widths[i] / 2, y, BARE, t, set);
    x += measured.widths[i] + GAP;
  }
}
