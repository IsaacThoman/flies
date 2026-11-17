import * as THREE from "three";
import { NOISE } from "../windowsill/surfaces.ts";

export function glazing() {
  const uniforms = { uTime: { value: 0 }, uWet: { value: 0 }, uRain: { value: 0 }, uMist: { value: 0 }, uSky: { value: new THREE.Color() }, uSun: { value: new THREE.Color() }, uDirection: { value: new THREE.Vector3() } };
  const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms,
    vertexShader: `varying vec3 vWorld; varying vec3 vNormal;
void main() { vWorld = (modelMatrix * vec4(position, 1.0)).xyz; vNormal = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec3 vWorld; varying vec3 vNormal;
uniform float uTime; uniform float uWet; uniform float uRain; uniform float uMist;
uniform vec3 uSky; uniform vec3 uSun; uniform vec3 uDirection;
${NOISE}
void main() {
 vec3 view = normalize(cameraPosition - vWorld);
 vec2 p = abs(vNormal.z) > 0.5 ? vWorld.xy : vWorld.zy;
 if (abs(vNormal.y) > 0.5) p = vec2(vWorld.z,-abs(vWorld.x));
 float px = max(0.15, length(fwidth(p)));
 float fresnel = pow(1.0 - abs(dot(view, normalize(vNormal))), 4.0);
 float fog = uMist * (1.0 - smoothstep(0.0, 400.0 + vnoise(vec2(p.x * 0.018, 0.0)) * 90.0, vWorld.y));
 float col = floor(p.x / 19.0);
 float seed = hash21(vec2(col, 9.0));
 float x = (col + 0.5 + sin(p.y * 0.025 + seed * 12.0) * 0.13) * 19.0;
 float y = 1000.0 - mod(uTime * (35.0 + seed * 65.0) + seed * 1600.0, 1800.0);
 vec2 d = (p - vec2(x, y)) / vec2(1.5, 2.7);
 float bead = (1.0 - smoothstep(0.7, 1.0 + px * 0.5, length(d))) * step(seed, uRain * 0.85);
 float trail = (1.0 - smoothstep(0.4, 1.0 + px, abs(p.x - x))) * step(y, p.y) * (1.0 - smoothstep(0.0, 230.0, p.y - y)) * step(seed, uRain * 0.85);
 vec2 cell = floor(p / 8.0);
 float h = hash21(cell);
 vec2 offset = vec2(hash21(cell+4.1),hash21(cell+9.3))*0.6+0.2;
 vec2 b = (p - (cell + offset) * 8.0) / vec2(0.65 + h, 1.1 + h);
 float still = (1.0 - smoothstep(0.55, 1.0 + px, length(b))) * step(h, uWet * 0.5);
 fog *= 1.0 - trail * 0.9;
 float film = vnoise(p * vec2(0.25, 0.012)) * uWet * 0.08;
 float alpha = clamp(0.018 + fresnel * 0.15 + fog * 0.45 + bead * 0.65 + still * 0.45 + trail * 0.12 + film, 0.0, 0.84);
 float glint = pow(max(dot(reflect(-view, normalize(vNormal)), uDirection), 0.0), 140.0);
 vec3 c = uSky * (0.85 + bead * 0.4 + still * 0.25) + uSun * glint * 0.65;
 c += uSun * pow(max(dot(-view, uDirection), 0.0), 10.0) * 0.12;
 gl_FragColor = vec4(c, alpha);
}` });
  return { material, uniforms };
}
