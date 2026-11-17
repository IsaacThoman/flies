// These translucent diagrams illustrate the player's gesture, never the fly's
// behavior. They share the HUD texture and never touch the world or its senses.
import { drawGlyph } from "@fly/ui";
import type { GlyphSet } from "@fly/ui";
import { drawToolIcon } from "../tools/view.ts";
import type { ToolId } from "../tools/hands.ts";

const TAU = Math.PI * 2;
const DASH = [3, 4];
const SOLID: number[] = [];

/** A ghost finger landing, then a ring filling while it stays down. */
export function ghostPress(g: CanvasRenderingContext2D, x: number, y: number, t: number, hold: boolean) {
  const phase = t % 4;
  const down = phase > 0.7 && phase < (hold ? 2.8 : 1.2);
  const lift = down ? 0 : 9;
  g.strokeStyle = "rgba(255,255,255,0.9)";
  g.fillStyle = "rgba(170,226,255,0.25)";
  g.lineWidth = 2;
  g.beginPath();
  g.arc(x, y - lift, 7, 0, TAU);
  g.fill();
  g.stroke();
  g.beginPath();
  g.moveTo(x + 4, y + 5 - lift);
  g.lineTo(x + 11, y + 18 - lift);
  g.stroke();
  if (down) {
    g.beginPath();
    g.arc(x, y, 12, -Math.PI / 2, -Math.PI / 2 + TAU * (hold ? Math.min(1, (phase - 0.7) / 2) : 1));
    g.strokeStyle = "#ffcf70";
    g.stroke();
  }
}

/** A physical tool, a target ring, and the input that makes the tool act. */
export function drawDemonstration(g: CanvasRenderingContext2D, t: number, tool: ToolId, x: number, y: number, glyphs: GlyphSet | null) {
  const phase = t % 4;
  const active = phase > 0.7 && phase < 2.8;
  g.save();
  g.globalAlpha *= 0.65;
  g.strokeStyle = "#e4f8ff";
  g.lineWidth = 2;
  g.setLineDash(DASH);
  g.beginPath();
  g.ellipse(x, y + 12, 19, 6, 0, 0, TAU);
  g.stroke();
  g.setLineDash(SOLID);
  if (glyphs) drawGlyph(g, tool === "feather" || tool === "blow" ? "hold" : "select", x - 42, y + 2, 27, t, glyphs);
  else ghostPress(g, x - 36, y, t, tool === "feather" || tool === "blow");
  if (tool === "feed") {
    const fall = Math.max(0, Math.min(1, (phase - 0.7) / 0.6));
    g.fillStyle = "#fffaf0";
    g.strokeStyle = "#91c6df";
    g.fillRect(x - 5, y - 34 + fall * 40, 10, 10);
    g.strokeRect(x - 5, y - 34 + fall * 40, 10, 10);
  } else if (tool === "swoop") {
    const travel = Math.max(0, Math.min(1, (phase - 0.7) / 1.4));
    drawToolIcon(g, tool, x + 45 * (1 - travel), y - 32 * Math.sin(travel * Math.PI), 11);
  } else if (tool === "feather") {
    drawToolIcon(g, tool, x + (active ? Math.sin(t * 8) * 10 : 0), y - 12, 17);
  } else if (tool === "blow") {
    drawToolIcon(g, tool, x - 1, y - 12, 16);
    if (active) {
      g.strokeStyle = "#e6faff";
      for (let i = 0; i < 3; i++) {
        const drift = (t * 23 + i * 9) % 30;
        g.beginPath();
        g.moveTo(x + drift - 14, y + i * 4);
        g.lineTo(x + drift - 5, y + i * 4);
        g.stroke();
      }
    }
  }
  g.restore();
}
