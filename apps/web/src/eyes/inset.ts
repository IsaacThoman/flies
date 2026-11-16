// What its eyes see, small in a corner over the camera's picture, so the
// wallpaper shows the fly and what it sees at once. The same facets as View →
// Fly's eyes (eyes.ts) in the same proportions, left eye on the left, and
// labelled for what it is: what the brain is being sent, or else a picture.
//
// One draw: an instanced quad whose first instance is the glass panel (a
// small canvas drawn with the menu kit) and the rest a dot for each facet,
// snapped to the frame's pixels so it stays crisp at 640×480. It is drawn
// with the overlay, under the menus and hints, but fades by itself: the
// wallpaper fades those out, and this is meant to stay.
//
// A panel left in one place for hours can burn into an OLED screen, so in the
// wallpaper it moves to another corner each time the camera moves on to a new
// shot.

import * as THREE from "three";
import type { EyeMap } from "@fly/brain";
import { glassPanel, roundedRect, text } from "@fly/ui";
import { DESIGN_HEIGHT, DESIGN_WIDTH, RENDER_HEIGHT, RENDER_WIDTH } from "../display.ts";
import type { EyesInsetMode } from "../settings.ts";
import { FACET_COLOR, PICTURE_LAYOUT } from "./eyes.ts";
import type { Eyes } from "./eyes.ts";

export type Corner = "top-right" | "bottom-left" | "top-left" | "bottom-right";
/**
 * The corners in the order it visits them, across the screen each time.
 * Playing, it keeps to the first: the hints take the others.
 */
export const CORNERS: readonly Corner[] = ["top-right", "bottom-left", "top-left", "bottom-right"];

/** The panel, in design units (16:9, as the overlay): about a fifth of the screen's width. */
export const INSET_PANEL = { width: 176, height: 92, radius: 14, margin: 16 };
/** Where the dots go in the panel, and the label over them (design units). */
export const INSET_PICTURE = { x: 10, y: 27, width: 156, height: 56 };
const LABEL = { x: 12, y: 19, size: 12, color: "#eaf6ff" };
/** A facet's dot, in frame pixels, and the widest it gets toward the poles. */
const DOT = 3;
const DOT_WIDEST = 8;
/** Seconds to fade in, and out (out sooner: the controls are coming back, or it is moving on). */
const FADE_IN = 1;
const FADE_OUT = 0.5;

/** Frame pixels per design unit, across (the frame is squeezed into 4:3 and shown stretched to 16:9). */
const ACROSS = RENDER_WIDTH / DESIGN_WIDTH;
const DOWN = RENDER_HEIGHT / DESIGN_HEIGHT;

/** The panel's place at a corner, in design units. */
export function insetRect(corner: Corner) {
  const { width, height, margin } = INSET_PANEL;
  const x = corner.endsWith("left") ? margin : DESIGN_WIDTH - margin - width;
  const y = corner.startsWith("top") ? margin : DESIGN_HEIGHT - margin - height;
  return { x, y, width, height };
}

/** Each corner's top left in whole frame pixels, so the panel's texels and the dots land on pixels. */
const ORIGINS = Object.fromEntries(CORNERS.map((c) => [c, { x: Math.round(insetRect(c).x * ACROSS), y: Math.round(insetRect(c).y * DOWN) }])) as Record<Corner, { x: number; y: number }>;
const PANEL_PX = { width: Math.round(INSET_PANEL.width * ACROSS), height: Math.round(INSET_PANEL.height * DOWN) };

/** "show"; "fade": not wanted now, though nothing covers it; "hide": gone at once. */
export type InsetWanted = "show" | "fade" | "hide";

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
export function insetWanted(setting: EyesInsetMode, screen: string, wallpaper: boolean, fullPicture: boolean, eyesOff: boolean): InsetWanted {
  if (setting === "off" || screen !== "play" || fullPicture || eyesOff) return "hide";
  return setting === "always" || wallpaper ? "show" : "fade";
}

/** Where it is and how much it shows: it fades out before it moves to another corner, and back in there. */
export class InsetPlacement {
  corner: Corner = CORNERS[0];
  /** 0 to 1. */
  alpha = 0;
  #goal = 0;
  #shotChanges = -1;

