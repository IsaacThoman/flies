// The in-engine 2D layer: a canvas the size of the frame, laid out in design
// units, uploaded as a texture and drawn over the world on one quad. It is
// redrawn and uploaded only when something on it changes, at most
// MAX_REDRAWS times a second, since an upload costs the Apple TV time. Each
// drawing records where its targets are (`hits`), for a pointer.

import * as THREE from "three";
import { HitMap } from "@fly/ui";
import { TV_FRAME } from "../display.ts";
import type { Frame } from "../display.ts";

export const MAX_REDRAWS = 30;

export class Overlay {
  readonly canvas: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;
  readonly texture: THREE.CanvasTexture;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly material: THREE.MeshBasicMaterial;
  /** Where the last drawing's targets are. */
  readonly hits = new HitMap();
  /** Something changed: redraw when allowed. */
  dirty = true;
  /** Redraws so far, for tests and the stats corner. */
  redraws = 0;
  #since = 1;
  #frame: Frame = TV_FRAME;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = TV_FRAME.width;
    this.canvas.height = TV_FRAME.height;
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

  /** The frame changed shape: the canvas follows it, and is drawn again at once. */
  resize(frame: Frame) {
    this.#frame = frame;
    if (this.canvas.width !== frame.width || this.canvas.height !== frame.height) {
      this.canvas.width = frame.width;
      this.canvas.height = frame.height;
      // A texture's storage is its first size: a new one for the new size.
      this.texture.dispose();
    }
    this.dirty = true;
    this.#since = 1;
  }

  /** Provisional input feedback can bypass the upload cap so it never waits an extra frame. */
  redraw(dt: number, owner: string, draw: (g: CanvasRenderingContext2D, hits: HitMap) => void, immediate = false): boolean {
    this.#since += dt;
    if (!this.dirty || (!immediate && this.#since < 1 / MAX_REDRAWS)) return false;
    this.#since = 0;
    this.dirty = false;
    const g = this.g;
    const { width, height, design } = this.#frame;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, width, height);
    g.setTransform(width / design.width, 0, 0, height / design.height, 0, 0);
    g.globalAlpha = 1;
    this.hits.begin(owner);
    draw(g, this.hits);
    this.texture.needsUpdate = true;
    this.redraws++;
    return true;
  }
}
