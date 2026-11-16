// The frame: how many pixels the game renders, the shape of the screen they
// are shown on, and the units its menus and hints are laid out in.
//
// On the Apple TV it is what it has always been: 640×480, laid out for 16:9,
// the picture squeezed into the 4:3 buffer and stretched back out by the
// host, as a widescreen console game of the mid-2000s did. Everywhere else
// the frame takes the screen's shape with square pixels and the same number
// of them, so the pixels are as chunky for the size of the screen and the
// GPU fills as many. A 16:9 window is 740×416, a 4:3 one exactly 640×480, a
// phone held upright 376×816.

import { SAFE_AREA_PROPERTY } from "@fly/contracts";
import type { SafeArea } from "@fly/contracts";

/** The Apple TV's frame, and the shape of the screen it is shown on. */
export const TV_WIDTH = 640;
export const TV_HEIGHT = 480;
export const TV_ASPECT = 16 / 9;
/** How many pixels every frame has, about. */
export const PIXEL_BUDGET = TV_WIDTH * TV_HEIGHT;
/** The TV's overlays are laid out in these units: 16:9, as wide as the screen looks. */
export const TV_DESIGN_WIDTH = 854;
export const TV_DESIGN_HEIGHT = 480;
/** Elsewhere a design unit is the screen's shorter side over this many, and never smaller than a CSS pixel (a mouse's) or 1.25 (a finger's). */
export const DESIGN_SHORT = 480;
export const UNIT_FINE = 1;
export const UNIT_COARSE = 1.25;
/** The widest and tallest shapes the frame follows; past them the picture is stretched. */
const ASPECT_RANGE = [1 / 4, 4] as const;

export type Insets = { top: number; right: number; bottom: number; left: number };
const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

export type Frame = {
  /** The buffer the game renders, pixels. */
  width: number;
  height: number;
  /** The shape it is shown at, width over height. */
  aspect: number;
  /** The screen in design units, the overlays' coordinates. */
  design: { width: number; height: number };
  /** What notches, home indicators and rounded corners cover, design units in from each edge. */
  safe: Insets;
  /** Played with fingers: targets sized for them. */
  coarse: boolean;
  /** CSS pixels per design unit. */
  unit: number;
};

/** The Apple TV's frame. */
export const TV_FRAME: Frame = Object.freeze({
  width: TV_WIDTH,
  height: TV_HEIGHT,
  aspect: TV_ASPECT,
  design: Object.freeze({ width: TV_DESIGN_WIDTH, height: TV_DESIGN_HEIGHT }),
  safe: Object.freeze({ ...NO_INSETS }),
  coarse: false,
  unit: 1080 / TV_DESIGN_HEIGHT,
}) as Frame;

/** The frame for a screen `width` × `height` CSS pixels, with what its safe area leaves out (CSS pixels). */
export function frameFor(width: number, height: number, insets: Insets = NO_INSETS, coarse = false): Frame {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const aspect = Math.min(ASPECT_RANGE[1], Math.max(ASPECT_RANGE[0], w / h));
  const across = Math.max(2, Math.round(Math.sqrt(PIXEL_BUDGET * aspect)));
  const down = Math.max(2, Math.round(across / aspect));
  const unit = Math.max(coarse ? UNIT_COARSE : UNIT_FINE, Math.min(w, h) / DESIGN_SHORT);
  const inset = (n: number) => Math.max(0, Number.isFinite(n) ? n : 0) / unit;
  return {
    width: across,
    height: down,
    aspect: w / h,
    design: { width: w / unit, height: h / unit },
    safe: { top: inset(insets.top), right: inset(insets.right), bottom: inset(insets.bottom), left: inset(insets.left) },
    coarse,
    unit,
  };
}

/** Frame pixels per design unit, across and down. */
export const pixelsPerUnit = (frame: Frame) => ({ x: frame.width / frame.design.width, y: frame.height / frame.design.height });

/** How chunky the world's pixels are: its render size is the frame's over this (the menus stay crisp at the frame's). */
export const PIXEL_SIZES = { classic: 1, chunky: 2, chunkier: 3 } as const;
export type PixelSize = keyof typeof PIXEL_SIZES;

/** The world's render size at a pixel size: on the TV 640×480, 320×240 or 214×160. */
export function worldSize(frame: Frame, pixels: PixelSize) {
  const k = PIXEL_SIZES[pixels];
  return { width: Math.ceil(frame.width / k), height: Math.ceil(frame.height / k) };
}

/** Two frames the same, so nothing needs laying out again. */
export function sameFrame(a: Frame, b: Frame) {
  const near = (x: number, y: number) => Math.abs(x - y) < 1e-6;
  return (
    a.width === b.width &&
    a.height === b.height &&
    near(a.aspect, b.aspect) &&
    near(a.design.width, b.design.width) &&
    near(a.design.height, b.design.height) &&
    near(a.safe.top, b.safe.top) &&
    near(a.safe.right, b.safe.right) &&
    near(a.safe.bottom, b.safe.bottom) &&
    near(a.safe.left, b.safe.left) &&
    a.coarse === b.coarse
  );
}

/**
 * The screen the game is shown on. On the Apple TV it never changes. In a
 * browser the canvas fills the window (its CSS does that) and the frame
 * follows the window's shape; the safe area comes from the native host, if it
 * says (`SAFE_AREA_PROPERTY`), else from CSS `env(safe-area-inset-*)`.
 * Resizing is noticed at once but applied at the start of the next frame, so
 * a window being dragged is laid out once a frame, and never half-drawn.
 */
export class Display {
  frame: Frame;
  /** Counts the frame's changes, for the parts that follow it. */
  version = 0;
  #dirty = false;
  #probe: HTMLElement | null = null;
  #read: (() => Frame) | null = null;

  constructor(tv: boolean) {
    this.frame = TV_FRAME;
    if (tv || typeof document === "undefined" || typeof window === "undefined") return;
    const probe = document.createElement("div");
    // Lays nothing out and is never seen: it only turns the CSS environment's insets into numbers.
    probe.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
    document.body.appendChild(probe);
    this.#probe = probe;
    const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
    this.#read = () => frameFor(window.innerWidth, window.innerHeight, this.#insets(), coarse);
    this.frame = this.#read();
    const mark = () => {
      this.#dirty = true;
    };
    window.addEventListener("resize", mark);
    window.addEventListener("orientationchange", mark);
    window.visualViewport?.addEventListener("resize", mark);
  }

  #insets(): Insets {
    const host = (window as unknown as Record<string, unknown>)[SAFE_AREA_PROPERTY] as Partial<SafeArea> | undefined;
    if (host && typeof host === "object") return { top: host.top ?? 0, right: host.right ?? 0, bottom: host.bottom ?? 0, left: host.left ?? 0 };
    const style = this.#probe ? getComputedStyle(this.#probe) : null;
    if (!style) return NO_INSETS;
    return { top: parseFloat(style.paddingTop) || 0, right: parseFloat(style.paddingRight) || 0, bottom: parseFloat(style.paddingBottom) || 0, left: parseFloat(style.paddingLeft) || 0 };
  }

  /** Once a frame: true when the frame has changed shape since the last call. */
  update(): boolean {
    if (!this.#dirty || !this.#read) return false;
    this.#dirty = false;
    const next = this.#read();
    if (sameFrame(next, this.frame)) return false;
    this.frame = next;
    this.version++;
    return true;
  }
}
