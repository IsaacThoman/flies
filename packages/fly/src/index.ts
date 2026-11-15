// The fly's body: a male Drosophila melanogaster built in code, posed by
// the game through FlyPose. Two meshes, so two draw calls: the body (head,
// thorax, abdomen, legs, mouthparts, halteres, bristles) and the wings. The
// rig (rig.ts) works out every joint's frame on the CPU in plain typed-array
// maths; the vertex shaders apply them. See README.md for how it is made.

import * as THREE from "three";
import type { FlyAnchor, FlyModel, FlyPose } from "@fly/contracts";
import { buildBody } from "./body.ts";
import { createBodyDepthMaterials, createBodyMaterial, createWingDepthMaterial, createWingMaterial } from "./materials.ts";
import type { FlyUniforms } from "./materials.ts";
import { FlyRig } from "./rig.ts";
import { buildWingGeometry, buildWingTexture } from "./wing.ts";

export type { FlyRig } from "./rig.ts";

/** A FlyModel with its rig exposed, for the viewer and the tests. */
export type FlyModelWithRig = FlyModel & { readonly rig: FlyRig };

export function createFly(): FlyModelWithRig {
  const rig = new FlyRig();
  const uniforms: FlyUniforms = {
    uJoints: { value: rig.joints },
    uWings: { value: rig.wings },
    uWingAlpha: { value: rig.wingAlpha },
    uWingHaze: { value: 0 },
    uPixels: { value: 240 },
    uSky: { value: 0.55 },
  };

  const object = new THREE.Group();
  object.name = "fly";

  const bodyGeometry = buildBody();
  const bodyMaterial = createBodyMaterial(uniforms);
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
  // posed fly; this sphere holds it in any pose, wings spread included.
  const bounds = new THREE.Sphere(new THREE.Vector3(0, 0.3, 0), 1.2);
  bodyGeometry.boundingSphere = bounds;
  wingGeometry.boundingSphere = bounds.clone();

  // How many pixels a body length covers depends on the viewport: read it as each mesh is drawn.
  const viewport = new THREE.Vector4();
  body.onBeforeRender = (renderer) => {
    renderer.getCurrentViewport(viewport);
    uniforms.uPixels.value = viewport.w / 2;
  };
  object.add(body, wings);

  const point = new Float64Array(3);
  return {
    object,
    rig,
    update(pose: FlyPose, dt: number) {
      rig.update(pose, dt);
      uniforms.uWingHaze.value = rig.wingHaze;
    },
    anchor(name: FlyAnchor, out: THREE.Vector3) {
      rig.anchorLocal(name, point);
      object.updateWorldMatrix(true, false);
      return out.set(point[0], point[1], point[2]).applyMatrix4(object.matrixWorld);
    },
    dispose() {
      bodyGeometry.dispose();
      bodyMaterial.dispose();
      bodyDepth.depth.dispose();
      bodyDepth.distance.dispose();
      wingGeometry.dispose();
      wingMaterial.dispose();
      (wings.customDepthMaterial as THREE.Material).dispose();
      wingTexture.dispose();
    },
  };
}
