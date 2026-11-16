// The fly's eyes. Every few frames the world is rendered round the fly's head
// as six tiny views, from a low-detail layer of the scene (the big shapes, the
// ball, the bubbles and the food; not the menus or the pointer), read back
// once and resampled to each facet (packages/body/src/vision.ts).
//
// When the brain has eyes (BrainDriver.eyes), the result is its `light`
// sense, and the game sends no hand-wired looming. Until then the same
// machinery, on a stand-in facet layout, draws the "through the fly's eyes"
// picture for the player, clearly labelled as a picture.

import * as THREE from "three";
import type { EyeMap } from "@fly/brain";
import { FACES, HEAD_AHEAD, HEAD_UP, FLY_LENGTH, createSampler, sample, standInEyes } from "@fly/body";
import type { Sampler } from "@fly/body";
import type { Frame } from "../display.ts";
import type { Life } from "../life.ts";
import type { EyesDetail } from "../settings.ts";
import { NEAR } from "../stage.ts";
import type { Stage } from "../stage.ts";
import { pictureDots } from "../ui/layout.ts";
import type { HudLayout } from "../ui/layout.ts";

/**
 * How the picture lays the facets out on the TV, in clip space: x from the
 * azimuth (all the way round is twice `azimuth`), y from the elevation
 * (straight up to straight down is twice `elevation`), raised by `lift`. On
 * other screens the HUD's layout places the panel and scales the dots
 * (ui/layout.ts, pictureDots), in the same proportions; so does the corner
 * inset (inset.ts).
 */
export const PICTURE_LAYOUT = { azimuth: 0.76, elevation: 0.45, lift: 0.09 };

/** A facet's colour from its light (0 to 1) and its eye (0 left, 1 right), in both pictures. */
export const FACET_COLOR = /* glsl */ `
vec3 facetColor(float light, float side) {
  vec3 dark = mix(vec3(0.03, 0.07, 0.16), vec3(0.06, 0.04, 0.14), side);
  vec3 lit = mix(vec3(0.85, 1.0, 0.92), vec3(1.0, 0.95, 0.85), side);
  return mix(dark, lit, pow(light, 0.8));
}`;

/** The layer the eyes see. */
export const EYE_LAYER = 1;
/** Each view's size in pixels, and how many times a second they refresh, by detail. */
export const DETAIL = { low: { resolution: 16, hz: 20 }, high: { resolution: 32, hz: 30 } } as const;
/**
 * While something is coming at the fly fast (the ball), the eyes refresh every
 * frame: a fly's looming detectors answer how quickly the dark area grows, and
 * a 20 Hz picture blunts that (escape take-offs went from about one throw in
 * six to one in two).
 */
export const URGENT_HZ = 60;

const PICTURE_VS = /* glsl */ `
attribute float light;
attribute float side;
uniform float size;
uniform vec4 place;
varying float vLight;
varying float vSide;
void main() {
  vLight = light;
  vSide = side;
  // Azimuth and elevation (radians) to clip space: scaled, then moved.
  gl_Position = vec4(position.xy * place.xy + place.zw, 0.0, 1.0);
  gl_PointSize = size;
}`;

const PICTURE_FS = /* glsl */ `
varying float vLight;
varying float vSide;
${FACET_COLOR}
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = dot(p, p);
  if (r > 1.0) discard;
  // Each facet a little lens: brightest in the middle.
  float lens = 1.0 - r * 0.35;
  gl_FragColor = vec4(facetColor(vLight, vSide) * lens, 1.0);
}`;

