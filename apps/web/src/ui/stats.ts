// The frame-cost corner (Settings → Picture → Frame stats): draws, triangles, JavaScript
// time per frame and the eyes' cost, for tuning on the TV.

import { text } from "@fly/ui";

type Measured = {
  stage: { cost: { calls: number; triangles: number } };
  frameMsAverage: number;
  eyes: { costMs: number; costCalls: number; active: boolean };
};

/** Drawn with its right edge and baseline at (x, y): the bottom right of the safe area. */
export function drawStats(g: CanvasRenderingContext2D, game: Measured, x: number, y: number) {
  const { calls, triangles } = game.stage.cost;
  const eyes = game.eyes.active ? ` · eyes ${game.eyes.costCalls} draws ${game.eyes.costMs.toFixed(1)} ms` : "";
  const line = `${calls} draws · ${(triangles / 1000).toFixed(0)}k tris · ${game.frameMsAverage.toFixed(1)} ms JS${eyes}`;
  text(g, line, x, y, { size: 11, align: "right", color: "#ffffff", outline: "rgba(0,0,0,0.6)", outlineWidth: 3 });
}
