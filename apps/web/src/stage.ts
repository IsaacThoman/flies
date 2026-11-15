// The rendered world: the backdrop and the table in their two passes, the
// light of the day and the reflections that follow it, and the frame's cost.

import * as THREE from "three";
import { PIXEL_SIZES, RENDER_HEIGHT, RENDER_WIDTH } from "./display.ts";
import type { PixelSize } from "./display.ts";
import { buildBackdrop } from "./scene/backdrop.ts";
import type { Backdrop } from "./scene/backdrop.ts";
import { Daylight } from "./scene/light.ts";
import type { TimeOfDay } from "./scene/light.ts";
import { buildTable } from "./scene/table.ts";
import type { Table } from "./scene/table.ts";

/** The near pass covers the table, from this close to this far (mm); the backdrop the rest. */
export const NEAR = { near: 0.5, far: 4000 };
export const FAR = { near: 200, far: 3_000_000 };

/**
 * What glossy things reflect: a soft sky, bright at the horizon, over a pale
 * green ground, with the sun's glow. Simpler than the backdrop, so reflections
 * stay clean and colours stay true.
 */
function buildEnvironment(light: Daylight) {
  const scene = new THREE.Scene();
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { zenith: { value: light.zenith }, horizon: { value: light.horizon }, ground: { value: light.groundColor }, sunDir: { value: light.sunDirection }, sunColor: { value: light.sunColor } },
    vertexShader: "varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform vec3 zenith; uniform vec3 horizon; uniform vec3 ground; uniform vec3 sunDir; uniform vec3 sunColor; varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 c = mix(horizon, zenith, smoothstep(0.0, 0.7, d.y));
        c = mix(c, mix(horizon, ground, 0.55) * 0.9, smoothstep(0.0, -0.25, d.y));
        c += sunColor * pow(max(dot(d, sunDir), 0.0), 64.0) * 3.0;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), material));
  return scene;
}

export type FrameCost = { calls: number; triangles: number; textures: number; geometries: number };

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly light: Daylight;
  readonly backdrop: Backdrop;
  readonly scene = new THREE.Scene();
  readonly table: Table;
  readonly hemi: THREE.HemisphereLight;
  readonly sun: THREE.DirectionalLight;
  readonly cost: FrameCost = { calls: 0, triangles: 0, textures: 0, geometries: 0 };
  #pmrem: THREE.PMREMGenerator;
  #envScene: THREE.Scene;
  #env: THREE.WebGLRenderTarget | null = null;
  #envDirty = true;
  #lowRes: THREE.WebGLRenderTarget | null = null;
  #blit: { scene: THREE.Scene; camera: THREE.OrthographicCamera; material: THREE.MeshBasicMaterial } | null = null;
  pixels: PixelSize = "classic";

  constructor(canvas: HTMLCanvasElement, time: TimeOfDay) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", stencil: false });
    renderer.setPixelRatio(1);
    renderer.setSize(RENDER_WIDTH, RENDER_HEIGHT, false);
    renderer.autoClear = false;
    renderer.info.autoReset = false;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    this.renderer = renderer;
    this.light = new Daylight(time);
    this.backdrop = buildBackdrop(this.light);
    this.table = buildTable();
    this.scene.add(this.table.group);
    this.hemi = new THREE.HemisphereLight(this.light.skyColor, this.light.groundColor, this.light.hemiIntensity);
    this.sun = new THREE.DirectionalLight(this.light.sunColor, this.light.sunIntensity);
    this.scene.add(this.hemi, this.sun);
    this.#pmrem = new THREE.PMREMGenerator(renderer);
    this.#envScene = buildEnvironment(this.light);
    this.#applyLight();
  }

  setTime(time: TimeOfDay) {
    this.light.set(time);
  }

  /** Moves the light and the backdrop on; call before rendering. */
  update(time: number, dt: number, camera: THREE.PerspectiveCamera) {
    if (this.light.update(dt)) {
      this.#applyLight();
      // Reflections follow the sky, but rebuilding them costs a few ms: a few times a second while the light changes.
      this.#envDirty = true;
    }
    this.backdrop.update(time, camera, this.light);
    this.table.update(time);
  }

  #applyLight() {
    const l = this.light;
    this.hemi.color.copy(l.skyColor);
    this.hemi.groundColor.copy(l.groundColor);
    this.hemi.intensity = l.hemiIntensity;
    this.sun.color.copy(l.sunColor);
    this.sun.intensity = l.sunIntensity;
    this.sun.position.copy(l.sunDirection);
    for (const m of this.table.materials) m.envMapIntensity = (m.userData.envBase ??= m.envMapIntensity) * l.env;
  }

  #envAge = 1;

  /** Rebuilds the reflections from the sky if they are out of date. */
  #refreshEnvironment(dt: number) {
    this.#envAge += dt;
    if (!this.#envDirty || (this.#env && this.#envAge < 0.4)) return;
    this.#envDirty = false;
    this.#envAge = 0;
    const old = this.#env;
    this.#env = this.#pmrem.fromScene(this.#envScene, 0.02, 0.1, 100);
    this.scene.environment = this.#env.texture;
    old?.dispose();
  }

  setPixels(pixels: PixelSize) {
    this.pixels = pixels;
    this.#lowRes?.dispose();
    this.#lowRes = null;
    if (pixels === "classic") return;
    const { width, height } = PIXEL_SIZES[pixels];
    this.#lowRes = new THREE.WebGLRenderTarget(width, height, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, colorSpace: THREE.SRGBColorSpace });
    if (!this.#blit) {
      const material = new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false, toneMapped: false });
      const scene = new THREE.Scene();
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
      quad.frustumCulled = false;
      scene.add(quad);
      this.#blit = { scene, camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), material };
    }
    this.#blit.material.map = this.#lowRes.texture;
    this.#blit.material.needsUpdate = true;
  }

  /** Draws the world into the frame (and, with `extra`, anything else in the table's pass). */
  render(camera: THREE.PerspectiveCamera, dt: number) {
    const r = this.renderer;
    this.#refreshEnvironment(dt);
    r.setRenderTarget(this.#lowRes);
    r.clear(true, true, false);
    this.renderPasses(camera);
    if (this.#lowRes && this.#blit) {
      r.setRenderTarget(null);
      r.clear(true, true, false);
      r.render(this.#blit.scene, this.#blit.camera);
    }
  }

  /** The two passes, into whatever target is set: the backdrop, then the table over it. */
  renderPasses(camera: THREE.PerspectiveCamera, scene: THREE.Scene = this.scene) {
    const r = this.renderer;
    const { near, far } = camera;
    camera.near = FAR.near;
    camera.far = FAR.far;
    camera.updateProjectionMatrix();
    r.render(this.backdrop.scene, camera);
    r.clearDepth();
    camera.near = NEAR.near;
    camera.far = NEAR.far;
    camera.updateProjectionMatrix();
    r.render(scene, camera);
    camera.near = near;
    camera.far = far;
  }

  /** Starts a frame's cost count. */
  beginFrame() {
    this.renderer.info.reset();
  }

  /** The frame's cost so far. */
  measure(): FrameCost {
    const info = this.renderer.info;
    this.cost.calls = info.render.calls;
    this.cost.triangles = info.render.triangles;
    this.cost.textures = info.memory.textures;
    this.cost.geometries = info.memory.geometries;
    return this.cost;
  }
}
