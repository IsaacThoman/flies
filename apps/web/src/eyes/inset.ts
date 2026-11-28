// What its eyes see, small in a corner over the camera's picture, so the
// wallpaper shows the fly and what it sees at once. The same facets as View →
// Fly's eyes (eyes.ts) in the same proportions, left eye on the left, and
// labelled for what it is: what the brain is being sent, or else a picture.
//
// One draw: an instanced quad whose first instance is the glass panel (a
// small canvas drawn with the menu kit) and the rest a dot for each facet,
// snapped to the frame's pixels so it stays crisp in a chunky frame. It is
// drawn with the overlay, under the menus and hints, but fades by itself:
// the wallpaper fades those out, and this is meant to stay. On a narrow
// screen it is smaller, and its top corners are under the caption.
//
// It is the first picture in its corner; where the corner is, and how it
// keeps moving so that it never burns into a screen, is ui/corners.ts.

import * as THREE from "three";
import type { EyeMap } from "@fly/brain";
import { glassPanel, roundedRect, text } from "@fly/ui";
import { TV_DESIGN_HEIGHT, TV_DESIGN_WIDTH, TV_FRAME, pixelsPerUnit } from "../display.ts";
import type { Frame } from "../display.ts";
import type { ShowWhen } from "../settings.ts";
import { CORNERS, CornerPlacement } from "../ui/corners.ts";
import type { Corner, CornerDeck, CornerWanted } from "../ui/corners.ts";
import { hudLayout, safeRect } from "../ui/layout.ts";
import type { HudLayout } from "../ui/layout.ts";
import { FACET_COLOR, PICTURE_LAYOUT } from "./eyes.ts";
import type { Eyes } from "./eyes.ts";

/** The panel, in design units (as the overlay), at its full size: about a fifth of the TV's width. */
export const INSET_PANEL = { width: 176, height: 92, radius: 14, margin: 16 };
/** Where the dots go in the panel, and the label over them (design units). */
export const INSET_PICTURE = { x: 10, y: 27, width: 156, height: 56 };
const LABEL = { x: 12, y: 19, size: 12, color: "#eaf6ff" };
/** A facet's dot, in frame pixels, and the widest it gets toward the poles. */
const DOT = 3;
const DOT_WIDEST = 8;

/** Its size and corners on a screen: in design units, and in the frame's whole pixels (so the panel's texels and the dots land on pixels). */
export type InsetLayout = {
  /** Its size, as a share of the full size. */
  scale: number;
  rects: Record<Corner, { x: number; y: number; width: number; height: number }>;
  origins: Record<Corner, { x: number; y: number }>;
  panel: { width: number; height: number };
  /** Frame pixels per design unit. */
  ppu: { x: number; y: number };
};

/**
 * The most a picture in a corner may be, as a share of its full size, at a
 * size from Settings (1 is the full size): that size, but at most about two
 * fifths of the safe area's width at the full size, and half of it larger,
 * so that there is room across the screen for the stats.
 */
export const cornerScale = (a: { w: number }, width: number, size: number) => Math.min(size, (a.w * Math.min(0.5, 0.42 * size)) / width);

/**
 * Where its corners are: in from the safe area's edges, clear of the caption
 * at the top (under it, on a screen too narrow to sit beside it) and of the
 * shelf and the tool's label at the bottom (over them, where the shelf runs
 * under the corner), so the one it keeps to while playing covers nothing.
 * `size` is Settings' (OVERLAY_SIZES).
 */
export function insetLayout(frame: Frame, hud: HudLayout = hudLayout(frame), size = 1): InsetLayout {
  const a = safeRect(frame);
  const { margin } = INSET_PANEL;
  let scale = cornerScale(a, INSET_PANEL.width, size);
  // Larger, on a short screen it would reach the hint at the bottom right while playing.
  const beside = (width: number) => a.w / 2 - 120 - margin - 8 >= width;
  scale = Math.min(scale, ((hud.reserveHints ? hud.rightY - 15 : hud.labelY - 25) - (beside(INSET_PANEL.width * scale) ? a.y + margin : hud.captionY + 23)) / INSET_PANEL.height);
  const width = INSET_PANEL.width * scale;
  const height = INSET_PANEL.height * scale;
  const top = beside(width) ? a.y + margin : hud.captionY + 23;
  const under = hud.footLeft > a.x + margin + width;
  const bottom = under ? a.y + a.h - margin - height : hud.labelY - 25 - height;
  const ppu = pixelsPerUnit(frame);
  const rects = {} as InsetLayout["rects"];
  const origins = {} as InsetLayout["origins"];
  for (const c of CORNERS) {
    const r = { x: c.endsWith("left") ? a.x + margin : a.x + a.w - margin - width, y: c.startsWith("top") ? top : bottom, width, height };
    rects[c] = r;
    origins[c] = { x: Math.round(r.x * ppu.x), y: Math.round(r.y * ppu.y) };
  }
  return { scale, rects, origins, panel: { width: Math.round(width * ppu.x), height: Math.round(height * ppu.y) }, ppu };
}

