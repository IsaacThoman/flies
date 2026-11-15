// The in-engine 2D layer: a canvas the size of the frame, laid out in 16:9
// design units, uploaded as a texture and drawn over the world on one quad.
// It is redrawn and uploaded only when something on it changes, at most
// MAX_REDRAWS times a second, since an upload costs the Apple TV time.

import * as THREE from "three";
import { DESIGN_HEIGHT, DESIGN_WIDTH, RENDER_HEIGHT, RENDER_WIDTH } from "../display.ts";

export const MAX_REDRAWS = 30;

export class Overlay {
  readonly canvas: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;
  readonly texture: THREE.CanvasTexture;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly material: THREE.MeshBasicMaterial;
  /** Something changed: redraw when allowed. */
  dirty = true;
  /** Redraws so far, for tests and the stats corner. */
  redraws = 0;
  #since = 1;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = RENDER_WIDTH;
    this.canvas.height = RENDER_HEIGHT;
    const g = this.canvas.getContext("2d");
    if (!g) throw new Error("No 2D canvas for the overlay");
    this.g = g;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.material = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
    this.scene.matrixWorldAutoUpdate = false;
    quad.updateMatrixWorld();
  }

  /** Redraws with `draw` (in design units) if dirty and allowed this frame. Returns true if it drew. */
  redraw(dt: number, draw: (g: CanvasRenderingContext2D) => void): boolean {
    this.#since += dt;
    if (!this.dirty || this.#since < 1 / MAX_REDRAWS) return false;
    this.#since = 0;
    this.dirty = false;
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, RENDER_WIDTH, RENDER_HEIGHT);
    g.setTransform(RENDER_WIDTH / DESIGN_WIDTH, 0, 0, RENDER_HEIGHT / DESIGN_HEIGHT, 0, 0);
    g.globalAlpha = 1;
    draw(g);
    this.texture.needsUpdate = true;
    this.redraws++;
    return true;
  }
}
