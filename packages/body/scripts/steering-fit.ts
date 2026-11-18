// The analysis behind the body's steering gain (docs/ethogram/steering.md):
// spikes from whole-cell voltage, the model's rate readout applied to them,
// and the fit of rotation to the right-minus-left rate. Pure functions over
// arrays, so the tests can run them on made-up recordings.

/** The model's readout time constant for DNa02, ms (packages/brain/src/io.ts). */
export const READOUT_TAU_MS = 150;

/** The median of `values[from, to)`, leaving `values` as it was. */
export function median(values: ArrayLike<number>, from = 0, to = values.length): number {
  const a = Float64Array.from({ length: to - from }, (_, i) => values[from + i]);
  return select(a, a.length >> 1, a.length % 2 === 0);
}

function select(a: Float64Array, k: number, even: boolean): number {
  if (a.length === 0) return NaN;
  let lo = 0;
  let hi = a.length - 1;
  while (lo < hi) {
    const pivot = a[(lo + hi) >> 1];
    let i = lo;
    let j = hi;
    while (i <= j) {
      while (a[i] < pivot) i++;
      while (a[j] > pivot) j--;
      if (i <= j) {
        const t = a[i];
        a[i] = a[j];
        a[j] = t;
        i++;
        j--;
      }
    }
    if (k <= j) hi = j;
    else if (k >= i) lo = i;
    else break;
  }
  if (!even) return a[k];
  let below = -Infinity;
  for (let i = 0; i < k; i++) if (a[i] > below) below = a[i];
  return (a[k] + below) / 2;
}

/** A first-order Butterworth high-pass at `hz`, run forward and then backward so it shifts nothing. */
export function highPass(x: Float64Array, hz: number, fs: number): Float64Array {
  const k = Math.tan((Math.PI * hz) / fs);
  const b0 = 1 / (1 + k);
  const a1 = (k - 1) / (k + 1);
  const y = new Float64Array(x.length);
  let px = x[0];
  let py = 0;
  for (let i = 0; i < x.length; i++) {
    py = b0 * (x[i] - px) - a1 * py;
    px = x[i];
    y[i] = py;
  }
  px = y[y.length - 1];
  py = 0;
  for (let i = y.length - 1; i >= 0; i--) {
    const v = y[i];
    py = b0 * (v - px) - a1 * py;
    px = v;
    y[i] = py;
  }
  return y;
}

/**
 * `x` less its median, over its median absolute deviation (×1.4826, the
 * standard deviation's estimate for normal noise), both taken in windows of
 * `window` samples and interpolated between the windows' centres.
 */
export function madScaled(x: Float64Array, window: number): Float64Array {
  const blocks = Math.max(1, Math.floor(x.length / window));
  const centre = new Float64Array(blocks);
  const scale = new Float64Array(blocks);
  const deviations = new Float64Array(window);
  for (let b = 0; b < blocks; b++) {
    const from = b * window;
    const to = b === blocks - 1 ? x.length : from + window;
    const m = median(x, from, to);
    const n = to - from;
    const dev = n === window ? deviations : new Float64Array(n);
    for (let i = 0; i < n; i++) dev[i] = Math.abs(x[from + i] - m);
    centre[b] = m;
    scale[b] = 1.4826 * select(dev, n >> 1, n % 2 === 0);
  }
  const out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const at = i / window - 0.5;
    const b = Math.max(0, Math.min(blocks - 1, Math.floor(at)));
    const t = blocks === 1 ? 0 : Math.max(0, Math.min(1, at - b));
    const next = Math.min(blocks - 1, b + 1);
    const m = centre[b] + (centre[next] - centre[b]) * t;
    const s = scale[b] + (scale[next] - scale[b]) * t;
    out[i] = s > 0 ? (x[i] - m) / s : 0;
  }
  return out;
}

/** Local maxima of `v` at or above `floor`: their indices and heights. */
export function peaks(v: Float64Array, floor: number): { at: Int32Array; height: Float64Array } {
  const at: number[] = [];
  const height: number[] = [];
  for (let i = 1; i < v.length - 1; i++) {
    if (v[i] >= floor && v[i] > v[i - 1] && v[i] >= v[i + 1]) {
      at.push(i);
      height.push(v[i]);
    }
  }
  return { at: Int32Array.from(at), height: Float64Array.from(height) };
}

/**
 * Local maxima of the raw voltage `v` where `use` is set, with how far each
 * rises above the lowest point of the `window` samples before it; only those
 * that fall back by at least half that within the `window` after. A spike's
 * height in millivolts, where a cell's spikes stand clear of its noise.
 */
