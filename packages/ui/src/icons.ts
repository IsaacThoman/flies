// Small pictures for the menus' buttons and rows: what each is, seen before
// its word is read. Lines and fills in one colour, drawn inside a circle of
// radius `r` about (x, y), so they sit on a button's glass in its ink, or in
// white on a lit one.

import { TAU } from "./draw.ts";

type Ctx = CanvasRenderingContext2D;

export type Icon = "play" | "watch" | "settings" | "online" | "journal" | "about" | "add" | "home" | "share" | "rooms" | "remove" | "lock" | "check";

export function drawIcon(g: Ctx, icon: Icon, x: number, y: number, r: number, color: string) {
  g.save();
  g.translate(x, y);
  g.fillStyle = color;
  g.strokeStyle = color;
  g.lineWidth = Math.max(1.4, r * 0.2);
  g.lineCap = "round";
  g.lineJoin = "round";
  g.beginPath();
  switch (icon) {
    case "play":
      g.moveTo(-r * 0.5, -r * 0.75);
      g.lineTo(r * 0.8, 0);
      g.lineTo(-r * 0.5, r * 0.75);
      g.closePath();
      g.fill();
      g.stroke();
      break;
    case "watch":
      // An eye: the screensaver is for watching.
      g.moveTo(-r, 0);
      g.quadraticCurveTo(0, -r * 1.05, r, 0);
      g.quadraticCurveTo(0, r * 1.05, -r, 0);
      g.stroke();
      g.beginPath();
      g.arc(0, 0, r * 0.32, 0, TAU);
      g.fill();
      break;
    case "settings":
      // Three sliders, each with its knob somewhere else.
      for (let i = -1; i <= 1; i++) {
        g.moveTo(-r * 0.9, i * r * 0.62);
        g.lineTo(r * 0.9, i * r * 0.62);
      }
      g.stroke();
      for (let i = -1; i <= 1; i++) {
        g.beginPath();
        g.arc(i === 0 ? -r * 0.35 : r * 0.35, i * r * 0.62, r * 0.26, 0, TAU);
        g.fill();
      }
      break;
    case "online":
      // A globe: its equator and a meridian.
      g.arc(0, 0, r * 0.92, 0, TAU);
      g.moveTo(-r * 0.92, 0);
      g.lineTo(r * 0.92, 0);
      g.moveTo(0, -r * 0.92);
      g.ellipse(0, 0, r * 0.42, r * 0.92, 0, -Math.PI / 2, Math.PI * 1.5);
      g.stroke();
      break;
    case "journal":
      // A picture in its frame: a hill and the sun over it.
      g.moveTo(-r * 0.9, -r * 0.7);
      g.lineTo(r * 0.9, -r * 0.7);
      g.lineTo(r * 0.9, r * 0.7);
      g.lineTo(-r * 0.9, r * 0.7);
      g.closePath();
      g.moveTo(-r * 0.9, r * 0.45);
      g.lineTo(-r * 0.2, -r * 0.1);
      g.lineTo(r * 0.3, r * 0.3);
      g.lineTo(r * 0.55, r * 0.1);
      g.lineTo(r * 0.9, r * 0.4);
      g.stroke();
      g.beginPath();
      g.arc(r * 0.4, -r * 0.3, r * 0.16, 0, TAU);
      g.fill();
      break;
    case "about":
      g.arc(0, 0, r * 0.92, 0, TAU);
      g.moveTo(0, -r * 0.08);
      g.lineTo(0, r * 0.48);
      g.stroke();
      g.beginPath();
      g.arc(0, -r * 0.46, r * 0.13, 0, TAU);
      g.fill();
      break;
    case "add":
      g.moveTo(-r * 0.75, 0);
      g.lineTo(r * 0.75, 0);
      g.moveTo(0, -r * 0.75);
      g.lineTo(0, r * 0.75);
      g.stroke();
      break;
    case "home":
      g.moveTo(-r, -r * 0.05);
      g.lineTo(0, -r * 0.9);
      g.lineTo(r, -r * 0.05);
      g.moveTo(-r * 0.68, -r * 0.2);
      g.lineTo(-r * 0.68, r * 0.8);
      g.lineTo(r * 0.68, r * 0.8);
      g.lineTo(r * 0.68, -r * 0.2);
      g.stroke();
      break;
    case "share":
      // An arrow up out of a tray: handing something on.
      g.moveTo(0, r * 0.3);
      g.lineTo(0, -r * 0.9);
      g.moveTo(-r * 0.42, -r * 0.48);
      g.lineTo(0, -r * 0.9);
      g.lineTo(r * 0.42, -r * 0.48);
      g.moveTo(-r * 0.8, -r * 0.05);
      g.lineTo(-r * 0.8, r * 0.85);
      g.lineTo(r * 0.8, r * 0.85);
      g.lineTo(r * 0.8, -r * 0.05);
      g.stroke();
      break;
    case "rooms":
      // A list: a dot and a line, three times.
      for (let i = -1; i <= 1; i++) {
        g.moveTo(-r * 0.3, i * r * 0.62);
        g.lineTo(r * 0.9, i * r * 0.62);
      }
      g.stroke();
      for (let i = -1; i <= 1; i++) {
        g.beginPath();
        g.arc(-r * 0.78, i * r * 0.62, r * 0.14, 0, TAU);
        g.fill();
      }
      break;
    case "remove":
      g.moveTo(-r * 0.6, -r * 0.6);
      g.lineTo(r * 0.6, r * 0.6);
      g.moveTo(r * 0.6, -r * 0.6);
      g.lineTo(-r * 0.6, r * 0.6);
      g.stroke();
      break;
    case "lock":
      g.arc(0, -r * 0.2, r * 0.42, Math.PI, 0);
      g.stroke();
      g.beginPath();
      g.rect(-r * 0.7, -r * 0.15, r * 1.4, r);
      g.fill();
      break;
    case "check":
      g.moveTo(-r * 0.7, 0);
      g.lineTo(-r * 0.2, r * 0.55);
      g.lineTo(r * 0.75, -r * 0.55);
      g.stroke();
      break;
  }
  g.restore();
}
