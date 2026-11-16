// The light in the kitchen. There are no shadow maps (they cost too much on
// the Apple TV), so the light is worked out in the materials' shaders: by day
// the sun reaches a point only through the window's panes, so the frame, the
// mullion and the glazing bars lay their shadows across the sill and the room;
// the things standing on the sill, as rounds and columns, cast theirs; and at
// night, when the "sun" is the room's lamp, the room's walls are lit from the
// lamp itself rather than from one direction.

import * as THREE from "three";
import { SILL, WINDOW } from "@fly/world";

/** Something round that casts a shadow: its middle and radius, and how much light it stops (the basil's leaves let some through). */
export type Ball = { x: number; y: number; z: number; r: number; density?: number };
/** Something standing on the sill that casts a shadow: a vertical column. */
export type Column = { x: number; z: number; r: number; top: number };

export const MAX_BALLS = 12;
export const MAX_COLUMNS = 6;

/** The lamp over the kitchen table, mm. */
export const LAMP = new THREE.Vector3(0, 560, 1500);
/** The top of the panes: the frame's head is below the opening's top. */
export const FRAME_HEAD = WINDOW.head - 32;

/** Shared by every material lit this way: they all see the same sun and the same casters. */
export type Sunlight = {
  uSun: { value: THREE.Vector3 };
  uBalls: { value: THREE.Vector4[] };
  uDensity: { value: number[] };
  uColumns: { value: THREE.Vector4[] };
  /** 0 by day, 1 with the lamp on. */
  uLamp: { value: number };
  /** 0 in sunshine, 1 under a grey sky: how soft the window's shadows are. */
  uSoft: { value: number };
  /** By day, the sunlight thrown back from the room: it lights what faces into the room. */
  uBounce: { value: THREE.Color };
  /** The lit room, as glossy things reflect it. */
  uRoom: { value: THREE.Color };
  uLampColor: { value: THREE.Color };
  uTime: { value: number };
};

export function createSunlight(balls: readonly Ball[], columns: readonly Column[]): Sunlight {
  const b = Array.from({ length: MAX_BALLS }, (_, i) => (balls[i] ? new THREE.Vector4(balls[i].x, balls[i].y, balls[i].z, balls[i].r) : new THREE.Vector4(0, -1e5, 0, 0)));
  const c = Array.from({ length: MAX_COLUMNS }, (_, i) => (columns[i] ? new THREE.Vector4(columns[i].x, columns[i].z, columns[i].r, columns[i].top) : new THREE.Vector4(1e5, 1e5, 0, 0)));
  return {
    uSun: { value: new THREE.Vector3(0, 1, -1).normalize() },
    uBalls: { value: b },
    uDensity: { value: Array.from({ length: MAX_BALLS }, (_, i) => balls[i]?.density ?? 1) },
    uColumns: { value: c },
    uLamp: { value: 0 },
    uSoft: { value: 0 },
    uBounce: { value: new THREE.Color() },
    uRoom: { value: new THREE.Color() },
    uLampColor: { value: new THREE.Color("#ffb867") },
    uTime: { value: 0 },
  };
}

const f = (n: number) => n.toFixed(2);