  update(dt: number, wanted: InsetWanted, wallpaper: boolean, shotChanges: number) {
    if (!wallpaper) this.#goal = 0;
    else if (wanted === "show" && this.#shotChanges >= 0 && shotChanges !== this.#shotChanges) this.#goal = (this.#goal + 1) % CORNERS.length;
    this.#shotChanges = shotChanges;
    const goal = CORNERS[this.#goal];
    if (wanted === "hide") {
      this.alpha = 0;
      this.corner = goal;
      return;
    }
    if (wanted === "show" && this.corner === goal) this.alpha = Math.min(1, this.alpha + dt / FADE_IN);
    else this.alpha = Math.max(0, this.alpha - dt / FADE_OUT);
    if (this.alpha === 0) this.corner = goal;
  }
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
export function layoutFacets(map: EyeMap): Float32Array {
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
  // Design units per radian in the full picture, and the scale that fits this one.
  const across = (PICTURE_LAYOUT.azimuth / Math.PI) * (DESIGN_WIDTH / 2);
  const up = (PICTURE_LAYOUT.elevation / (Math.PI / 2)) * (DESIGN_HEIGHT / 2);
  const p = INSET_PICTURE;
  const scale = Math.min(p.width / Math.max(1e-6, (az1 - az0) * across), p.height / Math.max(1e-6, (el1 - el0) * up));
  const cx = p.x + p.width / 2 - ((az0 + az1) / 2) * across * scale;
  const cy = p.y + p.height / 2 + ((el0 + el1) / 2) * up * scale;
  // The picture's space in frame pixels: a widened dot at its edge stays inside it.
  const x0 = Math.round(p.x * ACROSS);
  const x1 = Math.round((p.x + p.width) * ACROSS);
  const y0 = Math.round(p.y * DOWN);
  const y1 = Math.round((p.y + p.height) * DOWN);
  const offsets = new Float32Array((n + 1) * 4);
  offsets[2] = 2;
  const left = eyes[0].length / 3;
  for (let i = 0; i < n; i++) {
    const el = angles[i * 2 + 1];
    const width = Math.min(DOT_WIDEST, Math.max(DOT, Math.round(DOT / Math.cos(el))));
    const x = (cx + angles[i * 2] * across * scale) * ACROSS;
    const y = (cy - el * up * scale) * DOWN;
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
varying vec2 vUv;
varying float vLight;
varying float vKind;
void main() {
  vec2 size = offset.z > 1.5 ? panelSize : vec2(offset.w, ${DOT.toFixed(1)});
  vec2 px = origin + offset.xy + position.xy * size;
  gl_Position = vec4(px.x / ${(RENDER_WIDTH / 2).toFixed(1)} - 1.0, 1.0 - px.y / ${(RENDER_HEIGHT / 2).toFixed(1)}, 0.0, 1.0);
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
  readonly placement = new InsetPlacement();
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

  constructor(eyes: Eyes) {
    this.#eyes = eyes;
    this.#canvas = document.createElement("canvas");
    this.#canvas.width = PANEL_PX.width;
    this.#canvas.height = PANEL_PX.height;
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
      uniforms: { panel: { value: this.#texture }, alpha: { value: 0 }, origin: { value: new THREE.Vector2() }, panelSize: { value: new THREE.Vector2(PANEL_PX.width, PANEL_PX.height) } },
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

  /** Where it is: its corner, or "hidden". */
  get state(): Corner | "hidden" {
    return this.mesh.visible ? this.placement.corner : "hidden";
  }

  /** Once a frame, before the eyes render and the overlay is drawn. */
  update(dt: number, wanted: InsetWanted, wallpaper: boolean, shotChanges: number) {
    const eyes = this.#eyes;
    const light = eyes.light;
    this.watching = wanted === "show";
    // It fades in once there is a picture to show.
    this.placement.update(dt, wanted === "show" && !light ? "fade" : wanted, wallpaper, shotChanges);
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
    uniforms.alpha.value = this.placement.alpha;
    const origin = ORIGINS[this.placement.corner];
    (uniforms.origin.value as THREE.Vector2).set(origin.x, origin.y);
  }

  #build(map: EyeMap) {
    const offsets = layoutFacets(map);
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
    g.clearRect(0, 0, PANEL_PX.width, PANEL_PX.height);
    g.setTransform(ACROSS, 0, 0, DOWN, 0, 0);
    const { width, height, radius } = INSET_PANEL;
    glassPanel(g, 1, 1, width - 2, height - 2, radius, { tint: "night", shadow: false });
    const p = INSET_PICTURE;
    // A dark well for the dots, as the brain screen sets its trace in one.
    roundedRect(g, p.x - 2, p.y - 2, p.width + 4, p.height + 4, 6);
    g.fillStyle = "rgba(0, 16, 50, 0.5)";
    g.fill();
    text(g, sent ? "What it sees" : "A picture it doesn't see", LABEL.x, LABEL.y, { size: LABEL.size, color: LABEL.color });
    this.#texture.needsUpdate = true;
    this.#sent = sent;
  }
}
