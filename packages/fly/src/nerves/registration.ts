// The specimen's posture is dissected, so brain and cord are registered
// separately. These are the fitted frames used for the neuropil meshes too.
type V = readonly [number, number, number];
export type AnatomyFrame = { origin: V; x: V; y: V; z: V };
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const unit = (a: V): V => scale(a, 1 / Math.sqrt(dot(a, a)));
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export const BRAIN_FRAME: AnatomyFrame = (() => {
  const x = unit([0.9988, -0.0445, -0.0188]);
  const ventral: V = [0, 1, 0];
  const y = unit(scale(sub(ventral, scale(x, dot(ventral, x))), -1));
  return { origin: [388.7, 253.3, 217.6], x, y, z: cross(x, y) };
})();

export const CORD_FRAME: AnatomyFrame = (() => {
  const x = unit([0.9976, 0.0616, -0.0307]);
  const long: V = [0.015, -0.106, 0.994];
  const z = unit(scale(sub(long, scale(x, dot(long, x))), -1));
  return { origin: [401, 420, 527.6], x, y: cross(z, x), z };
})();

/** Dataset micrometres into the measured mesh's frame: left, dorsal, anterior. */
export function registeredPoint(frame: AnatomyFrame, p: readonly number[]): [number, number, number] {
  const d: V = [p[0] - frame.origin[0], p[1] - frame.origin[1], p[2] - frame.origin[2]];
  return [dot(d, frame.x), dot(d, frame.y), dot(d, frame.z)];
}
