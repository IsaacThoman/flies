// The fly's body: a male Drosophila melanogaster built in code, posed by
// the game through FlyPose. Two meshes, so two draw calls: the body (head,
// thorax, abdomen, legs, mouthparts, halteres, bristles) and the wings. The
// rig (rig.ts) works out every joint's frame on the CPU in plain typed-array
// maths; the vertex shaders apply them. See README.md for how it is made.
//
// With the X-ray on, a third: the nervous system inside it (nerves/), posed
// by the same joints, while the body is drawn as a clear shell over it.

import * as THREE from "three";
import type { FlyAnchor, FlyModel, FlyNerves, FlyPose } from "@fly/contracts";
import { buildBody } from "./body.ts";
import { createBodyDepthMaterials, createBodyMaterial, createWingDepthMaterial, createWingMaterial } from "./materials.ts";
import type { FlyUniforms } from "./materials.ts";
import { buildNerves, restFrames } from "./nerves/build.ts";
import { createNervesMaterial } from "./nerves/materials.ts";
import { GLOW_SLOTS, NERVE_PARTS } from "./nerves/parts.ts";
import { FlyRig } from "./rig.ts";
import { buildWingGeometry, buildWingTexture } from "./wing.ts";

export type { FlyRig } from "./rig.ts";
export { NERVE_PARTS, LEG_NAMES, SIDES } from "./nerves/parts.ts";
export type { NervePart, NerveRole, NerveKind, NerveSide } from "./nerves/parts.ts";
export { createNervesPanelMaterial, ROLE_COLORS } from "./nerves/materials.ts";
export type { NervesPanelUniforms } from "./nerves/materials.ts";

/** The nervous system as the corner panel needs it too: the same geometry and glow, and the rest pose to draw it in. */
export type FlyNervesModel = FlyNerves & {
  readonly parts: typeof NERVE_PARTS;
  readonly geometry: THREE.BufferGeometry;
  /** The glow as the shaders' uniform (its value is `glow`), for another material to share. */
  readonly glowUniform: { value: Float32Array };
  /** Joint frames of the fly standing at rest. */
  readonly rest: Float32Array;
  /** Every material the X-ray puts on the body, for a game that teaches its materials something. */
  readonly materials: readonly THREE.Material[];
};

/** A FlyModel with its rig exposed, for the viewer and the tests. */
export type FlyModelWithRig = FlyModel & {
  readonly rig: FlyRig;
  readonly nerves: FlyNervesModel;
  /** Paints a dab of colour on its thorax, as researchers mark flies to tell them apart (at a table with others); null for none. */
  mark(colour: THREE.ColorRepresentation | null): void;
  /** Dims the body, 0 to 1. */
  dim(k: number): void;
};

/**
 * Where the X-ray is sorted among the world's other see-through things: with
 * its glass jars (by distance), before the bubbles, the rain and the
 * pointer, which are drawn over everything.
 */
const XRAY_ORDER = 3;

