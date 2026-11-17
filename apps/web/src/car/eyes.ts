// The fly's eyes, from its place on the dashboard: as in the fly game
// (../eyes/eyes.ts), the world round its head rendered as six tiny views,
// read back without waiting and resampled to the brain's facets
// (@fly/body's vision). They see the world, not the car round them: the
// cockpit is on a layer of its own. The facets are also drawn, a dot each,
// into a small picture that the car's centre screen shows.

import * as THREE from "three";
import type { EyeMap } from "@fly/brain";
import { Adaptation, FACES, createSampler, sample } from "@fly/body";
import type { Sampler } from "@fly/body";
import { FACET_COLOR } from "../eyes/eyes.ts";

/** Each view's size in pixels, and how often they refresh: the fly game's low detail. */
const RESOLUTION = 16;
const HZ = 20;
/** The picture on the centre screen, pixels. */
export const PICTURE_SIZE = { width: 128, height: 64 };

const PICTURE_VS = /* glsl */ `
attribute float light;
attribute float side;
uniform float size;
varying float vLight;
varying float vSide;
void main() {
  vLight = light;
  vSide = side;
  // Azimuth and elevation (radians), equirectangular across the screen.
  gl_Position = vec4(position.x / 3.14159, position.y / 1.5708 * 0.9, 0.0, 1.0);
  gl_PointSize = size;
}`;

const PICTURE_FS = /* glsl */ `
varying float vLight;
varying float vSide;
${FACET_COLOR}
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  if (dot(p, p) > 1.0) discard;
  gl_FragColor = vec4(facetColor(vLight, vSide), 1.0);
}`;

export class CarEyes {
  /** The latest complete picture, one value per facet, or null until the first. */
  light: { left: Float32Array; right: Float32Array } | null = null;
  /** Pictures completed. */
  updates = 0;
  /** What the centre screen shows. */
  readonly picture = new THREE.WebGLRenderTarget(PICTURE_SIZE.width, PICTURE_SIZE.height);
  readonly #renderer: THREE.WebGLRenderer;
  readonly #scene: THREE.Scene;
  readonly #cameras = FACES.map(() => new THREE.PerspectiveCamera(90, 1, 0.3, 700));
  readonly #faceQ = FACES.map((f) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...f.right), new THREE.Vector3(...f.up), new THREE.Vector3(...f.forward).negate())));
  readonly #target = new THREE.WebGLRenderTarget(RESOLUTION * FACES.length, RESOLUTION, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  readonly #pixels = new Uint8Array(RESOLUTION * FACES.length * RESOLUTION * 4);
  readonly #adaptation = new Adaptation();
  readonly #q = new THREE.Quaternion();
  #map: EyeMap | null = null;
  #samplers: { left: Sampler; right: Sampler } | null = null;
  #since = 0;
  #sinceSampled = 0;
  #pending = false;
  #dots: { scene: THREE.Scene; camera: THREE.Camera; light: THREE.BufferAttribute } | null = null;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, layer: number) {
    this.#renderer = renderer;
    this.#scene = scene;
    for (const camera of this.#cameras) camera.layers.set(layer);
    renderer.setRenderTarget(this.picture);
    renderer.setClearColor(0x020a1c, 1);
    renderer.clear();
    renderer.setRenderTarget(null);
  }

