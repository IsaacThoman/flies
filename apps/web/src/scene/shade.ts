// A shadow passing over a place: something between the sun and the table (a
// bird gliding over) takes the sunlight off whatever it falls across, the fly
// included. Materials taught by `shaded` take it, in their own shading, so it
// falls across curved tops and the fly as it should; a place that casts one
// sets where it is in SHADE. Off (strength 0), it costs one branch per pixel.

import * as THREE from "three";

export const SHADE = {
  /** The shape seen from above, blurred at its edge as a shadow from high up is: white where it shades. */
  uShadeMap: { value: null as THREE.Texture | null },
  /** Where its middle falls on the table (x, z, mm), and the way its length points (cos, sin). */
  uShadeAt: { value: new THREE.Vector4(0, 0, 1, 0) },
  /** Half its length and width, mm, and how much of the sunlight it takes (0 off). */
  uShadeSize: { value: new THREE.Vector3(1, 1, 0) },
  /** The sun's direction over its height, for carrying a point down to the table along the sunlight. */
  uShadeSun: { value: new THREE.Vector3(0, 1, 0) },
};

const VERTEX_PARS = /* glsl */ `
varying vec3 vShadeWorld;`;

// The world position from the view-space one: three gives standard materials no world position of their own.
const VERTEX = /* glsl */ `
vShadeWorld = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz);`;

const FRAGMENT_PARS = /* glsl */ `
uniform sampler2D uShadeMap;
uniform vec4 uShadeAt;
uniform vec3 uShadeSize;
uniform vec3 uShadeSun;
varying vec3 vShadeWorld;`;

// Carried down to the table along the sunlight, the point lands where its shadow would; a shadow on parallel planes keeps its shape.
const FRAGMENT = /* glsl */ `
if (uShadeSize.z > 0.0) {
  vec2 onTable = vShadeWorld.xz - uShadeSun.xz * vShadeWorld.y;
  vec2 d = onTable - uShadeAt.xy;
  vec2 local = vec2(dot(d, uShadeAt.zw), dot(d, vec2(-uShadeAt.w, uShadeAt.z))) / uShadeSize.xy;
  if (abs(local.x) < 1.0 && abs(local.y) < 1.0) {
    float shadow = texture2D(uShadeMap, local * 0.5 + 0.5).r * uShadeSize.z;
    reflectedLight.directDiffuse *= 1.0 - shadow;
    reflectedLight.directSpecular *= 1.0 - shadow;
  }
}`;

/** Teaches a lit material to take the passing shadow, keeping whatever it already does to its shader. */
export function shaded<M extends THREE.Material>(material: M): M {
  const before = material.onBeforeCompile.bind(material);
  const key = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);
    Object.assign(shader.uniforms, SHADE);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>${VERTEX_PARS}`)
      .replace("#include <project_vertex>", `#include <project_vertex>${VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>${FRAGMENT_PARS}`)
      .replace("#include <lights_fragment_end>", `#include <lights_fragment_end>${FRAGMENT}`);
  };
  material.customProgramCacheKey = () => `${key()}+shade`;
  return material;
}
