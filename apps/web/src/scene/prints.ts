// Footprints: after the fly has stood in something sticky or wet, its feet
// leave faint prints where the gait plants them, tinted by what it stood in,
// fewer and fainter with each step until its feet are clean, each fading over
// a minute or two (water's sooner, as it dries). Walking back into food loads
// them again.
//
// They are only drawn. The fly doesn't taste, smell or feel its own prints:
// they are not in the pantry, nothing about them reaches its senses or its
// brain, and they change nothing it does.
//
// One instanced draw for all of them, a ring of PRINTS: a print is written
// only when a foot is set down (a handful of times a second while walking),
// and its fading is worked out in the shader from the time, so nothing runs
// per print per frame. Nothing is drawn while none is left, and the fly's eyes
// don't see them.

import * as THREE from "three";
import type { FlyModelWithRig } from "@fly/fly";
import type { Food, FoodKind, Pantry, World } from "@fly/world";
import { createSurface, isDropped } from "@fly/world";
import { random } from "./build.ts";

/** What a foot carries from something it stood in: the colour it stains a surface (multiplied into it), and whether it is water, which dries. */
export type Ink = { readonly tint: number; readonly wet: boolean };

const sticky = (tint: number): Ink => ({ tint, wet: false });
export const WATER: Ink = { tint: 0x8c939c, wet: true };

/**
 * What each of the places' own foods leaves on a fly's feet, by its name (the
 * patches, and what a place puts out to be found). A food not here is dry
 * (sugar, a crumb) and leaves nothing.
 */
export const INKS: Readonly<Record<string, Ink>> = {
  "tomato juice": sticky(0xc74725),
  "fig flesh": sticky(0xb94862),
  honey: sticky(0xd8861a),
  jam: sticky(0xb02838),
  "strawberry juice": sticky(0xd23c4e),
  lemonade: sticky(0xe8d264),
  orange: sticky(0xf0a446),
  "orange juice": sticky(0xf0962a),
  banana: sticky(0xdccb8e),
  "peach juice": sticky(0xf0a264),
  "grape juice": sticky(0x773d66),
  "plum juice": sticky(0x86305e),
  "grape agar": sticky(0x9c5274),
  "fly food": sticky(0xb08444),
  syrup: sticky(0xd08a32),
  "juice ring": sticky(0xd88a34),
  ketchup: sticky(0xb02418),
  espresso: sticky(0x6a4426),
  peach: sticky(0xf0a264),
  lemon: sticky(0xe6d870),
  coulis: sticky(0xb41e3c),
  soda: sticky(0x8a5a2e),
  grape: sticky(0xb4b86a),
  water: WATER,
};

/** What the player drops leaves, by its kind. */
export const DROPPED: Readonly<Record<FoodKind, Ink | null>> = {
  sugar: null,
  honey: INKS.honey,
  berry: sticky(0xc22c4c),
  water: WATER,
  // Coffee is thin, and dries as water does; the lump it spoiled is sticky with it, as the espresso's dregs are.
  coffee: { tint: INKS.espresso.tint, wet: true },
  laced: INKS.espresso,
};

export const inkOf = (food: Food): Ink | null => (isDropped(food) ? DROPPED[food.kind] : INKS[food.name]) ?? null;

/** Things standing in the world that are water (dew, a drop): a foot set on one comes away wet. */
export const WET_SOLIDS: ReadonlySet<string> = new Set(["dew", "drop"]);
/**
 * Where a print would not lie on what is drawn: a drink's surface (the
 * restaurant's juice in its glass, the espresso's dregs in its cup), water,
 * and things drawn rougher than the world's smooth shape of them (a crumpled
 * wipe, a brush's bristles, a bush of basil).
 */
export const NO_PRINTS: ReadonlySet<string> = new Set(["greenhouse leaves", "seedling crown", "water saucer", "kitchen glass", "juice glass", "espresso cup", "dew", "drop", "wipe", "bristles", "stems"]);

/** How many prints there can be at once; a new one takes the oldest's place. */
export const PRINTS = 128;
/** Seconds a sticky print lasts, and a wet one. */
export const STICKY_LIFE = 100;
export const WET_LIFE = 35;
/** A foot keeps this share of what it carries each step it takes off the food. */
export const KEEP = 0.8;
/** Carrying at least this much, a foot prints every step; less, fewer of them. */
export const EVERY = 0.4;
/** Carrying less than this, it leaves nothing. */
export const FAINTEST = 0.08;
/** A foot set down within this of where it last was (mm), shuffling, leaves no second print. */
export const APART = 0.12;
/** A planted foot this far (mm) off the surface under it is over an edge or a curve, not on it. */
export const TOUCHING = 0.25;
/** Half a print's width across the foot and its length along it, mm: the two pads of a fly's foot. */
const HALF_WIDTH = 0.13;
const HALF_LENGTH = 0.11;

/** What each of the six feet carries, and how much of it (0 to 1). */
export class InkedFeet {
  readonly load = new Float32Array(6);
  readonly ink: (Ink | null)[] = [null, null, null, null, null, null];

