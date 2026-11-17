// A held tool works exactly under the finger. A small copy of that patch of
// the rendered world lets the player see contact without moving the tool.
// Copied on the GPU, with one quad; no second view of the world is rendered.
import * as THREE from "three";
import type { Frame } from "../display.ts";

const SAMPLE = 32;
const SIZE = 92;
const OFFSET = 80;
const MARGIN = 8;
export type LensPosition = { x: number; y: number; size: number };

/** CSS pixels, clear of the finger and the host's covered edges. Reuses the caller's result. */
export function positionLens(frame: Frame, x: number, y: number, out: LensPosition) {
  const w = frame.design.width * frame.unit;
  const h = frame.design.height * frame.unit;
  const r = SIZE / 2;
  const left = frame.safe.left * frame.unit + MARGIN + r;
  const right = w - frame.safe.right * frame.unit - MARGIN - r;
  const top = frame.safe.top * frame.unit + MARGIN + r;
  const bottom = h - frame.safe.bottom * frame.unit - MARGIN - r;
  out.size = left <= right && top <= bottom ? SIZE : 0;
  let px = x * w;
  let py = y * h - OFFSET;
  if (py < top) py = y * h + OFFSET;
  if (py > bottom) {
    py = y * h;
    px += px < (left + right) / 2 ? OFFSET : -OFFSET;
  }
  out.x = Math.max(left, Math.min(right, px));
  out.y = Math.max(top, Math.min(bottom, py));
}

export class TouchLoupe {
  readonly texture = new THREE.FramebufferTexture(SAMPLE, SAMPLE);
  readonly mesh: THREE.Mesh;
  readonly #source = new THREE.Vector2();
  readonly #at: LensPosition = { x: 0, y: 0, size: 0 };

  constructor() {
    // The framebuffer already contains display-encoded pixels: copy them without a second conversion.
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.minFilter = this.texture.magFilter = THREE.NearestFilter;
    const material = new THREE.ShaderMaterial({
      uniforms: { picture: { value: this.texture } },
      vertexShader: `varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform sampler2D picture; varying vec2 vUv;
        void main() {
          float r = length(vUv - 0.5);
          if (r > 0.49) discard;
          vec3 color = texture2D(picture, vUv).rgb;
          color = mix(color, vec3(0.75, 0.97, 1.0), smoothstep(0.45, 0.47, r));
          vec2 d = abs(vUv - 0.5);
          float crosshair = (1.0 - step(0.012, min(d.x, d.y))) * step(0.04, max(d.x, d.y)) * (1.0 - step(0.1, max(d.x, d.y)));
          gl_FragColor = vec4(mix(color, vec3(0.04, 0.22, 0.29), crosshair), 1.0);
        }`,
      depthTest: false, depthWrite: false, toneMapped: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    this.mesh.visible = false;
  }

  /** After the world is drawn, before the HUD: the copy contains no menus or previous lens. */
  update(renderer: THREE.WebGLRenderer, frame: Frame, x: number, y: number, held: boolean) {
    this.mesh.visible = held && frame.width >= SAMPLE && frame.height >= SAMPLE;
    if (!this.mesh.visible) return;
    const at = this.#at;
    positionLens(frame, x, y, at);
    if (!at.size) { this.mesh.visible = false; return; }
    const w = frame.design.width * frame.unit;
    const h = frame.design.height * frame.unit;
    this.#source.set(Math.max(0, Math.min(frame.width - SAMPLE, Math.floor(x * frame.width - SAMPLE / 2))), Math.max(0, Math.min(frame.height - SAMPLE, Math.floor((1 - y) * frame.height - SAMPLE / 2))));
    renderer.copyFramebufferToTexture(this.texture, this.#source);
    this.mesh.position.set(at.x / w * 2 - 1, 1 - at.y / h * 2, 0);
    this.mesh.scale.set(at.size / w, at.size / h, 1);
    this.mesh.updateMatrixWorld();
  }
}
