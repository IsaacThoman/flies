import assert from "node:assert/strict";
import { test } from "node:test";
import { createPicnic } from "@fly/world";
import { HitMap } from "@fly/ui";
import { frameFor } from "../src/display.ts";
import { Hands, TOOLS } from "../src/tools/hands.ts";
import { drawHud, needsTeaching } from "../src/ui/hud.ts";
import type { HudState } from "../src/ui/hud.ts";
import { hudLayout, safeRect } from "../src/ui/layout.ts";
import { blankCanvas, writtenOn } from "./canvas.ts";

test("wordless world-tool hints clear touch controls and exploration progress at every touch size", () => {
  for (const [w, h] of [[390, 844], [844, 390], [430, 932], [932, 430], [820, 1180], [1180, 820], [507, 820], [375, 820]]) {
    const frame = frameFor(w, h, { top: h > w ? 59 : 0, bottom: 34, left: h > w ? 0 : 59, right: h > w ? 0 : 59 }, true);
    const layout = hudLayout(frame);
    const safe = safeRect(frame);
    const hands = new Hands(createPicnic());
    for (const id of ["feed", "swoop", "feather", "blow"]) for (const brainRunning of [true, false]) for (const aim of [-1000, 10000]) {
      hands.tool = TOOLS.findIndex(tool => tool.id === id);
      const s: HudState = { hands, here: "picnic", activity: brainRunning ? "resting" : "waiting", food: null, hints: true, glyphs: null, learned: {}, teachSwipe: false, changed: 1, brainRunning, eyes: null, layout, aimX: aim, aimY: aim, arrival: { phase: "download", progress: 0.5, source: { received: 4e6, total: 8e6 } } as HudState["arrival"] };
      const g = blankCanvas();
      let diagram: { x: number; y: number } | null = null;
      g.ellipse = (x, y, rx, ry) => { if (rx === 19 && ry === 6) diagram = { x, y: y - 12 }; };
      const hits = new HitMap();
      drawHud(g, 1, s, hits);
      assert.ok(diagram, `${w}×${h}: ${id} still has its teaching drawing`);
      const { x, y } = diagram as { x: number; y: number };
      // Bounds include the target, moving tool and ghost finger throughout a cycle.
      const bounds = { x: x - 60, y: y - 40, w: 120, h: 72 };
      assert.ok(bounds.x >= safe.x && bounds.x + bounds.w <= safe.x + safe.w && bounds.y >= safe.y && bounds.y + bounds.h <= safe.y + safe.h);
      assert.ok(bounds.y + bounds.h < (layout.touch?.labelY ?? layout.labelY) - 17, "the diagram clears the pending icon pill, including tools without label hit targets");
      for (let i = 0; i < hits.count; i++) {
        const hit = hits.get(i)!;
        const overlaps = bounds.x < hit.x + hit.w && hit.x < bounds.x + bounds.w && bounds.y < hit.y + hit.h && hit.y < bounds.y + bounds.h;
        assert.equal(overlaps, false, `${w}×${h}: ${id} diagram covers ${hit.kind}`);
      }
      if (!brainRunning) {
        assert.ok(writtenOn(g).some(word => word.text === "4.0 / 8.0 MB"), "the exploration progress remains visible");
        assert.ok(bounds.y > layout.captionY + 55, "the diagram clears the progress bar and byte count");
      }
    }
  }
});

test("a real HUD press temporarily replaces the button gesture without retiring its lesson", () => {
  const hands = new Hands(createPicnic());
  const s: HudState = { hands, here: "picnic", activity: "resting", food: null, hints: true, glyphs: null, learned: {}, teachSwipe: false, changed: 1, brainRunning: true, eyes: null, layout: hudLayout(frameFor(390, 844, { top: 59, bottom: 34, left: 0, right: 0 }, true)) };
  for (const id of ["light", "weather", "view", "place"]) {
    hands.tool = TOOLS.findIndex(tool => tool.id === id);
    const draw = () => {
      const g = blankCanvas();
      let paths = 0;
      g.beginPath = () => { paths++; };
      const hits = new HitMap();
      drawHud(g, 1, s, hits);
      return { paths, hit: hits.get(0)! };
    };
    const teaching = draw();
    s.pressed = teaching.hit;
    assert.ok(draw().paths < teaching.paths, `${id}: the teaching finger yields to the real press`);
    assert.equal(needsTeaching(s), true, "a preview does not complete the lesson");
    s.pressed = null;
    assert.equal(draw().paths, teaching.paths, "cancellation restores the unfinished gesture");
  }
});
