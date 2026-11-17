/** A critically damped spring on one number: no overshoot, continuous speed. Returns the new value and leaves the speed in `v[i]`. */
export function damp(current: number, target: number, v: Float64Array, i: number, settle: number, dt: number) {
  const omega = 2 / Math.max(1e-3, settle);
  const x = omega * dt;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;
  const temp = (v[i] + omega * change) * dt;
  v[i] = (v[i] - omega * temp) * decay;
  return target + (change + temp) * decay;
}
