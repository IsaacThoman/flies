// The rendered world: the place's backdrop and its table in their two passes,
// the light of the day and the weather over it, the reflections that follow
// them, the veil drawn while the fly is carried to another place, and the
// frame's cost.

import * as THREE from "three";
import { TV_FRAME, worldSize } from "./display.ts";
import type { Frame, PixelSize } from "./display.ts";
import type { Scene, SceneBackdrop, SceneSet } from "./places/types.ts";
import { disposeAll } from "./scene/build.ts";
import { Daylight } from "./scene/light.ts";
import type { TimeOfDay } from "./scene/light.ts";
import { WeatherNow } from "./scene/weather.ts";

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

const VEIL_CAMERA = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

/** Three keeps light uniforms by light ID for a scene's lifetime, even after those lights leave. */
export function renewScene(scene: THREE.Scene): THREE.Scene {
  const next = new THREE.Scene();
  next.environment = scene.environment;
  while (scene.children.length) next.add(scene.children[0]);
  return next;
}

export type FrameCost = { calls: number; triangles: number; textures: number; geometries: number; programs: number };

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly light: Daylight;
  readonly weather = new WeatherNow();
  /** The place shown, its far pass and its table. */
  current: Scene;
  backdrop: SceneBackdrop;
  set: SceneSet;
  readonly scene = new THREE.Scene();
  #renderScene = new THREE.Scene().add(this.scene);
  readonly hemi: THREE.HemisphereLight;
  readonly sun: THREE.DirectionalLight;
  readonly cost: FrameCost = { calls: 0, triangles: 0, textures: 0, geometries: 0, programs: 0 };
  #pmrem: THREE.PMREMGenerator;
  #envScene: THREE.Scene;
  #env: THREE.WebGLRenderTarget | null = null;
  #envDirty = true;
  /** The reflections were rebuilt this frame: the eyes wait a frame rather than add their own passes to it. */
  reflected = false;
  /** The light the reflections were last built from, to tell when they are out of date. */
  #envLight = { zenith: new THREE.Color(), horizon: new THREE.Color(), ground: new THREE.Color(), sun: new THREE.Color(), direction: new THREE.Vector3() };
  #lowRes: THREE.WebGLRenderTarget | null = null;
  #blit: { scene: THREE.Scene; camera: THREE.OrthographicCamera; material: THREE.MeshBasicMaterial } | null = null;
  #veil: { scene: THREE.Scene; material: THREE.MeshBasicMaterial };
  pixels: PixelSize = "classic";
  /** The frame rendered into. */
  frame: Frame = TV_FRAME;
  /** 0 to 1: how far the world is faded to black (while the fly is carried somewhere else). One draw while above 0. */
  veil = 0;
  /** How long building the place shown took, ms: all JavaScript, so on the Apple TV many times this. */
  buildMs = 0;
  /** The longest of the frames it was built in (SceneSet.more), ms: what one frame behind the veil cost. */
  buildStepMs = 0;
  /** A set built in steps: its hidden parts still to be drawn once behind the veil (null while it is still being built), the one drawn this frame, and its meshes the camera's view would have culled. */
  #unseen: THREE.Object3D[] | null = null;
  #seen: THREE.Object3D | null = null;
  #uncull: THREE.Object3D[] = [];

  constructor(canvas: HTMLCanvasElement, time: TimeOfDay, scene: Scene) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", stencil: false });
    renderer.setPixelRatio(1);
    renderer.setSize(TV_FRAME.width, TV_FRAME.height, false);
    renderer.autoClear = false;
    renderer.info.autoReset = false;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    this.renderer = renderer;
    this.current = scene;
    this.light = new Daylight(time, scene.palettes, scene.open);
    const started = performance.now();
    this.backdrop = scene.buildBackdrop(this.light);
    this.set = scene.buildSet();
    // Nothing is shown yet: the rest of it at once.
    while (this.set.more?.());
    this.buildMs = performance.now() - started;
    this.buildStepMs = this.buildMs;
    this.scene.add(this.set.group);
    this.hemi = new THREE.HemisphereLight(this.light.skyColor, this.light.groundColor, this.light.hemiIntensity);
    this.sun = new THREE.DirectionalLight(this.light.sunColor, this.light.sunIntensity);
    this.scene.add(this.hemi, this.sun);
    this.#pmrem = new THREE.PMREMGenerator(renderer);
    this.#envScene = buildEnvironment(this.light);
    const veil = new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), veil);
    quad.frustumCulled = false;
    this.#veil = { scene: new THREE.Scene().add(quad), material: veil };
    this.#applyLight();
  }

  /**
   * Shows another place: builds its backdrop and table, frees the old ones,
   * and settles its light at once. Building takes a while (all of it is
   * JavaScript, and on the Apple TV slow), so do it behind the veil.
   */
  load(scene: Scene) {
    this.scene.remove(this.set.group);
    disposeAll(this.set.group);
    disposeAll(this.backdrop.scene);
    // Actors that spawn later retain their parent, while only the renderer's light cache must expire.
    this.#renderScene = renewScene(this.#renderScene);
    this.current = scene;
    this.light.use(scene.palettes, scene.open);
    const started = performance.now();
    this.backdrop = scene.buildBackdrop(this.light);
    this.set = scene.buildSet();
    this.buildMs = performance.now() - started;
    this.buildStepMs = this.buildMs;
    this.#unseen = null;
    this.#seen = null;
    this.scene.add(this.set.group);
    this.#applyLight();
    this.#envDirty = true;
  }

  /**
   * Builds the next part of the place shown, if it is built in steps
   * (SceneSet.more): true while there is more. Then, a frame each, it shows
   * each part of it that is hidden (a large place's detail away from the
   * camera) to that frame's render behind the veil, so its buffers are on
   * the GPU before the veil lifts: the camera coming near it later has
   * nothing to upload, and what the place holds on the GPU doesn't depend
   * on where the camera has been.
   */
  buildMore(): boolean {
    if (!this.set.more) return false;
    const started = performance.now();
    if (this.#seen) {
      this.#seen.visible = false;
      for (const o of this.#uncull) o.frustumCulled = true;
      this.#seen = null;
    }
    if (this.#unseen === null) {
      if (!this.set.more()) this.#unseen = this.set.group.children.filter((o) => !o.visible);
    } else if (this.#unseen.length) {
      const part = (this.#seen = this.#unseen.pop()!);
      part.visible = true;
      this.#uncull.length = 0;
      part.traverse((o) => {
        if (!o.frustumCulled) return;
        o.frustumCulled = false;
        this.#uncull.push(o);
      });
    }
    const ms = performance.now() - started;
    this.buildMs += ms;
    this.buildStepMs = Math.max(this.buildStepMs, ms);
    return this.#unseen === null || this.#unseen.length > 0 || this.#seen !== null;
  }

  get renderScene(): THREE.Scene { return this.#renderScene; }

  setTime(time: TimeOfDay) {
    this.light.set(time);
  }

  /** Moves the weather, the light and the place on; call before rendering. */
  update(time: number, dt: number, camera: THREE.PerspectiveCamera) {
    this.weather.update(dt);
    if (this.light.update(dt, this.weather)) {
      this.#applyLight();
      // A sub-second flash uses direct light; rebuilding PMREM would stall it.
      if (this.weather.lightning < 0.001) this.#envDirty ||= this.#envStale();
    }
    this.backdrop.update(time, camera, this.light, this.weather);
    this.set.update(time, this.light, this.weather, camera);
  }

  /**
   * Reflections follow the sky, but rebuilding them costs a few ms: only once
   * the light has moved far enough from what they were built from to be
   * seen, so the clock's slow drift rebuilds them every few minutes, and a
   * change of time or weather a few times a second while it lasts.
   */
  #envStale() {
    const l = this.light;
    const e = this.#envLight;
    const far = (a: THREE.Color, b: THREE.Color) => Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b) > 0.03;
    return far(l.zenith, e.zenith) || far(l.horizon, e.horizon) || far(l.groundColor, e.ground) || far(l.sunColor, e.sun) || l.sunDirection.distanceTo(e.direction) > 0.03;
  }

  #applyLight() {
    const l = this.light;
    this.hemi.color.copy(l.skyColor);
    this.hemi.groundColor.copy(l.groundColor);
    this.hemi.intensity = l.hemiIntensity;
    this.sun.color.copy(l.sunColor);
    this.sun.intensity = l.sunIntensity;
    this.sun.position.copy(l.sunDirection);
    for (const m of this.set.materials) m.envMapIntensity = (m.userData.envBase ??= m.envMapIntensity) * l.env;
  }

  #envAge = 1;

  /** Rebuilds the reflections from the sky if they are out of date. */
  #refreshEnvironment(dt: number) {
    this.#envAge += dt;
    if (!this.#envDirty || (this.#env && this.#envAge < 0.4)) return;
    this.#envDirty = false;
    this.#envAge = 0;
    this.reflected = true;
    const l = this.light;
    const e = this.#envLight;
    e.zenith.copy(l.zenith);
    e.horizon.copy(l.horizon);
    e.ground.copy(l.groundColor);
    e.sun.copy(l.sunColor);
    e.direction.copy(l.sunDirection);
    const old = this.#env;
    this.#env = this.#pmrem.fromScene(this.#envScene, 0.02, 0.1, 100);
    this.scene.environment = this.#env.texture;
    this.#renderScene.environment = this.#env.texture;
    old?.dispose();
  }

  /** After the graphics context was lost and given back: the reflections were in it, and are drawn again. */
  contextRestored() {
    this.#envDirty = true;
    this.#envAge = 1;
  }

  /** The screen changed shape: the frame (and the chunkier world's, if it is) follows. Nothing in the world is built again. */
  resize(frame: Frame) {
    this.frame = frame;
    this.renderer.setSize(frame.width, frame.height, false);
    if (this.#lowRes) {
      const { width, height } = worldSize(frame, this.pixels);
      this.#lowRes.setSize(width, height);
    }
  }

  setPixels(pixels: PixelSize) {
    this.pixels = pixels;
    this.#lowRes?.dispose();
    this.#lowRes = null;
    if (pixels === "classic") return;
    const { width, height } = worldSize(this.frame, pixels);
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
    if (this.veil >= 1) {
      // Nothing of the world shows through a black veil, but a place being built behind it is still
      // drawn, so that its buffers and programs are on the GPU before it lifts: into one pixel, as
      // shading a whole frame of a large place would make each of those frames as slow as the GPU.
      r.setRenderTarget(null);
      r.clear(true, true, false);
      r.setScissor(0, 0, 1, 1);
      r.setScissorTest(true);
      this.renderPasses(camera);
      r.setScissorTest(false);
    } else {
      r.setRenderTarget(this.#lowRes);
      r.clear(true, true, false);
      this.renderPasses(camera);
    }
    if (this.veil < 1 && this.#lowRes && this.#blit) {
      r.setRenderTarget(null);
      r.clear(true, true, false);
      r.render(this.#blit.scene, this.#blit.camera);
    }
    if (this.veil > 0.002) {
      this.#veil.material.opacity = Math.min(1, this.veil);
      r.render(this.#veil.scene, VEIL_CAMERA);
    }
  }

  /** The two passes, into whatever target is set: the backdrop, then the table over it. */
  renderPasses(camera: THREE.PerspectiveCamera, scene: THREE.Scene = this.#renderScene) {
    const r = this.renderer;
    const { near, far } = camera;
    camera.near = FAR.near;
    camera.far = FAR.far;
    camera.updateProjectionMatrix();
    r.render(this.backdrop.scene, camera);
    r.clearDepth();
    camera.near = NEAR.near;
    camera.far = this.current.camera.reach ?? NEAR.far;
    camera.updateProjectionMatrix();
    r.render(scene, camera);
    camera.near = near;
    camera.far = far;
  }

  /** Starts a frame's cost count. */
  beginFrame() {
    this.renderer.info.reset();
    this.reflected = false;
  }

  /** The frame's cost so far. */
  measure(): FrameCost {
    const info = this.renderer.info;
    this.cost.calls = info.render.calls;
    this.cost.triangles = info.render.triangles;
    this.cost.textures = info.memory.textures;
    this.cost.geometries = info.memory.geometries;
    this.cost.programs = info.programs?.length ?? 0;
    return this.cost;
  }
}
