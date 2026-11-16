// The game's name as a glossy wordmark: "flies" in round white letters with
// a candy outline, and a little fly circling it.

import { FONT, TAU } from "@fly/ui";

export function drawWordmark(g: CanvasRenderingContext2D, x: number, y: number, size: number, t: number) {
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
  const reach = g.measureText(word).width * 0.56;
  g.restore();
  // A tiny fly orbiting the word.
  const a = t * 0.9;
  const fx = x + Math.cos(a) * reach;
  const fy = y - size * 0.95 + Math.sin(a * 2) * size * 0.12;
  g.save();
  g.translate(fx, fy);
  g.fillStyle = "rgba(255,255,255,0.75)";
  const flap = Math.sin(t * 40) * 0.3;
  for (const side of [-1, 1]) {
    g.beginPath();
    g.ellipse(side * size * 0.07, -size * 0.06, size * 0.09, size * 0.045, side * (0.5 + flap), 0, TAU);
    g.fill();
  }
  g.fillStyle = "#6b4a2a";
  g.beginPath();
  g.ellipse(0, 0, size * 0.09, size * 0.06, 0, 0, TAU);
  g.fill();
  g.fillStyle = "#e5262e";
  g.beginPath();
  g.arc(size * 0.08, -size * 0.01, size * 0.035, 0, TAU);
  g.fill();
  g.restore();
}