  /**
   * A foot set down: in food, it takes up what the food leaves (dry food
   * leaves it as it was) and prints nothing; elsewhere it prints with what it
   * carries, and carries less. Returns the print's strength, 0 for none.
   * `roll` (0 to 1, random) decides whether a faint foot prints this step.
   */
  plant(leg: number, inFood: boolean, ink: Ink | null, roll: number): number {
    if (inFood) {
      if (ink) {
        this.ink[leg] = ink;
        this.load[leg] = 1;
      }
      return 0;
    }
    const load = this.load[leg];
    if (load < FAINTEST || !this.ink[leg]) return 0;
    this.load[leg] = load * KEEP;
    return load >= EVERY || roll * EVERY < load ? load : 0;
  }

  clear() {
    this.load.fill(0);
    this.ink.fill(null);
  }
}

const VERTEX = /* glsl */ `
attribute vec4 aAt;
attribute vec4 aLie;
attribute vec4 aInk;
uniform float uTime;
varying vec2 vUv;
varying vec3 vInk;
varying float vAlpha;
varying float vDry;
void main() {
  float life = abs(aInk.w);
  float age = uTime - aAt.w;
  vAlpha = aLie.w * (1.0 - smoothstep(life * 0.2, life, age));
  // Water dries from its edge in: the wet print shrinks as it fades.
  vDry = aInk.w < 0.0 ? smoothstep(0.0, life, age) : 0.0;
  vInk = aInk.rgb;
  vUv = position.xy;
  vec3 n = vec3(aLie.x, sqrt(max(0.0, 1.0 - aLie.x * aLie.x - aLie.y * aLie.y)), aLie.y);
  vec3 across = normalize(cross(n, vec3(sin(aLie.z), 0.0, cos(aLie.z))));
  vec3 along = cross(across, n);
  float size = 0.85 + 0.3 * fract(sin(aAt.w * 12.9898 + aAt.x * 78.233) * 43758.5453);
  // Gone, it is a point, and covers no pixels.
  float shown = step(0.004, vAlpha);
  vec3 p = aAt.xyz + n * 0.004 + (across * position.x * ${HALF_WIDTH} + along * position.y * ${HALF_LENGTH}) * size * shown;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const FRAGMENT = /* glsl */ `
