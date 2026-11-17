// Taking a picture: the frame already drawn, as the world is in it before the
// pictures in the corners, the hints and the menus go over it, copied on the
// GPU, made smaller with one quad, read back without waiting for it, and made
// into a JPEG a little at a time. Nothing of the world is drawn again for it,
// and no frame waits on it: on the Apple TV, where JavaScript is slow, the
// encoding is spread over as many frames as it takes.

import * as THREE from "three";
import { JpegEncoder, jpegDataUrl } from "./jpeg.ts";

/** A finished picture: a JPEG data URL and its size. */
export type Picture = { url: string; w: number; h: number };

/** The most time (ms) a frame spends encoding: the Apple TV's frame is 16.7 ms, most of it already spoken for. */
export const ENCODE_SLICE_MS = 1;
/** MCUs (16 by 16 pixels) encoded between looks at the clock. */
const MCUS_PER_LOOK = 2;

/** The size of a picture `long` pixels on its long side, of a screen this shape (width over height). */
export function pictureSize(aspect: number, long: number) {
  const a = Math.min(4, Math.max(0.25, aspect));
  return a >= 1 ? { w: long, h: Math.max(8, Math.round(long / a)) } : { w: Math.max(8, Math.round(long * a)), h: long };
}

const VERTEX = `varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
// Four bilinear taps a quarter of a picture's pixel apart: each pixel the mean of the frame's under it (up to about four across).
const FRAGMENT = `uniform sampler2D frame; uniform vec2 spread; varying vec2 vUv;
void main() {
  vec3 c = texture2D(frame, vUv + vec2(-spread.x, -spread.y)).rgb + texture2D(frame, vUv + vec2(spread.x, -spread.y)).rgb
    + texture2D(frame, vUv + vec2(-spread.x, spread.y)).rgb + texture2D(frame, vUv + vec2(spread.x, spread.y)).rgb;
  gl_FragColor = vec4(c * 0.25, 1.0);
}`;

export class Photographer {
  readonly #encoder: JpegEncoder;
  #copy: THREE.FramebufferTexture | null = null;
  #target: THREE.WebGLRenderTarget | null = null;
  #pixels = new Uint8Array(0);
  readonly #spread = new THREE.Vector2();
  readonly #material: THREE.ShaderMaterial;
  readonly #scene: THREE.Scene;
  readonly #camera = new THREE.Camera();
  #reading = false;
  #w = 0;
  #h = 0;
  #done: ((picture: Picture | null) => void) | null = null;
  /** Encoding time spent, ms, for the frame stats and the budgets. */
  costMs = 0;

  constructor(quality: number) {
    this.#encoder = new JpegEncoder(quality);
    this.#material = new THREE.ShaderMaterial({ uniforms: { frame: { value: null }, spread: { value: this.#spread } }, vertexShader: VERTEX, fragmentShader: FRAGMENT, depthTest: false, depthWrite: false, toneMapped: false });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.#material);
    quad.frustumCulled = false;
    this.#scene = new THREE.Scene().add(quad);
  }

  /** A picture is being taken: read back or encoded. */
  get busy() {
    return this.#done !== null;
  }

  /**
   * Takes a picture `w` by `h` of what is in the frame now (`frameW` by
   * `frameH` pixels): call it after the world is drawn and before anything
   * is drawn over it, with the frame bound. `done` gets the picture, or null
   * if it couldn't be read.
   */
  take(renderer: THREE.WebGLRenderer, frameW: number, frameH: number, w: number, h: number, done: (picture: Picture | null) => void) {
    if (this.#done) return done(null);
    this.#done = done;
    let copy = this.#copy;
    if (!copy || copy.image.width !== frameW || copy.image.height !== frameH) {
      copy?.dispose();
      copy = this.#copy = new THREE.FramebufferTexture(frameW, frameH);
      // The frame already holds display-encoded pixels: copied as they are, not converted again.
      copy.colorSpace = THREE.NoColorSpace;
      copy.minFilter = copy.magFilter = THREE.LinearFilter;
    }
    let target = this.#target;
    if (!target || target.width !== w || target.height !== h) {
      target?.dispose();
      target = this.#target = new THREE.WebGLRenderTarget(w, h, { depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    }
    if (this.#pixels.length !== w * h * 4) this.#pixels = new Uint8Array(w * h * 4);
    this.#w = w;
    this.#h = h;
    renderer.copyFramebufferToTexture(copy);
    this.#material.uniforms.frame.value = copy;
    // Made no smaller, a picture is the frame as it is.
    const smaller = frameW > w * 1.25 || frameH > h * 1.25;
    this.#spread.set(smaller ? 0.25 / w : 0, smaller ? 0.25 / h : 0);
    const before = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    renderer.render(this.#scene, this.#camera);
    this.#reading = true;
    const read = renderer.readRenderTargetPixelsAsync(target, 0, 0, w, h, this.#pixels);
    renderer.setRenderTarget(before);
    read.then(
      () => {
        this.#reading = false;
        // WebGL reads from the bottom row up.
        this.#encoder.begin(this.#pixels, this.#w, this.#h, true);
      },
      (error: unknown) => {
        console.warn("A picture couldn't be read back", error);
        this.#finish(null);
      },
    );
  }

  /** Once a frame: a little more of the picture encoded, until it is done. */
  update() {
    if (!this.#done || this.#reading || !this.#encoder.busy) return;
    const started = performance.now();
    let finished = false;
    while (!finished && performance.now() - started < ENCODE_SLICE_MS) finished = this.#encoder.step(MCUS_PER_LOOK);
    if (finished) this.#finish({ url: jpegDataUrl(this.#encoder.bytes), w: this.#w, h: this.#h });
    this.costMs += performance.now() - started;
  }

  /** The graphics context was lost: what was on the GPU is gone, and a picture being read with it. */
  contextLost() {
    this.#copy = null;
    this.#target = null;
    if (this.#reading) {
      this.#reading = false;
      this.#finish(null);
    }
  }

  dispose() {
    this.#copy?.dispose();
    this.#target?.dispose();
    this.#material.dispose();
    this.#copy = this.#target = null;
  }

  #finish(picture: Picture | null) {
    const done = this.#done;
    this.#done = null;
    done?.(picture);
  }
}
