// The frame-cost corner (Settings → Picture → Frame stats): draws, triangles, JavaScript
// time per frame and the eyes' cost, for tuning on the TV.

import { text } from "@fly/ui";
import { DESIGN_WIDTH } from "../display.ts";

type Measured = {
  stage: { cost: { calls: number; triangles: number } };
  frameMsAverage: number;
  eyes: { costMs: number; costCalls: number; active: boolean };
};

export function drawStats(g: CanvasRenderingContext2D, game: Measured) {
  const { calls, triangles } = game.stage.cost;
  const eyes = game.eyes.active ? ` · eyes ${game.eyes.costCalls} draws ${game.eyes.costMs.toFixed(1)} ms` : "";
  const line = `${calls} draws · ${(triangles / 1000).toFixed(0)}k tris · ${game.frameMsAverage.toFixed(1)} ms JS${eyes}`;
  text(g, line, DESIGN_WIDTH - 10, 470, { size: 11, align: "right", color: "#ffffff", outline: "rgba(0,0,0,0.6)", outlineWidth: 3 });
}
