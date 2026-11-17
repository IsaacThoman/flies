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
 float col = floor(p.x / 43.0);
 float seed = hash21(vec2(col, 9.0));
 float x = (col + 0.5 + sin(p.y * 0.018 + seed * 12.0) * 0.055) * 43.0;
 float y = 1000.0 - mod(uTime * (35.0 + seed * 65.0) + seed * 1600.0, 1800.0);
 float movingRadius = 1.6+seed*1.7;
 vec2 d = (p - vec2(x, y)) / vec2(movingRadius, movingRadius*1.55);
 float bead = (1.0 - smoothstep(1.0-px/movingRadius*0.5, 1.0+px/movingRadius*0.5, length(d))) * min(1.0,4.0*movingRadius*movingRadius/(px*px)) * step(seed, uRain * 0.75);
 float trail = (1.0 - smoothstep(0.3, 0.6 + px, abs(p.x - x))) * step(y, p.y) * (1.0 - smoothstep(0.0, 230.0, p.y - y)) * step(seed, uRain * 0.75);
 vec2 cell = floor(p / 16.0);
 float h = hash21(cell);
 vec2 offset = vec2(hash21(cell+4.1),hash21(cell+9.3))*0.6+0.2;
 float radius = 0.45+h*1.6;
 vec2 b = (p - (cell + offset) * 16.0) / vec2(radius, radius*1.15);
 float still = (1.0 - smoothstep(1.0-px/radius*0.5, 1.0+px/radius*0.5, length(b))) * min(1.0,4.0*radius*radius/(px*px)) * step(h, uWet * (0.12+0.35*vnoise(cell*0.4)));
 fog *= (0.8+0.2*vnoise(p*0.008)) * (1.0-trail*0.8);
 float film = vnoise(p * vec2(0.25, 0.012)) * uWet * 0.08;
 float alpha = clamp(0.012 + fresnel * 0.12 + fog * 0.72 + bead * 0.55 + still * 0.32 + trail * 0.08 + film, 0.0, 0.84);
 float glint = pow(max(dot(reflect(-view, normalize(vNormal)), uDirection), 0.0), 140.0);
 vec3 c = uSky * (0.85 + bead * 0.4 + still * 0.25) + uSun * glint * 0.65;
 c *= 1.0-max(bead,still)*0.4;
 c += uSun * pow(max(dot(-view, uDirection), 0.0), 10.0) * 0.12;
 gl_FragColor = vec4(c, alpha);
}` });
  return { material, uniforms };
}