/** The panel's place at a corner, in design units. */
export function insetRect(corner: Corner, frame: Frame = TV_FRAME) {
  return insetLayout(frame).rects[corner];
}

/**
 * Whether it should be up. Never on the loading screen, the title or a menu,
 * nor while the full picture is up (the same picture, large). Those go at
 * once, as the overlay changes at once; when the controls come back and it is
 * only wanted in the wallpaper, it fades with them.
 *
 * With the eyes off in Settings it doesn't show. That setting is how the TV is
 * spared the eyes' cost (some 45 draws and a read-back every refresh), and
 * rendering them for this picture alone would bring the cost back unasked;
 * the picture would no longer be what the brain is sent, either. (A brain
 * without eyes still gets the picture: its eyes are rendered for it alone,
 * and it is labelled as a picture.)
 */
export function insetWanted(setting: ShowWhen, screen: string, wallpaper: boolean, fullPicture: boolean, eyesOff: boolean): CornerWanted {
  if (setting === "off" || screen !== "play" || fullPicture || eyesOff) return "hide";
  return setting === "always" || wallpaper ? "show" : "fade";
}

/**
 * Each facet's dot as an instance offset (x, y: its top left in frame
 * pixels from the panel's; z: 0 the left eye, 1 the right, 2 the panel; w:
 * its width), after a first instance for the panel itself. Placed as the full
 * picture places them, scaled to fill the inset's picture. Toward the top and
 * bottom, where a degree of azimuth spans less of the view, the facets spread
 * apart across the picture, and at this size the gaps read as noise; so each
 * dot is as wide as its facet's share of the view there, wider by
 * 1/cos(elevation).
 */
export function layoutFacets(map: EyeMap, layout: InsetLayout = insetLayout(TV_FRAME)): Float32Array {
  const eyes = [map.left.directions, map.right.directions];
  const n = (eyes[0].length + eyes[1].length) / 3;
  const angles = new Float32Array(n * 2);
  let az0 = Infinity;
  let az1 = -Infinity;
  let el0 = Infinity;
  let el1 = -Infinity;
  let k = 0;
  for (const d of eyes) {
    for (let i = 0; i < d.length; i += 3, k++) {
      const az = Math.atan2(d[i], d[i + 1]);
      const el = Math.asin(Math.max(-1, Math.min(1, d[i + 2])));
      angles[k * 2] = az;
      angles[k * 2 + 1] = el;
      az0 = Math.min(az0, az);
      az1 = Math.max(az1, az);
      el0 = Math.min(el0, el);
      el1 = Math.max(el1, el);
    }
  }
  // Design units per radian in the TV's full picture, and the scale that fits this one.
  const across = (PICTURE_LAYOUT.azimuth / Math.PI) * (TV_DESIGN_WIDTH / 2);
  const up = (PICTURE_LAYOUT.elevation / (Math.PI / 2)) * (TV_DESIGN_HEIGHT / 2);
  const size = layout.scale;
  const p = { x: INSET_PICTURE.x * size, y: INSET_PICTURE.y * size, width: INSET_PICTURE.width * size, height: INSET_PICTURE.height * size };
  const px = layout.ppu.x;
  const py = layout.ppu.y;
  const scale = Math.min(p.width / Math.max(1e-6, (az1 - az0) * across), p.height / Math.max(1e-6, (el1 - el0) * up));
  const cx = p.x + p.width / 2 - ((az0 + az1) / 2) * across * scale;
  const cy = p.y + p.height / 2 + ((el0 + el1) / 2) * up * scale;
  // The picture's space in frame pixels: a widened dot at its edge stays inside it.
  const x0 = Math.round(p.x * px);
  const x1 = Math.round((p.x + p.width) * px);
  const y0 = Math.round(p.y * py);
  const y1 = Math.round((p.y + p.height) * py);
  const offsets = new Float32Array((n + 1) * 4);
  offsets[2] = 2;
  const left = eyes[0].length / 3;
  for (let i = 0; i < n; i++) {
    const el = angles[i * 2 + 1];
    const width = Math.min(DOT_WIDEST, Math.max(DOT, Math.round(DOT / Math.cos(el))));
    const x = (cx + angles[i * 2] * across * scale) * px;
    const y = (cy - el * up * scale) * py;
    const o = (i + 1) * 4;
    offsets[o] = Math.max(x0, Math.min(x1 - width, Math.round(x - width / 2)));
    offsets[o + 1] = Math.max(y0, Math.min(y1 - DOT, Math.round(y - DOT / 2)));
    offsets[o + 2] = i < left ? 0 : 1;
    offsets[o + 3] = width;
  }
  return offsets;
}