export function rises(v: Float64Array, window: number, use: (i: number) => boolean): { at: Int32Array; height: Float64Array } {
  const at: number[] = [];
  const height: number[] = [];
  for (let i = window; i < v.length - window; i++) {
    if (!(v[i] > v[i - 1] && v[i] >= v[i + 1]) || !use(i)) continue;
    let before = Infinity;
    for (let k = i - window; k < i; k++) if (v[k] < before) before = v[k];
    const rise = v[i] - before;
    if (rise < 0.5) continue;
    let after = Infinity;
    for (let k = i + 1; k <= i + window; k++) if (v[k] < after) after = v[k];
    if (v[i] - after < rise / 2) continue;
    at.push(i);
    height.push(rise);
  }
  return { at: Int32Array.from(at), height: Float64Array.from(height) };
}

/** Peaks at or above `threshold`, at least `gap` samples apart: of two closer than that, the higher. */
export function spikesAbove(candidates: { at: Int32Array; height: Float64Array }, threshold: number, gap: number): Int32Array {
  const kept: number[] = [];
  let lastHeight = -Infinity;
  for (let i = 0; i < candidates.at.length; i++) {
    const h = candidates.height[i];
    if (h < threshold) continue;
    const t = candidates.at[i];
    if (kept.length && t - kept[kept.length - 1] < gap) {
      if (h > lastHeight) {
        kept[kept.length - 1] = t;
        lastHeight = h;
      }
      continue;
    }
    kept.push(t);
    lastHeight = h;
  }
  return Int32Array.from(kept);
}

/**
 * The spike threshold: the lowest point, in 0.25 MAD bins between `low` and
 * `high`, of the histogram of peak heights (a three-bin running mean of it),
 * left of the spikes' own mode: the gap between noise and spikes. The spikes'
 * mode is the highest bin right of the histogram's first local minimum.
 */
export function gapThreshold(heights: Float64Array, low = 4, high = 20, bin = 0.25): { threshold: number; histogram: number[] } {
  const n = Math.round((high - low) / bin);
  const counts = new Array<number>(n).fill(0);
  for (const h of heights) if (h >= low && h < high) counts[Math.floor((h - low) / bin)]++;
  const smooth = counts.map((_, i) => (counts[Math.max(0, i - 1)] + counts[i] + counts[Math.min(n - 1, i + 1)]) / 3);
  let first = 1;
  while (first < n - 1 && !(smooth[first] <= smooth[first - 1] && smooth[first] < smooth[first + 1])) first++;
  let mode = first;
  for (let i = first; i < n; i++) if (smooth[i] > smooth[mode]) mode = i;
  let gap = 0;
  for (let i = 0; i <= mode; i++) if (smooth[i] < smooth[gap]) gap = i;
  return { threshold: low + (gap + 0.5) * bin, histogram: counts };
}

/**
 * The model's readout of a spike train: each spike adds 1000/τ Hz, which
 * decays with τ (packages/brain/src/io.ts, smooth()). Sampled at `times` (s);
 * `spikes` are sample indices at `fs`.
 */
export function readout(spikes: Int32Array, fs: number, times: Float64Array, tauMs = READOUT_TAU_MS): Float64Array {
  const out = new Float64Array(times.length);
  const tau = tauMs / 1000;
  let rate = 0;
  let at = 0;
  let k = 0;
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    while (k < spikes.length && spikes[k] / fs <= t) {
      const ts = spikes[k] / fs;
      rate = rate * Math.exp(-(ts - at) / tau) + 1 / tau;
      at = ts;
      k++;
    }
    out[i] = rate * Math.exp(-(t - at) / tau);
  }
  return out;
}

/** A causal first-order low-pass with time constant `tauMs` at `fs`; 0 passes `x` through. */
export function lowPass(x: Float64Array, tauMs: number, fs: number): Float64Array {
  if (tauMs <= 0) return x;
  const k = -Math.expm1(-1000 / (tauMs * fs));
  const y = new Float64Array(x.length);
  let v = x[0];
  for (let i = 0; i < x.length; i++) {
    v += (x[i] - v) * k;
    y[i] = v;
  }
  return y;
}

/** A centred running mean over `width` samples (odd). */
export function boxcar(x: Float64Array, width: number): Float64Array {
  const half = width >> 1;
  const out = new Float64Array(x.length);
  let sum = 0;
  let n = 0;
  for (let i = -half; i < x.length; i++) {
    const add = i + half;
    if (add < x.length) {
      sum += x[add];
      n++;
    }
    const drop = i - half - 1;
    if (drop >= 0) {
      sum -= x[drop];
      n--;
    }
    if (i >= 0) out[i] = sum / n;
  }
  return out;
}