export class Eyes {
  /** From the settings: how finely to render, or off. */
  detail: EyesDetail = "low";
  /** How often they refresh, as a share of their detail's rate: lowered on a device that can't keep up (quality.ts). */
  rate = 1;
  /** CPU time of the last refresh, ms (render submission and resampling), and its draws. */
  costMs = 0;
  costCalls = 0;
  /** Refreshes so far. */
  updates = 0;
  readonly #stage: Stage;
  readonly #life: Life;
  readonly #standIn: EyeMap = standInEyes();
  #map: EyeMap | null = null;
  #samplers: { left: Sampler; right: Sampler } | null = null;
  #target: THREE.WebGLRenderTarget | null = null;
  #pixels: Uint8Array | null = null;
  #cameras = FACES.map(() => new THREE.PerspectiveCamera(90, 1, 0.3, 4000));
  #faceQ = FACES.map((f) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...f.right), new THREE.Vector3(...f.up), new THREE.Vector3(...f.forward).negate())));
  #light: { left: Float32Array; right: Float32Array } | null = null;
  #hasLight = false;
  #since = 0;
  #pending = false;
  #sky: THREE.Mesh;
  picture: { scene: THREE.Scene; camera: THREE.Camera; points: THREE.Points; backing: THREE.Mesh; light: THREE.BufferAttribute; map: EyeMap } | null = null;
  /** Where the picture goes: clip space per radian and its middle, its panel, and how big its dots are for their count. */
  readonly #place = new THREE.Vector4(PICTURE_LAYOUT.azimuth / Math.PI, PICTURE_LAYOUT.elevation / (Math.PI / 2), 0, PICTURE_LAYOUT.lift);
  /** The panel's middle and size in clip space: the TV's until laid out. */
  readonly #panel = { x: 0, y: 0.16, w: 1.68, h: 1.24 };
  #dotScale = 1;
  #head = new THREE.Vector3();
  #q = new THREE.Quaternion();
  #yaw = new THREE.Quaternion();