const INSET_VS = /* glsl */ `
attribute vec4 offset;
attribute float light;
uniform vec2 origin;
uniform vec2 panelSize;
uniform vec2 frame;
varying vec2 vUv;
varying float vLight;
varying float vKind;
void main() {
  vec2 size = offset.z > 1.5 ? panelSize : vec2(offset.w, ${DOT.toFixed(1)});
  vec2 px = origin + offset.xy + position.xy * size;
  gl_Position = vec4(px.x / (frame.x * 0.5) - 1.0, 1.0 - px.y / (frame.y * 0.5), 0.0, 1.0);
  vUv = vec2(position.x, 1.0 - position.y);
  vLight = light;
  vKind = offset.z;
}`;

const INSET_FS = /* glsl */ `
uniform sampler2D panel;
uniform float alpha;
varying vec2 vUv;
varying float vLight;
varying float vKind;
${FACET_COLOR}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  // Each facet a little lens, as in the full picture.
  vec4 c = vKind > 1.5 ? texture2D(panel, vUv) : vec4(facetColor(vLight, vKind) * (1.0 - dot(p, p) * 0.14), 1.0);
  gl_FragColor = vec4(c.rgb, c.a * alpha);
}`;

export class EyesInset {
  readonly placement = new CornerPlacement();
  /** Drawn with the overlay (the game adds it to the overlay's scene), before the menus and hints. */
  readonly mesh: THREE.Mesh;
  /** It is, or is about to be, on screen: the eyes must render, even for a brain that has none of its own. */
  watching = false;
  readonly #eyes: Eyes;
  readonly #material: THREE.ShaderMaterial;
  readonly #canvas: HTMLCanvasElement;
  readonly #g: CanvasRenderingContext2D;
  readonly #texture: THREE.CanvasTexture;
  #map: EyeMap | null = null;
  #light: THREE.InstancedBufferAttribute | null = null;
  #seen = -1;
  /** What the label says now: true, what the brain is sent; false, a picture; null, not drawn yet. */
  #sent: boolean | null = null;
  #layout: InsetLayout = insetLayout(TV_FRAME);

