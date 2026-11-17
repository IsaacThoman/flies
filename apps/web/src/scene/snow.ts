// Snow stays cosmetic: a dusting thinner than a fly can step over, and flakes
// outside the room. There is no temperature input or cold behavior in the brain.
import * as THREE from "three";
import { random } from "./build.ts";
import type { Daylight } from "./light.ts";
import type { Weather } from "./weather.ts";

export class Snow {
  readonly mesh: THREE.Mesh;
  readonly #u = { uTime: { value: 0 }, uSnow: { value: 0 }, uOffset: { value: new THREE.Vector3() }, uColor: { value: new THREE.Color() } };
  #last = -1;
  readonly #wrap: number;
  constructor(size: number, floor: number, outdoorsOnly = false, glassZ = -145) {
    this.#wrap = size * 2;
    const rnd = random(913);
    const g = new THREE.InstancedBufferGeometry();
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    const flakes = new Float32Array(1600 * 4);
    for (let i = 0; i < 1600; i++) flakes.set([rnd.next(), rnd.next(), rnd.next(), rnd.next()], i * 4);
    g.setAttribute("flake", new THREE.InstancedBufferAttribute(flakes, 4));
    g.instanceCount = 1600;
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: this.#u, transparent: true, depthWrite: false,
      vertexShader: /* glsl */ `
attribute vec4 flake;
uniform float uTime; uniform float uSnow; uniform vec3 uOffset;
varying vec2 vUv; varying float vAlpha;
void main() {
  float size = ${size.toFixed(1)};
  vec3 origin = ${outdoorsOnly ? 'vec3(0.0, 0.0, -6000.0)' : 'cameraPosition'};
  float t = uTime * (0.65 + flake.w * 0.65);
  float speed = 0.5 + floor(flake.w * 3.0) * 0.5;
  vec3 p = origin + mod(flake.xyz * size + uOffset * speed - origin + size * 0.5, size) - size * 0.5;
  p.x += sin(t * 0.8 + flake.z * 40.0) * 18.0;
  p.z += cos(t * 0.65 + flake.x * 30.0) * 12.0;
  float dist = length(p-cameraPosition);
  float radius = max(0.45 + flake.w * 1.1, dist / (projectionMatrix[1][1] * 480.0));
  vec3 right = vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);
  vUv = position.xy;
  vAlpha = step(flake.w, uSnow) * smoothstep(8.0,40.0,dist) * step(${floor.toFixed(1)},p.y);
  ${outdoorsOnly ? `vAlpha *= 1.0 - step(${glassZ.toFixed(1)},p.z);` : ''}
  gl_Position=projectionMatrix*viewMatrix*vec4(p+(right*position.x+up*position.y)*radius,1.0);
}`,
      fragmentShader: /* glsl */ `uniform vec3 uColor; varying vec2 vUv; varying float vAlpha;
void main() { float r=length(vUv); gl_FragColor=vec4(uColor,(1.0-smoothstep(0.35,1.0,r))*vAlpha*0.85); }`,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
  }
  update(time: number, light: Daylight, w: Weather) {
    this.mesh.visible = w.snow > 0.01;
    this.#u.uTime.value = time;
    this.#u.uSnow.value = w.snow;
    const dt = this.#last < 0 ? 0 : Math.min(0.1, Math.max(0, time - this.#last));
    this.#last = time;
    // Half-integer speeds and a two-box wrap preserve every instance's phase.
    // Integrate wind: a changed wind must not rewrite hours of earlier travel.
    const o = this.#u.uOffset.value;
    o.set((o.x + dt * w.wind * 95) % this.#wrap, (o.y - dt * 170) % this.#wrap, (o.z + dt * w.wind * 30) % this.#wrap);
    this.#u.uColor.value.copy(light.skyColor).multiplyScalar(0.55).addScalar(0.3 + w.lightning);
  }
}

/** Pigment on exposed upward faces, no extra mesh or draw, no collision stand-in. */
export function snowDust(material: THREE.MeshStandardMaterial | THREE.MeshLambertMaterial, cover: { value: number }, shelters: readonly THREE.Vector4[] = []) {
  const previous = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.uniforms.uSnowCover = cover;
    if (shelters.length) shader.uniforms.uSnowShelters = { value: shelters };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSnowAt; varying float vSnowUp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSnowAt=(modelMatrix*vec4(position,1.0)).xyz; vSnowUp=(mat3(modelMatrix)*normal).y;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nuniform float uSnowCover; varying vec3 vSnowAt; varying float vSnowUp;\n${shelters.length ? 'uniform vec4 uSnowShelters[' + shelters.length + '];' : ''}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float grain=fract(sin(dot(floor(vSnowAt.xz*2.0),vec2(12.9898,78.233)))*43758.5453);
float footprint=max(fwidth(vSnowAt.x),fwidth(vSnowAt.z));
float grit=1.0-smoothstep(0.25,1.0,footprint);
grain=mix(0.5,grain,grit);
float drift=0.5+0.25*sin(vSnowAt.x*0.047+sin(vSnowAt.z*0.029)*2.0)+0.25*sin(vSnowAt.z*0.061);
drift=mix(0.5,drift,1.0-smoothstep(10.0,60.0,footprint));
float powder=uSnowCover*(0.4+0.6*drift);
float dust=smoothstep(0.45,0.9,vSnowUp)*smoothstep(0.12+grain*0.05,0.65,powder);
${shelters.length ? `for (int i=0;i<${shelters.length};i++) {
  vec4 jar=uSnowShelters[i];
  vec2 delta=vSnowAt.xz-jar.xy;
  if (dot(delta,delta)<jar.z*jar.z && vSnowAt.y<jar.w-0.3) dust=0.0;
}` : ''}
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.83,0.9,0.96)*(0.93+0.07*grain),dust);`)
      .replace('#include <metalnessmap_fragment>', 'roughnessFactor=mix(roughnessFactor,0.92,dust);\n#include <metalnessmap_fragment>');
  };
  material.customProgramCacheKey = () => key + '-snow-dust-' + shelters.length;
}