export function createFly(): FlyModelWithRig {
  const rig = new FlyRig();
  const glow = new Float32Array(GLOW_SLOTS);
  const uniforms: FlyUniforms = {
    uJoints: { value: rig.joints },
    uWings: { value: rig.wings },
    uWingAlpha: { value: rig.wingAlpha },
    uWingHaze: { value: 0 },
    uPixels: { value: 240 },
    uSky: { value: 0.55 },
    uXray: { value: 0 },
    uGlow: { value: glow },
    uMark: { value: new THREE.Vector4(0, 0, 0, 0) },
    uDim: { value: 0 },
  };

  const object = new THREE.Group();
  object.name = "fly";

  // Built first: among things of one render order at one distance three draws
  // the oldest first, and the nervous system has to be drawn before the glass
  // body over it, and that before the wings.
  const rest = restFrames();
  const nervesGeometry = buildNerves(rest);
  const nervesMaterial = createNervesMaterial(uniforms);
  const nervesMesh = new THREE.Mesh(nervesGeometry, nervesMaterial);
  nervesMesh.name = "fly-nerves";
  nervesMesh.renderOrder = XRAY_ORDER;
  nervesMesh.visible = false;

  const bodyGeometry = buildBody();
  const bodyMaterial = createBodyMaterial(uniforms);
  const glassMaterial = createBodyMaterial(uniforms, true);
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  const bodyDepth = createBodyDepthMaterials(uniforms);
  body.customDepthMaterial = bodyDepth.depth;
  body.customDistanceMaterial = bodyDepth.distance;
  body.name = "fly-body";

  const wingTexture = buildWingTexture();
  const wingGeometry = buildWingGeometry();
  const wingMaterial = createWingMaterial(uniforms, wingTexture);
  const wings = new THREE.Mesh(wingGeometry, wingMaterial);
  wings.customDepthMaterial = createWingDepthMaterial(uniforms, wingTexture);
  wings.name = "fly-wings";
  wings.renderOrder = 1;

  // Vertices are stored in their joints' spaces, so three cannot measure the
  // posed fly; this sphere holds it in any pose, wings spread included. The
  // three meshes share its centre, so they sort as one.
  const bounds = new THREE.Sphere(new THREE.Vector3(0, 0.3, 0), 1.2);
  bodyGeometry.boundingSphere = bounds;
  wingGeometry.boundingSphere = bounds.clone();
  nervesGeometry.boundingSphere = bounds.clone();

  // How many pixels a body length covers depends on the viewport: read it as each mesh is drawn.
  const viewport = new THREE.Vector4();
  body.onBeforeRender = (renderer) => {
    renderer.getCurrentViewport(viewport);
    uniforms.uPixels.value = viewport.w / 2;
  };
  nervesMesh.onBeforeRender = body.onBeforeRender;
  object.add(body, wings, nervesMesh);

  const nerves: FlyNervesModel = {
    parts: NERVE_PARTS,
    glow,
    xray: 0,
    geometry: nervesGeometry,
    glowUniform: uniforms.uGlow,
    rest,
    materials: [glassMaterial],
  };
  let xrayOn = false;

  const point = new Float64Array(3);
  return {
    object,
    rig,
    nerves,
    update(pose: FlyPose, dt: number) {
      rig.update(pose, dt);
      uniforms.uWingHaze.value = rig.wingHaze;
      const xray = Number.isFinite(nerves.xray) ? Math.min(1, Math.max(0, nerves.xray)) : 0;
      uniforms.uXray.value = xray;
      // Exactly the ordinary fly at 0: opaque, and nothing more to draw.
      if (xray > 0 !== xrayOn) {
        xrayOn = xray > 0;
        body.material = xrayOn ? glassMaterial : bodyMaterial;
        body.renderOrder = xrayOn ? XRAY_ORDER : 0;
        wings.renderOrder = xrayOn ? XRAY_ORDER : 1;
        nervesMesh.visible = xrayOn;
      }
    },
    mark(colour: THREE.ColorRepresentation | null) {
      const c = new THREE.Color(colour ?? 0);
      uniforms.uMark.value.set(c.r, c.g, c.b, colour === null ? 0 : 1);
    },
    dim(k: number) {
      uniforms.uDim.value = k;
    },
    anchor(name: FlyAnchor, out: THREE.Vector3) {
      rig.anchorLocal(name, point);
      object.updateWorldMatrix(true, false);
      return out.set(point[0], point[1], point[2]).applyMatrix4(object.matrixWorld);
    },
    dispose() {
      bodyGeometry.dispose();
      bodyMaterial.dispose();
      glassMaterial.dispose();
      bodyDepth.depth.dispose();
      bodyDepth.distance.dispose();
      wingGeometry.dispose();
      wingMaterial.dispose();
      (wings.customDepthMaterial as THREE.Material).dispose();
      wingTexture.dispose();
      nervesGeometry.dispose();
      nervesMaterial.dispose();
    },
  };
}
