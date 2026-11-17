import * as THREE from "three";
import { freeze } from "../../scene/build.ts";

/** Sparse light in damp air, bounded by the same roof bays as the glazing. */
export function sunShafts(parent: THREE.Object3D) {
  const uniforms = { uSun: { value: new THREE.Vector3() }, uColor: { value: new THREE.Color() }, uStrength: { value: 0 } };
  const positions: number[] = [], uv: number[] = [];
  for (const [x, z] of [[-360, -310], [-80, -310], [180, -310], [420, 10]]) {
    for (const [u, v] of [[-1, 0], [1, 1], [-1, 1], [-1, 0], [1, 0], [1, 1]]) { positions.push(x + u * 75, v, z); uv.push(u, v); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  const material = new THREE.ShaderMaterial({ uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: `uniform vec3 uSun; varying vec2 vBeam; varying vec3 vAt;
void main() {
 float roof=1220.0-abs(position.x)*(340.0/760.0);
 float y = mix(roof, -40.0, position.y);
 vec3 p = vec3(position.x, y, position.z) - vec3(uSun.x, 0.0, uSun.z) * (roof-y) / max(0.06,uSun.y);
 vBeam = uv; vAt=p;
 gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`,
    fragmentShader: `uniform vec3 uColor; uniform float uStrength; varying vec2 vBeam; varying vec3 vAt;
void main() {
 if(abs(vAt.x)>760.0 || abs(vAt.z)>640.0) discard;
 float edge = sin(vBeam.y * 3.14159) * (1.0-smoothstep(0.65,1.0,abs(vBeam.x)));
 gl_FragColor = vec4(uColor, edge * uStrength * 0.035);
}`,
  });
  const mesh = new THREE.Mesh(g, material); mesh.frustumCulled = false; freeze(mesh); parent.add(mesh);
  return { mesh, uniforms };
}
