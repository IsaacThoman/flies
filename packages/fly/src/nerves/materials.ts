// How the nervous system is drawn: inside the fly in the world (the X-ray),
// and from above in a panel in a corner of the screen. Both draw the same
// geometry with the same glow array through the same function, so they can
// never disagree.
//
// What lights a part is activity and nothing else. Its glow g (0 to 1, which
// the game sets from a real firing rate) takes it from its tissue's colour
// toward its role's (blue for sensory neurons, amber for the neurons between,
// red for motor and neurosecretory ones) by (g / 0.35)², all the way at 0.35,
// and it covers more of what is behind it as it does; and it gives off light
// in that colour in proportion to g². The square keeps the low hum of
// background activity close to the tissue's colour and lets a burst stand out
// (in a ball's dive the optic lobes go from about 0.07 to 0.35). A part with
// no activity is drawn as tissue alone: in the
// world, lit by the scene's lights like the rest of the fly (so at night it is
// as dark as the night); in the panel, a faint constant stain on the dark
// glass, as a neuropil stain shows the anatomy in a micrograph. In the world a
// faint constant outline keeps its shape legible in the dark.
//
// Both blend premultiplied, so the tissue covers what is behind it and the
// light is added on top in one draw (in the panel, after its backdrop, which
// is in the same draw).

import * as THREE from "three";
import { BODY_JOINTS } from "../anatomy.ts";
import { JOINT_PARS } from "../materials.ts";
import type { FlyUniforms } from "../materials.ts";
import { GLOW_SLOTS } from "./parts.ts";

/** Each role's colour at full glow, linear. */
export const ROLE_COLORS = { sensory: [0.1, 0.5, 1.0], central: [1.0, 0.6, 0.1], motor: [1.0, 0.12, 0.26] } as const;
/** The tissue's own colour, under the scene's light. */
const TISSUE = "#456179";
/**
 * In the world, a faint cool tone over every part, strongest at its edge, the
 * same at all times for every part, as an X-ray shows bone: the shape stays
 * legible in a dark room, and nothing about it changes with activity. As the
 * screen shows it, to add.
 */
const OUTLINE = [0.12, 0.19, 0.25] as const;
/** The panel's stain: the anatomy, faint, at no time lit by activity. Linear. */
const STAIN = [0.065, 0.095, 0.14] as const;

const vec3 = (c: readonly number[]) => `vec3(${c.map((x) => x.toFixed(3)).join(", ")})`;

/** Thin things are drawn at least this wide (radius, in pixels), as the body's legs are. */
const MIN_RADIUS_PX = "0.55";

const VERTEX_PARS = /* glsl */ `
${JOINT_PARS("uJoints", BODY_JOINTS)}
attribute vec4 aInfo;
attribute vec4 aTube;
uniform vec4 uGlow[${GLOW_SLOTS / 4}];
varying vec4 vNerve;
float nerveGlow(float part) {
  int i = int(part + 0.5);
  vec4 g = uGlow[i / 4];
  int c = i - (i / 4) * 4;
  return c == 0 ? g.x : c == 1 ? g.y : c == 2 ? g.z : g.w;
}
`;

/** Glow and look to the fragment stage: x glow, y role, z opacity, w how much of it is at the edge. */
const PASS_NERVE = /* glsl */ `
vNerve = vec4(aInfo.x < -0.5 ? 0.0 : nerveGlow(aInfo.x), aInfo.y, aInfo.z, aInfo.w);
`;

/**
 * A part as drawn, from its tissue's colour (linear), its look (opacity, and
 * how much of that is at its edge), how squarely it faces the viewer, its
 * role and its glow: its colour and how much it covers (rgb, a; straight,
 * linear) and the light it gives off (as the screen shows it, to add).
 */
const NERVE_DRAW = /* glsl */ `
vec3 nerveHue(float role) {
  return role < 0.5 ? ${vec3(ROLE_COLORS.sensory)} : role < 1.5 ? ${vec3(ROLE_COLORS.central)} : ${vec3(ROLE_COLORS.motor)};
}
vec4 nerveCover(vec3 tissue, vec4 nerve, float facing) {
  float lit = min(1.0, nerve.x * nerve.x / 0.1225);
  float tissueCover = nerve.z * mix(1.0, 1.0 - facing, abs(nerve.w));
  return vec4(mix(tissue, nerveHue(nerve.y), lit), mix(tissueCover, 0.85 * (0.5 + 0.5 * facing), lit));
}
vec3 nerveShine(vec4 nerve, float facing) {
  return linearToOutputTexel(vec4(nerveHue(nerve.y), 1.0)).rgb * nerve.x * nerve.x * 1.0 * (0.5 + 0.5 * facing);
}
`;

/**
 * Keeps tubes and small organs at least a pixel across, as the body does its
 * legs: their axis point and radius are in aTube; `flyPx` is the radius in
 * pixels, worked out by each projection in its own way.
 */
const GROW = /* glsl */ `
if (aTube.w > 0.0) {
  float nerveMin = aInfo.w < 0.0 ? 1.0 : ${MIN_RADIUS_PX};
  float flyGrow = max(1.0, nerveMin / max(flyPx, 1e-6));
  transformed = aTube.xyz + (position - aTube.xyz) * flyGrow;
}
`;