  constructor(stage: Stage, life: Life) {
    this.#stage = stage;
    this.#life = life;
    for (const camera of this.#cameras) camera.layers.set(EYE_LAYER);
    // What the eyes see beyond the table: the sky and the lawn, as a simple gradient round the head.
    const light = stage.light;
    this.#sky = new THREE.Mesh(
      new THREE.SphereGeometry(3000, 24, 12),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { zenith: { value: light.zenith }, horizon: { value: light.horizon }, ground: { value: light.groundColor }, sunDir: { value: light.sunDirection }, sunColor: { value: light.sunColor } },
        vertexShader: "varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: `uniform vec3 zenith; uniform vec3 horizon; uniform vec3 ground; uniform vec3 sunDir; uniform vec3 sunColor; varying vec3 vDir;
          void main() {
            vec3 d = normalize(vDir);
            vec3 c = d.y > 0.0 ? mix(horizon, zenith, smoothstep(0.0, 0.6, d.y)) : ground * 0.8;
            c += sunColor * pow(max(dot(d, sunDir), 0.0), 200.0) * 2.0;
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    );
    this.#sky.renderOrder = -10;
    this.#sky.layers.set(EYE_LAYER);
    this.#sky.frustumCulled = false;
    stage.scene.add(this.#sky);
    // Lights answer to layers too: the eyes' views need them.
    stage.hemi.layers.enable(EYE_LAYER);
    stage.sun.layers.enable(EYE_LAYER);
  }

  /** Places the picture where the HUD's layout has it (between the caption and the tool's label). */
  layout(frame: Frame, hud: HudLayout) {
    const { width, height } = frame.design;
    const dots = pictureDots(hud);
    this.#place.set((dots.azimuth * 2) / width, (dots.elevation * 2) / height, (dots.x * 2) / width - 1, 1 - (dots.y * 2) / height);
    const p = hud.picture;
    this.#panel.x = ((p.x + p.w / 2) * 2) / width - 1;
    this.#panel.y = 1 - ((p.y + p.h / 2) * 2) / height;
    this.#panel.w = (p.w * 2) / width;
    this.#panel.h = (p.h * 2) / height;
    // Dots as big for the picture's size, in the frame's pixels, as on the TV.
    this.#dotScale = ((dots.azimuth * 2 * Math.PI) / 649.04) * (frame.height / height);
    if (this.picture) this.#placePicture(this.picture);
  }

  #placePicture(picture: NonNullable<Eyes["picture"]>) {
    const p = this.#panel;
    picture.backing.position.set(p.x, p.y, 0);
    picture.backing.scale.set(p.w, p.h, 1);
    picture.backing.updateMatrixWorld();
    const n = picture.light.count;
    (picture.points.material as THREE.ShaderMaterial).uniforms.size.value = Math.max(2, Math.min(7, 200 / Math.sqrt(n)) * this.#dotScale);
  }

  /** Marks things the eyes should see (the ball, the bubbles, food). */
  see(object: THREE.Object3D) {
    object.traverse((o) => o.layers.enable(EYE_LAYER));
  }

  /** The brain has eyes and they're switched on: the brain gets light, not hand-wired looming. */
  get inUse() {
    return this.detail !== "off" && !!this.#life.brain.eyes && this.#life.brain.status === "running";
  }

  /** Rendering for the brain or for the picture. */
  active = false;

  /** How many facets there are now. */
  get facets() {
    return (this.map.left.directions.length + this.map.right.directions.length) / 3;
  }

  /** Whether the facets are the brain's own or the stand-in. */
  get standIn() {
    return !this.#life.brain.eyes;
  }

  /** Before the fly's frame: hands the brain the last picture, if it has eyes. */
  beforeStep() {
    this.#life.light = this.inUse && this.#hasLight ? this.#light : null;
  }

  /** The facets in use: the brain's, or the stand-in for the picture. */
  get map(): EyeMap {
    return this.#life.brain.eyes ?? this.#standIn;
  }

  /** The last complete picture of the facets in use (`map`), one value per facet, or null until there is one. */
  get light(): { readonly left: Float32Array; readonly right: Float32Array } | null {
    return this.#hasLight && this.#map === this.map ? this.#light : null;
  }

  /**
   * Refreshes the eyes when due, and draws the picture over the frame when
   * asked. Call after the world has been rendered. `forInset`: the corner
   * picture (inset.ts) is up, so they render even when not for the brain.
   */
  render(dt: number, showPicture: boolean, urgent = false, forInset = false) {
    this.active = this.inUse || showPicture || forInset;
    if (!this.active) {
      this.costMs = 0;
      this.costCalls = 0;
      return;
    }
    const detail = DETAIL[this.detail === "high" ? "high" : "low"];
    this.#since += dt;
    const hz = urgent ? URGENT_HZ : detail.hz * this.rate;
    // One read in flight: a slow GPU must not accumulate pictures or sampling work.
    if (!this.#pending && (this.#since >= 1 / hz - 1e-3 || !this.#light)) {
      this.#since = 0;
      this.#refresh(detail.resolution);
    }
    if (showPicture) this.#drawPicture();
  }

  /** The graphics context was lost and given back: a read in flight then will never finish. */
  contextRestored() {
    this.#pending = false;
  }

  #prepare(resolution: number) {
    const map = this.map;
    if (this.#target && this.#map === map && this.#samplers?.left.resolution === resolution) return;
    const sameMap = this.#map === map;
    this.#map = map;
    this.#target?.dispose();
    this.#target = new THREE.WebGLRenderTarget(resolution * FACES.length, resolution, { depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.#pixels = new Uint8Array(resolution * FACES.length * resolution * 4);
    this.#samplers = { left: createSampler(map.left.directions, resolution), right: createSampler(map.right.directions, resolution) };
    if (!sameMap) {
      this.#light = { left: new Float32Array(this.#samplers.left.count), right: new Float32Array(this.#samplers.right.count) };
      this.#hasLight = false;
    }
  }

  #refresh(resolution: number) {
    const started = performance.now();
    this.#prepare(resolution);
    const stage = this.#stage;
    const renderer = stage.renderer;
    const body = this.#life.body;
    const callsBefore = renderer.info.render.calls;
    // The head, and the way the body faces (tilted to the surface it stands on).
    const p = body.position;
    const s = Math.sin(body.yaw);
    const c = Math.cos(body.yaw);
    const L = FLY_LENGTH;
    this.#head.set(p.x + s * HEAD_AHEAD * L, p.y + HEAD_UP * L, p.z + c * HEAD_AHEAD * L);
    this.#yaw.setFromAxisAngle(UP, body.yaw);
    this.#q.setFromUnitVectors(UP, scratchUp.set(body.up.x, body.up.y, body.up.z)).multiply(this.#yaw);
    this.#sky.position.copy(this.#head);
    this.#sky.updateMatrixWorld();
    const target = this.#target!;
    target.viewport.set(0, 0, resolution * FACES.length, resolution);
    target.scissorTest = false;
    renderer.setRenderTarget(target);
    renderer.clear(true, true, false);
    target.scissorTest = true;
    const far = stage.current.camera.reach ?? NEAR.far;
    for (let i = 0; i < FACES.length; i++) {
      const camera = this.#cameras[i];
      if (camera.far !== far) {
        camera.far = far;
        camera.updateProjectionMatrix();
      }
      camera.position.copy(this.#head);
      camera.quaternion.copy(this.#q).multiply(this.#faceQ[i]);
      camera.updateMatrixWorld();
      target.viewport.set(i * resolution, 0, resolution, resolution);
      target.scissor.set(i * resolution, 0, resolution, resolution);
      renderer.setRenderTarget(target);
      renderer.render(stage.scene, camera);
    }
    target.scissorTest = false;
    const pixels = this.#pixels!;
    const read = renderer.readRenderTargetPixelsAsync(target, 0, 0, resolution * FACES.length, resolution, pixels);
    renderer.setRenderTarget(null);
    this.#pending = true;
    this.costCalls = renderer.info.render.calls - callsBefore;
    this.costMs = performance.now() - started;
    // Keep the last completed light while the GPU works; the frame never waits for it.
    void read.then(() => {
      const sampled = performance.now();
      const light = this.#light!;
      sample(pixels, this.#samplers!.left, light.left);
      sample(pixels, this.#samplers!.right, light.right);
      this.#hasLight = true;
      this.updates++;
      if (this.picture) this.#fillPicture();
      this.costMs += performance.now() - sampled;
    }).catch((error: unknown) => {
      console.warn("The fly's eye readback failed", error);
    }).finally(() => { this.#pending = false; });
  }

  /** The picture of what the eyes take in: every facet a dot, both eyes laid out by where they look. */
  #drawPicture() {
    const map = this.map;
    if (!this.picture || this.picture.map !== map) this.#buildPicture(map);
    const picture = this.picture!;
    this.#stage.renderer.render(picture.scene, picture.camera);
  }

  #buildPicture(map: EyeMap) {
    const n = map.left.directions.length / 3 + map.right.directions.length / 3;
    const positions = new Float32Array(n * 3);
    const sides = new Float32Array(n);
    let k = 0;
    for (const [side, eye] of [[0, map.left], [1, map.right]] as const) {
      const d = eye.directions;
      for (let i = 0; i < d.length / 3; i++) {
        const azimuth = Math.atan2(d[i * 3], d[i * 3 + 1]);
        const elevation = Math.asin(Math.max(-1, Math.min(1, d[i * 3 + 2])));
        // Equirectangular: placed in the panel, between its heading and its labels, by the shader.
        positions[k * 3] = azimuth;
        positions[k * 3 + 1] = elevation;
        sides[k] = side;
        k++;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const light = new THREE.BufferAttribute(new Float32Array(n), 1);
    light.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("light", light);
    geometry.setAttribute("side", new THREE.BufferAttribute(sides, 1));
    const points = new THREE.Points(geometry, new THREE.ShaderMaterial({ vertexShader: PICTURE_VS, fragmentShader: PICTURE_FS, uniforms: { size: { value: 2 }, place: { value: this.#place } }, depthTest: false, depthWrite: false, transparent: true }));
    points.frustumCulled = false;
    // Over the backing: both are in the transparent list, drawn in this order.
    points.renderOrder = 1;
    const scene = new THREE.Scene();
    const backing = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: "#020a1c", transparent: true, opacity: 0.88, depthTest: false, depthWrite: false }));
    scene.add(backing, points);
    scene.matrixWorldAutoUpdate = false;
    points.updateMatrixWorld();
    this.picture?.points.geometry.dispose();
    this.picture = { scene, camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), points, backing, light, map };
    this.#placePicture(this.picture);
    this.#fillPicture();
  }

  #fillPicture() {
    const picture = this.picture;
    const light = this.#light;
    if (!picture || !light || picture.map !== this.#map) return;
    const array = picture.light.array as Float32Array;
    array.set(light.left, 0);
    array.set(light.right, light.left.length);
    picture.light.needsUpdate = true;
  }
}

const UP = new THREE.Vector3(0, 1, 0);
const scratchUp = new THREE.Vector3();
