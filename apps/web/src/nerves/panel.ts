// Its nervous system, small in a corner: the same drawing as the X-ray, seen
// from above with the head up and the fly's left on the left, standing at
// rest so that it holds still, glowing from the same array. For when the fly
// is too small on screen to see inside it, and to read the flow at a glance:
// light coming in at the eyes and moving inward, a command going down the
// neck into the cord and out to the legs and wings.
//
// One draw: the fly's own nervous system geometry, whose first two triangles
// are the panel's backdrop (the glass and its label, a small canvas drawn
// with the menu kit), placed in the frame by the panel's shader. It is drawn
// with the overlay, under the menus and hints, and fades by itself, as what it
// sees does. It is the second picture in the corner (ui/corners.ts): under
// what it sees (over it, at the bottom), or, on a screen too short for that,
// beside it; at the corner itself when what it sees isn't there.

import * as THREE from "three";
import { createNervesPanelMaterial } from "@fly/fly";
import type { FlyNervesModel, NervesPanelUniforms } from "@fly/fly";
import { glassPanel, roundedRect, text } from "@fly/ui";
import { TV_FRAME, pixelsPerUnit } from "../display.ts";
import type { Frame } from "../display.ts";
import { INSET_PANEL, insetLayout } from "../eyes/inset.ts";
import type { ShowWhen } from "../settings.ts";
import { CORNERS, CornerPlacement } from "../ui/corners.ts";
import type { Corner, CornerDeck, CornerWanted } from "../ui/corners.ts";
import { hudLayout, safeRect } from "../ui/layout.ts";
import type { HudLayout } from "../ui/layout.ts";

/**
 * What the picture shows, in the fly's own units (body lengths): across, the
 * brain from eye to eye, the nerves leaving the picture's sides into the
 * legs; down, from the antennae to the end of the cord.
 */
export const NERVES_VIEW = { halfWidth: 0.16, top: 0.53, bottom: 0.05 };
/** Design units per body length in the picture, at full size. */
const SCALE = 350;
/** The picture in the panel, and the panel, design units at full size. */
export const NERVES_PICTURE = { x: 10, y: 27, width: Math.round(2 * NERVES_VIEW.halfWidth * SCALE), height: Math.round((NERVES_VIEW.top - NERVES_VIEW.bottom) * SCALE) };
export const NERVES_PANEL = { width: NERVES_PICTURE.width + 20, height: NERVES_PICTURE.y + NERVES_PICTURE.height + 10, radius: 14 };
const LABEL = { x: 12, y: 19, size: 12, color: "#eaf6ff" };
/** Between it and what it sees, design units. */
const GAP = 8;
/** Below this share of its full size under what it sees, it goes beside it instead. */
const SMALLEST_UNDER = 0.6;

type Rect = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };

export type NervesLayout = {
  /** Its size, as a share of the full size. */
  scale: number;
  /** Beside what it sees, rather than under (or over) it. */
  across: boolean;
  /** At each corner: alone there, and next to what it sees. */
  rects: Record<Corner, [Rect, Rect]>;
  origins: Record<Corner, [Point, Point]>;
  panel: { width: number; height: number };
  ppu: { x: number; y: number };
};

/**
 * Where it goes at each corner, from what it sees's own layout: in the same
 * room down the screen's side (clear of the caption, the shelf and the
 * label, and, while playing, of the hint at the bottom right), as big as
 * what it sees would be at its width, and smaller if it must be to fit.
 */
export function nervesLayout(frame: Frame, hud: HudLayout = hudLayout(frame)): NervesLayout {
  const a = safeRect(frame);
  const eyes = insetLayout(frame, hud);
  const { margin } = INSET_PANEL;
  const { width: W, height: H } = NERVES_PANEL;
  const top = eyes.rects["top-right"].y;
  const foot = Math.min(eyes.rects["bottom-right"].y + eyes.rects["bottom-right"].height, hud.rightY - 20);
  const eyesHeight = eyes.rects["top-right"].height, eyesWidth = eyes.rects["top-right"].width;
  const full = Math.min(1, (a.w * 0.42) / W);
  const under = Math.min(full, Math.min(foot - (top + eyesHeight + GAP), eyes.rects["bottom-right"].y - GAP - top) / H);
  // Beside it, toward the middle: clear of the caption if they are level with it.
  const level = top < hud.captionY + 20;
  const sideRoom = a.w / 2 - margin - eyesWidth - GAP - (level ? 120 : 0);
  const beside = Math.min(full, (foot - top) / H, sideRoom / W);
  const across = under < SMALLEST_UNDER && beside > under;
  const scale = Math.max(0.05, across ? beside : under);
  const width = W * scale, height = H * scale;
  const ppu = pixelsPerUnit(frame);
  const rects = {} as NervesLayout["rects"];
  const origins = {} as NervesLayout["origins"];
  const at = (r: Rect): Point => ({ x: Math.round(r.x * ppu.x), y: Math.round(r.y * ppu.y) });
  for (const c of CORNERS) {
    const left = c.endsWith("left"), up = c.startsWith("top");
    const e = eyes.rects[c];
    const alone = { x: left ? a.x + margin : a.x + a.w - margin - width, y: up ? top : foot - height, width, height };
    const next = across
      ? { x: left ? e.x + e.width + GAP : e.x - GAP - width, y: up ? top : foot - height, width, height }
      : { x: alone.x, y: up ? e.y + e.height + GAP : e.y - GAP - height, width, height };
    rects[c] = [alone, next];
    origins[c] = [at(alone), at(next)];
  }
  return { scale, across, rects, origins, panel: { width: Math.round(width * ppu.x), height: Math.round(height * ppu.y) }, ppu };
}