  constructor(eyes: Eyes) {
    this.#eyes = eyes;
    this.#canvas = document.createElement("canvas");
    this.#canvas.width = this.#layout.panel.width;
    this.#canvas.height = this.#layout.panel.height;
    const g = this.#canvas.getContext("2d");
    if (!g) throw new Error("No 2D canvas for the eyes' inset");
    this.#g = g;
    this.#texture = new THREE.CanvasTexture(this.#canvas);
    // Texel for pixel: the panel is placed on whole pixels.
    this.#texture.minFilter = THREE.NearestFilter;
    this.#texture.magFilter = THREE.NearestFilter;
    this.#texture.generateMipmaps = false;
    this.#material = new THREE.ShaderMaterial({
      vertexShader: INSET_VS,
      fragmentShader: INSET_FS,
      uniforms: {
        panel: { value: this.#texture },
        alpha: { value: 0 },
        origin: { value: new THREE.Vector2() },
        panelSize: { value: new THREE.Vector2(this.#layout.panel.width, this.#layout.panel.height) },
        frame: { value: new THREE.Vector2(TV_FRAME.width, TV_FRAME.height) },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.InstancedBufferGeometry(), this.#material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    // Under the overlay's quad: both are in the transparent list, drawn in this order.
    this.mesh.renderOrder = -1;
  }

  /** The screen changed shape, or the pictures' size: its size and corners follow, its panel is drawn again and its dots laid out again. */
  layout(frame: Frame, hud: HudLayout, size: number) {
    const layout = insetLayout(frame, hud, size);
    this.#layout = layout;
    const { width, height } = layout.panel;
    if (this.#canvas.width !== width || this.#canvas.height !== height) {
      this.#canvas.width = width;
      this.#canvas.height = height;
      // A texture's storage is its first size: a new one for the new size.
      this.#texture.dispose();
    }
    const uniforms = this.#material.uniforms;
    (uniforms.panelSize.value as THREE.Vector2).set(width, height);
    (uniforms.frame.value as THREE.Vector2).set(frame.width, frame.height);
    this.#sent = null;
    this.#map = null;
  }

  /** Where it is: its corner, or "hidden". */
  get state(): Corner | "hidden" {
    return this.mesh.visible ? this.placement.corner : "hidden";
  }

  /** Where it is with the deck at a corner. */
  at(corner: Corner) {
    return this.#layout.rects[corner];
  }

  /** Once a frame, after the corner deck and before the eyes render and the overlay is drawn; `opacity` is Settings'. */
  update(dt: number, wanted: CornerWanted, deck: CornerDeck, opacity: number) {
    const eyes = this.#eyes;
    const light = eyes.light;
    this.watching = wanted === "show";
    // It fades in once there is a picture to show. It is first in the corner.
    this.placement.update(dt, wanted === "show" && !light ? "fade" : wanted, deck.goal, 0);
    this.mesh.visible = this.placement.alpha > 0 && light !== null;
    if (!light || !this.mesh.visible) return;
    if (eyes.map !== this.#map) this.#build(eyes.map);
    const sent = eyes.inUse;
    if (sent !== this.#sent) this.#drawPanel(sent);
    if (eyes.updates !== this.#seen) {
      this.#seen = eyes.updates;
      const values = this.#light!.array as Float32Array;
      values.set(light.left, 1);
      values.set(light.right, 1 + light.left.length);
      this.#light!.needsUpdate = true;
    }
    const uniforms = this.#material.uniforms;
    uniforms.alpha.value = this.placement.alpha * opacity;
    const origin = this.#layout.origins[this.placement.corner];
    (uniforms.origin.value as THREE.Vector2).set(origin.x, origin.y);
  }

  #build(map: EyeMap) {
    const offsets = layoutFacets(map, this.#layout);
    const count = offsets.length / 4;
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]), 3));
    geometry.setIndex([0, 2, 1, 2, 3, 1]);
    geometry.setAttribute("offset", new THREE.InstancedBufferAttribute(offsets, 4));
    const light = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
    light.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("light", light);
    geometry.instanceCount = count;
    this.mesh.geometry.dispose();
    this.mesh.geometry = geometry;
    this.#light = light;
    this.#map = map;
    this.#seen = -1;
  }

  /** The glass and the label, drawn in design units as the overlay draws. */
  #drawPanel(sent: boolean) {
    const g = this.#g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    const { panel, ppu, scale: k } = this.#layout;
    g.clearRect(0, 0, panel.width, panel.height);
    // In the panel's own design units, at its size.
    g.setTransform(ppu.x * k, 0, 0, ppu.y * k, 0, 0);
    const { width, height, radius } = INSET_PANEL;
    glassPanel(g, 1, 1, width - 2, height - 2, radius, { tint: "night", shadow: false });
    const p = INSET_PICTURE;
    // A dark well for the dots, as the stats set the brain's trace in one.
    roundedRect(g, p.x - 2, p.y - 2, p.width + 4, p.height + 4, 6);
    g.fillStyle = "rgba(0, 16, 50, 0.5)";
    g.fill();
    text(g, sent ? "Fly POV" : "A picture it doesn't see", LABEL.x, LABEL.y, { size: LABEL.size, color: LABEL.color });
    this.#texture.needsUpdate = true;
    this.#sent = sent;
  }
}