  /**
   * Looks round from `head`, facing `yaw`, when a refresh is due; `map` is
   * the brain's eyes. The light arrives a frame or two later; until then the
   * last picture stands.
   */
  look(map: EyeMap, head: THREE.Vector3, yaw: number, dt: number) {
    this.#since += dt;
    this.#sinceSampled += dt;
    if (map !== this.#map) this.#prepare(map);
    if (this.#pending || this.#since < 1 / HZ) return;
    this.#since = 0;
    const renderer = this.#renderer;
    const target = this.#target;
    this.#q.setFromAxisAngle(UP, yaw);
    target.scissorTest = true;
    for (let i = 0; i < FACES.length; i++) {
      const camera = this.#cameras[i];
      camera.position.copy(head);
      camera.quaternion.copy(this.#q).multiply(this.#faceQ[i]);
      camera.updateMatrixWorld();
      target.viewport.set(i * RESOLUTION, 0, RESOLUTION, RESOLUTION);
      target.scissor.set(i * RESOLUTION, 0, RESOLUTION, RESOLUTION);
      renderer.setRenderTarget(target);
      renderer.render(this.#scene, camera);
    }
    target.scissorTest = false;
    const samplers = this.#samplers!;
    const read = renderer.readRenderTargetPixelsAsync(target, 0, 0, RESOLUTION * FACES.length, RESOLUTION, this.#pixels);
    renderer.setRenderTarget(null);
    this.#pending = true;
    void read.then(() => {
      if (samplers !== this.#samplers) return;
      const light = this.light!;
      sample(this.#pixels, samplers.left, light.left);
      sample(this.#pixels, samplers.right, light.right);
      this.#adaptation.apply(light, this.#sinceSampled);
      this.#sinceSampled = 0;
      this.updates++;
      this.#drawPicture();
    }).catch((error: unknown) => {
      console.warn("The fly's eye readback failed", error);
    }).finally(() => {
      this.#pending = false;
    });
  }

  /** Whether a picture for these eyes has come back yet. */
  get seeing() {
    return this.updates > 0;
  }

  #prepare(map: EyeMap) {
    this.#map = map;
    this.#samplers = { left: createSampler(map.left.directions, RESOLUTION), right: createSampler(map.right.directions, RESOLUTION) };
    this.light = { left: new Float32Array(this.#samplers.left.count), right: new Float32Array(this.#samplers.right.count) };
    this.updates = 0;
    this.#buildPicture(map);
  }

  #buildPicture(map: EyeMap) {
    const n = (map.left.directions.length + map.right.directions.length) / 3;
    const positions = new Float32Array(n * 3);
    const sides = new Float32Array(n);
    let k = 0;
    for (const [side, eye] of [[0, map.left], [1, map.right]] as const) {
      const d = eye.directions;
      for (let i = 0; i < d.length / 3; i++) {
        // Head frame: x right, y ahead, z up.
        positions[k * 3] = Math.atan2(d[i * 3], d[i * 3 + 1]);
        positions[k * 3 + 1] = Math.asin(Math.max(-1, Math.min(1, d[i * 3 + 2])));
        sides[k++] = side;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const light = new THREE.BufferAttribute(new Float32Array(n), 1);
    light.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("light", light);
    geometry.setAttribute("side", new THREE.BufferAttribute(sides, 1));
    const size = Math.max(1.5, Math.min(4, 260 / Math.sqrt(n)));
    const points = new THREE.Points(geometry, new THREE.ShaderMaterial({ vertexShader: PICTURE_VS, fragmentShader: PICTURE_FS, uniforms: { size: { value: size } }, depthTest: false, depthWrite: false }));
    points.frustumCulled = false;
    const scene = new THREE.Scene();
    scene.add(points);
    if (this.#dots) (this.#dots.scene.children[0] as THREE.Points).geometry.dispose();
    this.#dots = { scene, camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), light };
  }

  #drawPicture() {
    const dots = this.#dots;
    const light = this.light;
    if (!dots || !light) return;
    const array = dots.light.array as Float32Array;
    array.set(light.left, 0);
    array.set(light.right, light.left.length);
    dots.light.needsUpdate = true;
    const renderer = this.#renderer;
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(this.picture);
    renderer.setClearColor(0x020a1c, 1);
    renderer.clear();
    renderer.render(dots.scene, dots.camera);
    renderer.setRenderTarget(previous);
  }
}

const UP = new THREE.Vector3(0, 1, 0);
