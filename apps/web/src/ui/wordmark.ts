// The game's name as a glossy wordmark: "flies" in round white letters with
// a candy outline.

import { FONT } from "@fly/ui";

export function drawWordmark(g: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const word = "flies";
  g.save();
  g.font = `700 ${size}px ${FONT}`;
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  // A deep outline, then a lighter one, then the glossy face.
  g.lineJoin = "round";
  g.lineWidth = size * 0.22;
  g.strokeStyle = "rgba(0, 50, 110, 0.55)";
  g.strokeText(word, x, y + size * 0.06);
  g.lineWidth = size * 0.14;
  g.strokeStyle = "#1c8fe0";
  g.strokeText(word, x, y);
  const face = g.createLinearGradient(0, y - size * 0.75, 0, y);
  face.addColorStop(0, "#ffffff");
  face.addColorStop(0.55, "#f2fbff");
  face.addColorStop(1, "#bfe9ff");
  g.fillStyle = face;
  g.fillText(word, x, y);
  g.restore();
}