/** The light's GLSL: where the sun reaches (`sunReach`), and the lamp's light on the room (`lampLight`). */
export const SUNLIGHT_PARS = /* glsl */ `
uniform vec3 uSun;
uniform vec4 uBalls[${MAX_BALLS}];
uniform float uDensity[${MAX_BALLS}];
uniform vec4 uColumns[${MAX_COLUMNS}];
uniform float uLamp;
uniform float uSoft;
uniform vec3 uBounce;
uniform vec3 uRoom;
uniform vec3 uLampColor;
uniform float uTime;
varying vec3 vWorld;
const vec3 LAMP_AT = vec3(${f(LAMP.x)}, ${f(LAMP.y)}, ${f(LAMP.z)});

// The share of a soft edge at signed distance d (positive inside), b wide.
float soft(float d, float b) { return smoothstep(-b, b, d); }

// How much of the sun passes the window to reach p: the opening, less the frame, the mullion and the bars.
float throughWindow(vec3 p, vec3 s) {
  float v = 1.0;
  // The glass's plane: the opening between the jambs and below the head, less the mullion, the glazing bars and the transom.
  float t = (${f(WINDOW.glass)} - p.z) / s.z;
  if (t > 0.0) {
    vec2 q = p.xy + s.xy * t;
    // The sun is half a degree across, and light scatters: shadows soften with distance, and under a grey sky the light comes from all of it.
    float b = (0.8 + t * 0.014) * (1.0 + uSoft * 14.0);
    v *= soft(${f(SILL.hx - WINDOW.jamb.width)} - abs(q.x), b);
    v *= soft(${f(FRAME_HEAD)} - q.y, b);
    v *= soft(abs(q.x) - ${f(WINDOW.mullion.half)}, b);
    v *= soft(abs(abs(q.x) - ${f(Math.abs(WINDOW.bar.at[0]))}) - ${f(WINDOW.bar.half)}, b);
    v *= soft(abs(q.y - ${f(WINDOW.transom.y)}) - ${f(WINDOW.transom.half)}, b);
  }
  // The bottom rail's front edge.
  t = (${f(WINDOW.glass + WINDOW.rail.depth)} - p.z) / s.z;
  if (t > 0.0) v *= soft(p.y + s.y * t - ${f(WINDOW.rail.top)}, (0.8 + t * 0.014) * (1.0 + uSoft * 14.0));
  // Out in the room: in through the wall's opening, over the sill.
  t = (${f(WINDOW.wall)} - p.z) / s.z;
  if (t > 0.0) {
    vec2 q = p.xy + s.xy * t;
    float b = 1.0 + t * 0.012;
    v *= soft(${f(SILL.hx)} - abs(q.x), b) * soft(q.y, b) * soft(${f(WINDOW.head)} - q.y, b);
  }
  return v;
}

// How much of the light the things on the sill let past to reach p, going the way s.
float pastThings(vec3 p, vec3 s) {
  float v = 1.0;
  for (int i = 0; i < ${MAX_BALLS}; i++) {
    vec4 o = uBalls[i];
    vec3 d = o.xyz - p;
    float along = dot(d, s);
    if (along <= 0.0) continue;
    float miss = length(d - s * along);
    float b = (0.4 + along * 0.025) * (1.0 + uSoft * 6.0);
    v *= 1.0 - (1.0 - soft(miss - o.w, b)) * uDensity[i];
  }
  vec2 s2 = s.xz;
  float l2 = max(dot(s2, s2), 1e-6);
  for (int i = 0; i < ${MAX_COLUMNS}; i++) {
    vec4 c = uColumns[i];
    vec2 d2 = c.xy - p.xz;
    float along = dot(d2, s2) / l2;
    float miss = length(d2 - s2 * along);
    float chord = sqrt(max(c.z * c.z - miss * miss, 0.0) / l2);
    if (along + chord <= 0.0) continue;
    // Stopped if it is still between the sill and the top where it goes in (or, from inside, where it comes out: a bowl's rim shades its floor).
    float at = along - chord > 0.0 ? along - chord : along + chord;
    float b = (0.4 + abs(along) * 0.025) * (1.0 + uSoft * 6.0);
    float y = p.y + s.y * at;
    v *= 1.0 - (1.0 - soft(miss - c.z, b)) * (1.0 - soft(y - c.w, b)) * soft(y + 0.5, 0.5);
  }
  return v;
}

// The sun's share at p (a point on a surface facing n, in the world). By day only what comes through the window; at night the lamp is in the room, so only the things on the sill stop it.
float sunReach(vec3 p, vec3 n) {
  vec3 s = normalize(uSun);
  p += n * 0.6;
  float window = 1.0 - smoothstep(-0.12, -0.02, s.z);
  float v = pastThings(p, s);
  if (window > 0.0) v *= mix(1.0, throughWindow(p, s), window);
  return v;
}

// The lamp's light on a surface of the room facing n: warm, falling off with distance, most of it thrown down by its shade.
vec3 lampLight(vec3 p, vec3 n) {
  vec3 d = LAMP_AT - p;
  float dist = length(d);
  vec3 l = d / dist;
  // Wrapped a little: the room's walls bounce it round.
  float k = max(dot(n, l) * 0.75 + 0.25, 0.0);
  float shade = mix(0.3, 1.0, smoothstep(0.0, 0.6, l.y));
  return uLampColor * uLamp * k * shade / (1.0 + dist * dist / 2.2e6);
}
`;

/**
 * Lights a standard material this way: its direct light (the sun, or at night
 * the lamp's direction) is stopped where the shadows fall. `lamp` adds the
 * lamp's own light, for the room's surfaces. `extra` patches the shader further
 * (a material's own surface detail).
 */
export function sunlit(material: THREE.MeshStandardMaterial, sunlight: Sunlight, key: string, { lamp = false, extra }: { lamp?: boolean; extra?: (shader: THREE.WebGLProgramParametersWithUniforms) => void } = {}) {
  material.onBeforeCompile = (shader) => {
    // The material's own patch first, so that what it adds after three.js's common chunk comes after the light's declarations.
    extra?.(shader);
    Object.assign(shader.uniforms, sunlight);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWorld;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
#ifdef USE_INSTANCING
vWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${SUNLIGHT_PARS}`)
      // Indoors the sky lights the room only through the window: most of its fill goes, and what is reflected is the warm room more than the blue sky.
      .replace("#include <lights_fragment_maps>", "#include <lights_fragment_maps>\niblIrradiance *= 0.3;\nradiance = mix(radiance, vec3(dot(radiance, vec3(0.3, 0.5, 0.2))) * vec3(1.06, 0.97, 0.86), 0.88);\nradiance = max(radiance, uRoom);")
      .replace(
        "#include <lights_fragment_end>",
        `#include <lights_fragment_end>
{
  vec3 worldNormal = inverseTransformDirection(normal, viewMatrix);
  float reach = sunReach(vWorld, worldNormal);
  reflectedLight.directDiffuse *= reach;
  reflectedLight.directSpecular *= reach;
  reflectedLight.indirectDiffuse += BRDF_Lambert(diffuseColor.rgb) * uBounce * (max(worldNormal.z, 0.0) * 0.8 + 0.2) * PI;
  ${lamp ? "reflectedLight.indirectDiffuse += BRDF_Lambert(diffuseColor.rgb) * lampLight(vWorld, worldNormal) * PI;" : ""}
}`,
      );
  };
  material.customProgramCacheKey = () => `windowsill-${key}`;
}
