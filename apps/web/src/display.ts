// The 640×480 frame. The game always renders this many pixels and lays them
// out for a 16:9 screen: the picture is squeezed into the 4:3 buffer and
// stretched back out by the display (the TV host, or the canvas's CSS size in
// a browser), as a widescreen console game of the mid-2000s did.

export const RENDER_WIDTH = 640;
export const RENDER_HEIGHT = 480;
/** The shape of the screen the frame is shown on. */
export const DISPLAY_ASPECT = 16 / 9;
/** Overlays are laid out in these units: 16:9, as wide as the screen looks. */
export const DESIGN_WIDTH = 854;
export const DESIGN_HEIGHT = 480;

/** How chunky the world's pixels are: its render size (the menus stay at 640×480). */
export const PIXEL_SIZES = {
  classic: { width: 640, height: 480 },
  chunky: { width: 320, height: 240 },
  chunkier: { width: 214, height: 160 },
} as const;
export type PixelSize = keyof typeof PIXEL_SIZES;

/** In a browser: shows the canvas as the largest 16:9 picture that fits the window, with crisp pixels. */
export function fitCanvas(canvas: HTMLCanvasElement) {
  if (!canvas.style) return;
  const fit = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const width = Math.min(w, h * DISPLAY_ASPECT);
    const height = width / DISPLAY_ASPECT;
    canvas.style.width = `${Math.round(width)}px`;
    canvas.style.height = `${Math.round(height)}px`;
    canvas.style.marginLeft = `${Math.round((w - width) / 2)}px`;
    canvas.style.marginTop = `${Math.round((h - height) / 2)}px`;
  };
  fit();
  window.addEventListener("resize", fit);
}
