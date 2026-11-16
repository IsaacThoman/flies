// The card beside a room's menu that a phone scans to join it: a QR code of
// the room's link, and its code under it for typing on another TV. No words
// besides the code. The QR code is drawn once per link into a small canvas, a
// module a pixel, and scaled up on whole pixels each time the menu is drawn:
// one drawImage, not a path of hundreds of squares, which the Apple TV's 2D
// canvas would pay for in every redraw.

import { INK, glassPanel, qrCode, roundedRect, text } from "@fly/ui";
import { pixelsPerUnit } from "../display.ts";
import type { Frame } from "../display.ts";
import type { RoomLayout } from "./layout.ts";

/** The light margin a scanner needs round a QR code, in its modules. */
const QUIET = 4;
/** Between the code's two halves, as a share of its size: read in two groups of five, typed as one. */
const HALVES_APART = 0.6;

export class RoomCard {
  #qr: { link: string; size: number; image: HTMLCanvasElement } | null = null;

  draw(g: CanvasRenderingContext2D, frame: Frame, layout: RoomLayout, room: { code: string; link: string }) {
    const { card, qr, code } = layout;
    glassPanel(g, card.x, card.y, card.w, card.h, 24);
    roundedRect(g, qr.x, qr.y, qr.w, qr.h, 10);
    g.fillStyle = "#ffffff";
    g.fill();
    const half = Math.ceil(room.code.length / 2);
    const apart = (code.size * HALVES_APART) / 2;
    text(g, room.code.slice(0, half), code.x - apart, code.y, { size: code.size, align: "right", color: INK });
    text(g, room.code.slice(half), code.x + apart, code.y, { size: code.size, align: "left", color: INK });
    const image = this.#image(room.link);
    if (!image) return;
    // Whole pixels a module, across and down (the TV's are wider than they are tall), so every module is as crisp as the next.
    const ppu = pixelsPerUnit(frame);
    const unit = Math.min(qr.w, qr.h) / (image.size + 2 * QUIET);
    const mx = Math.max(1, Math.floor(unit * ppu.x));
    const my = Math.max(1, Math.floor(unit * ppu.y));
    const x = Math.round((qr.x + qr.w / 2) * ppu.x - (image.size * mx) / 2);
    const y = Math.round((qr.y + qr.h / 2) * ppu.y - (image.size * my) / 2);
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = false;
    g.drawImage(image.image, x, y, image.size * mx, image.size * my);
    g.restore();
  }

  /** The QR code for a link, a module a pixel, in the menus' ink on white: made when the link is first shown. */
  #image(link: string) {
    if (this.#qr?.link === link) return this.#qr;
    this.#qr = null;
    const code = qrCode(link);
    if (!code || typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = code.size;
    const g = canvas.getContext("2d");
    if (!g) return null;
    const pixels = g.createImageData(code.size, code.size);
    const d = pixels.data;
    for (let i = 0; i < code.modules.length; i++) {
      const dark = code.modules[i] === 1;
      d[i * 4] = dark ? 0x0d : 0xff;
      d[i * 4 + 1] = dark ? 0x3b : 0xff;
      d[i * 4 + 2] = dark ? 0x66 : 0xff;
      d[i * 4 + 3] = 0xff;
    }
    g.putImageData(pixels, 0, 0);
    this.#qr = { link, size: code.size, image: canvas };
    return this.#qr;
  }
}