/**
 * Whether it should be up: as what it sees, only in play, never over a menu or
 * the full picture through its eyes.
 */
export function nervesWanted(setting: ShowWhen, screen: string, wallpaper: boolean, fullPicture: boolean): CornerWanted {
  if (setting === "off" || screen !== "play" || fullPicture) return "hide";
  return setting === "always" || wallpaper ? "show" : "fade";
}

/** Its place in the corner: next to what it sees, when that is wanted there too. */
export const nervesSlot = (eyes: CornerWanted) => (eyes === "show" ? 1 : 0);

export class NervesPanel {
  readonly placement = new CornerPlacement();
  /** Drawn with the overlay (the game adds it to the overlay's scene), before the menus and hints. */
  readonly mesh: THREE.Mesh;
  readonly #uniforms: NervesPanelUniforms;
  readonly #canvas: HTMLCanvasElement;
  #texture: THREE.CanvasTexture;
  #layout: NervesLayout = nervesLayout(TV_FRAME);

  constructor(nerves: FlyNervesModel) {
    this.#canvas = document.createElement("canvas");
    this.#texture = this.#makeTexture();
    this.#uniforms = {
      uFrame: { value: new THREE.Vector2(TV_FRAME.width, TV_FRAME.height) },
      uPanel: { value: new THREE.Vector4() },
      uView: { value: new THREE.Vector4() },
      uPicture: { value: new THREE.Vector4() },
      uBackdrop: { value: this.#texture },
      uAlpha: { value: 0 },
    };
    const material = createNervesPanelMaterial(nerves.glowUniform, nerves.rest, this.#uniforms);
    this.mesh = new THREE.Mesh(nerves.geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    // Under the overlay's quad: both are in the transparent list, drawn in this order.
    this.mesh.renderOrder = -1;
    this.layout(TV_FRAME, hudLayout(TV_FRAME));
  }

  /** The screen changed shape: its size and corners follow, and its glass is drawn again. */
  layout(frame: Frame, hud: HudLayout) {
    const layout = nervesLayout(frame, hud);
    this.#layout = layout;
    const { width, height } = layout.panel;
    if (this.#canvas.width !== width || this.#canvas.height !== height) {
      this.#canvas.width = width;
      this.#canvas.height = height;
      // A texture's storage is its first size: a new one for the new size.
      this.#texture.dispose();
      this.#texture = this.#makeTexture();
      this.#uniforms.uBackdrop.value = this.#texture;
    }
    const k = layout.scale, { x: px, y: py } = layout.ppu, p = NERVES_PICTURE;
    this.#uniforms.uFrame.value.set(frame.width, frame.height);
    this.#uniforms.uPanel.value.set(0, 0, width, height);
    this.#uniforms.uView.value.set((p.x + p.width / 2) * k * px, (p.y + NERVES_VIEW.top * SCALE) * k * py, SCALE * k * px, SCALE * k * py);
    this.#uniforms.uPicture.value.set(p.x * k * px, p.y * k * py, (p.x + p.width) * k * px, (p.y + p.height) * k * py);
    this.#draw();
  }

  /** Where it is: its corner, or "hidden". */
  get state(): Corner | "hidden" {
    return this.mesh.visible ? this.placement.corner : "hidden";
  }

  /** Once a frame, after the corner deck, with its place there (nervesSlot). */
  update(dt: number, wanted: CornerWanted, deck: CornerDeck, slot: number) {
    this.placement.update(dt, wanted, deck.goal, slot);
    this.mesh.visible = this.placement.alpha > 0;
    if (!this.mesh.visible) return;
    this.#uniforms.uAlpha.value = this.placement.alpha;
    const origin = this.#layout.origins[this.placement.corner][this.placement.slot];
    const panel = this.#uniforms.uPanel.value;
    panel.x = origin.x;
    panel.y = origin.y;
  }

  #makeTexture() {
    const texture = new THREE.CanvasTexture(this.#canvas);
    // Texel for pixel: the panel is placed on whole pixels.
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    return texture;
  }

  /** The glass and the label, drawn in the panel's own design units at its size. */
  #draw() {
    const g = this.#canvas.getContext("2d");
    if (!g) throw new Error("No 2D canvas for the nervous system's panel");
    const { panel, ppu, scale: k } = this.#layout;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, panel.width, panel.height);
    g.setTransform(ppu.x * k, 0, 0, ppu.y * k, 0, 0);
    const { width, height, radius } = NERVES_PANEL;
    glassPanel(g, 1, 1, width - 2, height - 2, radius, { tint: "night", shadow: false });
    const p = NERVES_PICTURE;
    roundedRect(g, p.x - 2, p.y - 2, p.width + 4, p.height + 4, 6);
    g.fillStyle = "rgba(0, 16, 50, 0.5)";
    g.fill();
    text(g, "Its nervous system", LABEL.x, LABEL.y, { size: LABEL.size, color: LABEL.color });
    this.#texture.needsUpdate = true;
  }
}