export type Line = { slope: number; intercept: number; r2: number; n: number };

/** Least squares y = intercept + slope·x over the samples where `use` is set, x read `shift` samples earlier. */
export function line(x: Float64Array, y: Float64Array, use: Uint8Array, shift = 0): Line {
  let n = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = shift; i < y.length; i++) {
    if (!use[i] || !use[i - shift]) continue;
    const a = x[i - shift];
    const b = y[i];
    n++;
    sx += a;
    sy += b;
    sxx += a * a;
    sxy += a * b;
    syy += b * b;
  }
  const vx = sxx - (sx * sx) / n;
  const vy = syy - (sy * sy) / n;
  const cxy = sxy - (sx * sy) / n;
  const slope = cxy / vx;
  return { slope, intercept: (sy - slope * sx) / n, r2: (cxy * cxy) / (vx * vy), n };
}

/** How well `predicted` matches `actual` where `use` is set, each less its mean: R² and the slope of actual on predicted. */
export function agreement(predicted: Float64Array, actual: Float64Array, use: Uint8Array): { r2: number; calibration: number; n: number } {
  let n = 0;
  let sp = 0;
  let sa = 0;
  for (let i = 0; i < actual.length; i++) {
    if (!use[i]) continue;
    n++;
    sp += predicted[i];
    sa += actual[i];
  }
  const mp = sp / n;
  const ma = sa / n;
  let sse = 0;
  let sst = 0;
  let spp = 0;
  let spa = 0;
  for (let i = 0; i < actual.length; i++) {
    if (!use[i]) continue;
    const p = predicted[i] - mp;
    const a = actual[i] - ma;
    sse += (a - p) ** 2;
    sst += a * a;
    spp += p * p;
    spa += p * a;
  }
  return { r2: 1 - sse / sst, calibration: spa / spp, n };
}

/** `x` delayed by `shift` samples, the first held at x[0]. */
export function delayed(x: Float64Array, shift: number): Float64Array {
  if (shift <= 0) return x;
  const out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[Math.max(0, i - shift)];
  return out;
}

/**
 * A ridge-regularised linear filter from `x` to `y` over lags `from` to `to`
 * samples (positive: y after x), fitted where `use` is set at both ends:
 * h minimising Σ(y − Σ h_k x_{t−k})² + λ|h|², λ = `ridge` × the mean of
 * XᵀX's diagonal. Both are centred first.
 */
export function linearFilter(x: Float64Array, y: Float64Array, use: Uint8Array, from: number, to: number, ridge = 0.01): Float64Array {
  const m = to - from + 1;
  let n = 0;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < y.length; i++) {
    if (!use[i]) continue;
    n++;
    mx += x[i];
    my += y[i];
  }
  mx /= n;
  my /= n;
  const xtx = new Float64Array(m * m);
  const xty = new Float64Array(m);
  const row = new Float64Array(m);
  for (let i = Math.max(0, to); i < y.length + Math.min(0, from); i++) {
    if (!use[i] || !use[i - to] || !use[i - from]) continue;
    for (let k = 0; k < m; k++) row[k] = x[i - (from + k)] - mx;
    const yi = y[i] - my;
    for (let a = 0; a < m; a++) {
      const ra = row[a];
      if (ra === 0) continue;
      xty[a] += ra * yi;
      const base = a * m;
      for (let b = a; b < m; b++) xtx[base + b] += ra * row[b];
    }
  }
  let diagonal = 0;
  for (let a = 0; a < m; a++) diagonal += xtx[a * m + a];
  const lambda = (ridge * diagonal) / m;
  for (let a = 0; a < m; a++) {
    xtx[a * m + a] += lambda;
    for (let b = 0; b < a; b++) xtx[a * m + b] = xtx[b * m + a];
  }
  return choleskySolve(xtx, xty, m);
}

function choleskySolve(a: Float64Array, b: Float64Array, m: number): Float64Array {
  const l = new Float64Array(m * m);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j <= i; j++) {
      let s = a[i * m + j];
      for (let k = 0; k < j; k++) s -= l[i * m + k] * l[j * m + k];
      l[i * m + j] = i === j ? Math.sqrt(s) : s / l[j * m + j];
    }
  }
  const z = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= l[i * m + k] * z[k];
    z[i] = s / l[i * m + i];
  }
  const out = new Float64Array(m);
  for (let i = m - 1; i >= 0; i--) {
    let s = z[i];
    for (let k = i + 1; k < m; k++) s -= l[k * m + i] * out[k];
    out[i] = s / l[i * m + i];
  }
  return out;
}
