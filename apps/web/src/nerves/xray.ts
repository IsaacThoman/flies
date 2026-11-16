// When the fly is drawn as glass with its nervous system glowing inside. The
// player asks for it in Settings (off, in the wallpaper, always) or for the
// moment with View → Inside it, which also brings the camera in close. Then
// it shows as far as the fly is big enough on screen to see inside: its
// brain is about a quarter of its length, and with the fly much under 100
// pixels long it is a smudge of a few pixels, so the fly eases back to its
// ordinary self as it gets that small (a wide shot, the whole table), and
// back to glass as the camera comes in.

import type * as THREE from "three";
import type { ShowWhen } from "../settings.ts";

/** The fly's length on screen, in the world's pixels, from which the X-ray starts to show and by which it is all there. */
export const XRAY_PIXELS = { from: 60, full: 110 } as const;
/** Seconds the X-ray takes to come and go. */
const EASE = 0.35;

/** Whether it is asked for now: by the setting, or by the View tool while playing. */
export function xrayWanted(setting: ShowWhen, screen: string, wallpaper: boolean, insideView: boolean): boolean {
  if (screen === "loading") return false;
  if (insideView && screen === "play" && !wallpaper) return true;
  return setting === "always" || (setting === "wallpaper" && wallpaper);
}

/** How much of it to show for a fly `pixels` long on screen. */
export function xrayForSize(pixels: number): number {
  const t = Math.min(1, Math.max(0, (pixels - XRAY_PIXELS.from) / (XRAY_PIXELS.full - XRAY_PIXELS.from)));
  return t * t * (3 - 2 * t);
}

/** How many of the world's pixels a thing `length` long at `at` spans on screen, seen by `camera` in a world `rows` pixels high. */
export function pixelsLong(camera: THREE.PerspectiveCamera, at: THREE.Vector3, length: number, rows: number): number {
  const distance = Math.max(1e-6, camera.position.distanceTo(at));
  return (length / (2 * distance * Math.tan((camera.fov * Math.PI) / 360))) * rows;
}

export class Xray {
  /** 0 to 1, as the fly is drawn now. */
  amount = 0;

  update(dt: number, wanted: boolean, pixels: number) {
    const target = wanted ? xrayForSize(pixels) : 0;
    const k = 1 - Math.exp(-dt / EASE);
    this.amount += (target - this.amount) * k;
    // Exactly the ordinary fly once it has all but gone, so it costs nothing.
    if (target === 0 && this.amount < 0.01) this.amount = 0;
  }
}