/** The X-ray: drawn in the world, posed by the rig, inside the glass body. */
export function createNervesMaterial(uniforms: FlyUniforms): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({
    color: TISSUE, transparent: true, depthWrite: false, fog: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uJoints: uniforms.uJoints, uPixels: uniforms.uPixels, uGlow: uniforms.uGlow, uXray: uniforms.uXray });
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERTEX_PARS}\nuniform float uPixels;`)
      .replace("#include <beginnormal_vertex>", "vec3 objectNormal = normalize(flyRotate(int(aJoint + 0.5) * 3, normal));")
      .replace(
        "#include <begin_vertex>",
        `int flyJ = int(aJoint + 0.5) * 3;
vec3 transformed = position;
${PASS_NERVE}
{
  vec4 flyAxisView = modelViewMatrix * vec4(flyApply(flyJ, aTube.xyz), 1.0);
  float flyClipW = projectionMatrix[2][3] * flyAxisView.z + projectionMatrix[3][3];
  float flyPx = aTube.w * length(modelViewMatrix[0].xyz) * projectionMatrix[1][1] * uPixels / max(flyClipW, 1e-6);
  ${GROW}
}
transformed = flyApply(flyJ, transformed);`,
      )
      // The panel's backdrop isn't part of the X-ray: off the screen.
      .replace("#include <project_vertex>", "#include <project_vertex>\nif (aInfo.x < -0.5) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec4 vNerve;\nuniform float uXray;\n${NERVE_DRAW}`)
      .replace(
        "#include <opaque_fragment>",
        `{
  float nerveFacing = abs(dot(normal, normalize(vViewPosition)));
  vec4 nerveC = nerveCover(outgoingLight, vNerve, nerveFacing);
  float nerveA = nerveC.a * uXray;
  vec3 nerveS = nerveShine(vNerve, nerveFacing) + ${vec3(OUTLINE)} * (0.3 + 0.7 * (1.0 - nerveFacing) * (1.0 - nerveFacing)) * nerveC.a;
  gl_FragColor = vec4(linearToOutputTexel(vec4(nerveC.rgb, 1.0)).rgb * nerveA + nerveS * uXray, nerveA);
}`,
      )
      .replace("#include <colorspace_fragment>", "");
  };
  material.customProgramCacheKey = () => "fly-nerves";
  return material;
}

export type NervesPanelUniforms = {
  /** The frame's size in pixels. */
  uFrame: { value: THREE.Vector2 };
  /** The panel's top left and size in frame pixels. */
  uPanel: { value: THREE.Vector4 };
  /** Where the model's origin falls in the panel (frame pixels from its top left), and frame pixels per body length across and down. */
  uView: { value: THREE.Vector4 };
  /** The picture's rectangle in the panel, frame pixels from its top left: x0, y0, x1, y1. Nothing is drawn outside it. */
  uPicture: { value: THREE.Vector4 };
  /** The panel's glass and its label. */
  uBackdrop: { value: THREE.Texture | null };
  uAlpha: { value: number };
};

/**
 * The panel: the same nervous system seen from above, head up, the fly's left
 * on the left, posed by `rest` (the rig's frames for a fly standing at rest,
 * so the drawing holds still), drawn into a rectangle of the frame with its
 * backdrop.
 */
export function createNervesPanelMaterial(glow: { value: Float32Array }, rest: Float32Array, uniforms: NervesPanelUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uGlow: glow, uJoints: { value: rest } },
    vertexShader: /* glsl */ `
${VERTEX_PARS}
uniform vec2 uFrame;
uniform vec4 uPanel;
uniform vec4 uView;
varying vec2 vUv;
varying vec2 vAt;
varying float vFacing;
void main() {
  ${PASS_NERVE}
  vec2 px;
  if (aInfo.x < -0.5) {
    px = position.xy * uPanel.zw;
    vUv = vec2(position.x, 1.0 - position.y);
    vFacing = 0.0;
  } else {
    int flyJ = int(aJoint + 0.5) * 3;
    vec3 transformed = position;
    float flyPx = aTube.w * uView.w;
    ${GROW}
    vec3 p = flyApply(flyJ, transformed);
    // Seen from above with the head up: the fly's left (+x) on the left, its front (+z) at the top.
    px = vec2(uView.x - p.x * uView.z, uView.y - p.z * uView.w);
    vFacing = abs(normalize(flyRotate(flyJ, normal)).y);
    vUv = vec2(0.0);
  }
  vAt = px;
  px += uPanel.xy;
  gl_Position = vec4(px.x / (uFrame.x * 0.5) - 1.0, 1.0 - px.y / (uFrame.y * 0.5), 0.0, 1.0);
}`,
    fragmentShader: /* glsl */ `
uniform sampler2D uBackdrop;
uniform vec4 uPicture;
uniform float uAlpha;
varying vec4 vNerve;
varying vec2 vUv;
varying vec2 vAt;
varying float vFacing;
${NERVE_DRAW}
void main() {
  // The backdrop's triangles carry no tissue.
  if (vNerve.z <= 0.0) {
    vec4 c = texture2D(uBackdrop, vUv);
    gl_FragColor = vec4(c.rgb * c.a, c.a) * uAlpha;
    return;
  }
  if (vAt.x < uPicture.x || vAt.y < uPicture.y || vAt.x > uPicture.z || vAt.y > uPicture.w) discard;
  vec4 c = nerveCover(${vec3(STAIN)}, vNerve, vFacing);
  vec3 s = nerveShine(vNerve, vFacing);
  gl_FragColor = vec4(linearToOutputTexel(vec4(c.rgb, 1.0)).rgb * c.a + s, c.a) * uAlpha;
}`,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
}