varying vec2 vUv;
varying vec3 vInk;
varying float vAlpha;
varying float vDry;
void main() {
  // The foot's two pads side by side, the claws' drag faint behind them.
  vec2 a = (vUv - vec2(-0.45, 0.15)) * vec2(1.9, 1.5);
  vec2 b = (vUv - vec2(0.45, 0.15)) * vec2(1.9, 1.5);
  float pads = 1.0 - min(length(a), length(b));
  float drag = (1.0 - smoothstep(0.05, 0.3, abs(vUv.x))) * smoothstep(-1.0, -0.2, vUv.y) * (1.0 - smoothstep(0.0, 0.3, vUv.y)) * 0.35;
  float edge = vDry * 0.6;
  float shape = max(smoothstep(edge, edge + 0.3, pads), drag * (1.0 - vDry));
  // Sticky things dry thickest at the rim.
  float rim = vDry > 0.0 ? 0.0 : smoothstep(0.05, 0.2, pads) * (1.0 - smoothstep(0.2, 0.45, pads)) * 0.35;
  float k = clamp((shape + rim) * vAlpha, 0.0, 1.0);
  if (k < 0.004) discard;
  gl_FragColor = vec4(mix(vec3(1.0), vInk, k), 1.0);
}`;

/** The prints themselves: a ring of them, one instanced draw. */
export class Prints {
  readonly mesh: THREE.Mesh;
  readonly #geometry = new THREE.InstancedBufferGeometry();
  readonly #at: THREE.InstancedBufferAttribute;
  readonly #lie: THREE.InstancedBufferAttribute;
  readonly #ink: THREE.InstancedBufferAttribute;
  readonly #time = { value: 0 };
  #next = 0;
  #written = 0;
  /** When the last print still showing will be gone. */
  #until = -Infinity;

  constructor(parent: THREE.Object3D) {
    const g = this.#geometry;
    g.setIndex([0, 2, 1, 0, 3, 2]);
    g.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    this.#at = new THREE.InstancedBufferAttribute(new Float32Array(PRINTS * 4), 4);
    this.#lie = new THREE.InstancedBufferAttribute(new Float32Array(PRINTS * 4), 4);
    this.#ink = new THREE.InstancedBufferAttribute(new Float32Array(PRINTS * 4), 4);
    for (const attribute of [this.#at, this.#lie, this.#ink]) attribute.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("aAt", this.#at);
    g.setAttribute("aLie", this.#lie);
    g.setAttribute("aInk", this.#ink);
    g.instanceCount = 0;
    // Multiplied into what is under it: a stain, under any light, and nothing to light.
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: this.#time },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.ZeroFactor,
      blendDst: THREE.SrcColorFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
    // Over the fly's own shadow, under everything see-through.
    this.mesh.renderOrder = 1;
    this.mesh.visible = false;
    this.mesh.matrixAutoUpdate = false;
    parent.add(this.mesh);
  }

  /** A print at a point on a surface with this upward normal, its foot pointing along `heading` (radians; 0 is +z). */
  add(x: number, y: number, z: number, nx: number, nz: number, heading: number, strength: number, ink: Ink, time: number) {
    const i = this.#next;
    this.#next = (i + 1) % PRINTS;
    const life = ink.wet ? WET_LIFE : STICKY_LIFE;
    this.#at.setXYZW(i, x, y, z, time);
    this.#lie.setXYZW(i, nx, nz, heading, (0.3 + 0.7 * Math.min(1, strength)) * (ink.wet ? 0.6 : 0.85));
    this.#ink.setXYZW(i, ((ink.tint >> 16) & 255) / 255, ((ink.tint >> 8) & 255) / 255, (ink.tint & 255) / 255, ink.wet ? -life : life);
    this.#at.needsUpdate = true;
    this.#lie.needsUpdate = true;
    this.#ink.needsUpdate = true;
    if (this.#written < PRINTS) this.#geometry.instanceCount = ++this.#written;
    this.#until = Math.max(this.#until, time + life);
  }

  update(time: number) {
    this.#time.value = time;
    this.mesh.visible = time < this.#until;
  }

  /** How many prints are still showing at this time. */
  count(time: number): number {
    if (time >= this.#until) return 0;
    const at = this.#at.array, ink = this.#ink.array;
    let n = 0;
    for (let i = 0; i < this.#written; i++) if (time - at[i * 4 + 3] < Math.abs(ink[i * 4 + 3])) n++;
    return n;
  }

  clear() {
    this.#next = 0;
    this.#written = 0;
    this.#geometry.instanceCount = 0;
    this.#until = -Infinity;
    this.mesh.visible = false;
  }
}

/** The fly's feet and the prints they leave, read from where its gait sets each foot down. */
export class Footprints {
  readonly feet = new InkedFeet();
  readonly prints: Prints;
  /** Which feet were in the air last frame. */
  readonly #swinging = new Uint8Array(6);
  /** Where each foot was last set down. */
  readonly #last = new Float64Array(12).fill(Infinity);
  readonly #foot = new THREE.Vector3();
  readonly #surface = createSurface();
  readonly #rnd = random(47);

  constructor(parent: THREE.Object3D) {
    this.prints = new Prints(parent);
  }

  /**
   * After the model is posed and placed for this frame. `standing`: on its
   * feet; `grooming`: its front legs are off the ground, at its head.
   */
  update(model: FlyModelWithRig, standing: boolean, grooming: boolean, world: World, pantry: Pantry, time: number) {
    const gait = model.rig.gait;
    let placed = false;
    for (let leg = 0; leg < 6; leg++) {
      const swinging = gait.swinging[leg];
      const landed = this.#swinging[leg] === 1 && swinging === 0;
      this.#swinging[leg] = swinging;
      // Taking off and landing set every foot down at once, in the air: only a step lands a foot.
      if (!landed || !standing || (grooming && leg < 2)) continue;
      if (!placed) {
        model.object.updateWorldMatrix(true, false);
        placed = true;
      }
      this.#step(leg, model, world, pantry, time);
    }
    this.prints.update(time);
  }

  #step(leg: number, model: FlyModelWithRig, world: World, pantry: Pantry, time: number) {
    const feet = model.rig.gait.feet;
    const matrix = model.object.matrixWorld;
    const p = this.#foot.set(feet[leg * 3], 0, feet[leg * 3 + 2]).applyMatrix4(matrix);
    // The surface under the foot, not one over it (a table top over the floor).
    const surface = world.surface(p.x, p.z, this.#surface, p.y + TOUCHING);
    if (!surface.onTable) return;
    const solid = surface.solid >= 0 ? world.solids[surface.solid].name : "";
    const food = pantry.touching(p.x, surface.y, p.z, 0);
    const wet = WET_SOLIDS.has(solid);
    const inFood = food !== null || wet;
    const last = this.#last;
    const i = leg * 2;
    if (!inFood && Math.hypot(p.x - last[i], p.z - last[i + 1]) < APART) return;
    last[i] = p.x;
    last[i + 1] = p.z;
    const ink = food ? inkOf(food) : wet ? WATER : null;
    const strength = this.feet.plant(leg, inFood, ink, this.#rnd.next());
    if (strength <= 0 || NO_PRINTS.has(solid) || Math.abs(p.y - surface.y) > TOUCHING) return;
    // The foot points out from the middle of the body, as its last segments do.
    const e = matrix.elements;
    const heading = Math.atan2(p.x - e[12], p.z - e[14]) + (this.#rnd.next() - 0.5) * 0.4;
    this.prints.add(p.x, surface.y, p.z, surface.normal.x, surface.normal.z, heading, strength, this.feet.ink[leg]!, time);
  }

  /** The fly has been carried somewhere else: its old prints and what was on its feet are left behind. */
  clear() {
    this.feet.clear();
    this.prints.clear();
    this.#last.fill(Infinity);
  }
}
