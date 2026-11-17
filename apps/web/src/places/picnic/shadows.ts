// Directional shadows on the tabletop, evaluated from the world's footprints.
// These soften the picnic's contact with the cloth without shadow-map passes.
import { SOLIDS, topPeak } from "@fly/world";

const num = (n: number) => n.toFixed(4);
const casters = SOLIDS.filter((s) => ["lemonade", "jam", "apple", "strawberry", "strawberry half", "cherry", "sugar", "orange slice"].includes(s.name));

export const TABLE_SHADOWS = /* glsl */ `
uniform vec3 uPicnicSun;
float columnShade(vec2 p, vec2 centre, vec2 halfSize, float angle, float height, float square) {
  vec2 ray = uPicnicSun.xz / max(uPicnicSun.y, 0.06);
  float ca = cos(angle), sa = sin(angle);
  mat2 turn = mat2(ca, sa, -sa, ca);
  vec2 d = turn * (p - centre) / halfSize;
  vec2 v = turn * ray / halfSize;
  float t = clamp(-dot(d, v) / max(dot(v, v), 0.00001), 0.0, height);
  vec2 q = abs(d + v * t);
  float dist = mix(length(q), max(q.x, q.y), square);
  return 1.0 - smoothstep(0.94, 1.08, dist);
}
float picnicShadow(vec2 p) {
  float shade = 0.0;
  ${casters.map((s) => {
    const f = s.footprint;
    const rx = f.kind === "circle" ? f.r : f.kind === "ellipse" ? f.rx : f.hx;
    const rz = f.kind === "circle" ? f.r : f.kind === "ellipse" ? f.rz : f.hz;
    const a = f.kind === "circle" ? 0 : f.angle;
    const strength = s.name === "lemonade" ? 0.38 : 0.78;
    return `shade = max(shade, columnShade(p, vec2(${num(f.x)}, ${num(f.z)}), vec2(${num(rx)}, ${num(rz)}), ${num(a)}, ${num(topPeak(s.top))}, ${f.kind === "box" ? "1.0" : "0.0"}) * ${num(strength)});`;
  }).join("\n  ")}
  return shade;
}
`;
