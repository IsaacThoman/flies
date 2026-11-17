// Where FLY_RGB (src/vision.ts) comes from: how much light the fly's outer
// photoreceptors (R1-R6, rhodopsin Rh1), which drive the lamina and the
// looming pathway, catch from a surface the renderer knows only as linear
// sRGB. Each colour of a grid is turned into a smooth reflectance spectrum
// that has that colour under daylight (the sigmoid spectra of Jakob & Hanika
// 2019, Comput. Graph. Forum 38:147), and R1-R6's photon catch of it is
// fitted as weights on R, G and B, for two sensitivities:
//
// - In the eye (`--sharkey`): R1-R6's measured response, the ERG of red-eyed
//   flies whose only working photoreceptors are R1-R6 (Sharkey et al. 2020,
//   Sci. Rep. 10:18242, Fig. 3; its Supplementary Data,
//   41598_2020_74742_MOESM2_ESM.xlsx, CC BY 4.0), means at equal photon flux
//   from 315 to 550 nm and from 450 to 700 nm, joined by their ratio over 450
//   to 500. It is broader than the pigment's own: it peaks near 490 nm and
//   holds up past 550, where red light leaks through the screening pigment.
//   Responses are not sensitivities; they are converted as a Naka-Rushton
//   cell's (exponent 1) whose peak response is half its maximum, and also
//   taken as they are, which bounds the conversion's effect.
// - The pigment alone: a rhodopsin template (Govardovskii et al. 2000, Vis.
//   Neurosci. 17:509) at λmax 478 nm (Salcedo et al. 1999, J. Neurosci.
//   19:10716) or 486 (Ilić et al. 2018, Front. Cell. Neurosci. 12:34), with the
//   UV-sensitising pigment's band at 350 nm raising the sensitivity there to
//   1.37 times the blue peak, as the whole eye's ERG gives it (single R1-R6
//   cells: 1.74; Ilić et al. 2018; Sharkey et al.'s data give 1.4). The band's
//   20 nm width is chosen; only the UV statements depend on it.
//
//   node packages/body/scripts/photoreceptors.ts [--sharkey 41598_2020_74742_MOESM2_ESM.xlsx]
//
// Also: daylight is CIE D65 (CIE 15:2004, 300 to 780 nm in 10 nm steps); colour
// is the CIE 1931 2° observer as Wyman, Sloan & Shirley's multi-lobe fit
// (2013, J. Comput. Graph. Tech. 2:1) and sRGB's primaries (IEC 61966-2-1).
// Reflectance outside the visible is unknown to an sRGB colour, so the fit is
// of the catch from 400 nm up, and what UV adds is printed for a few surfaces
// whose UV reflectance is known roughly (read off the published curves, not
// data: light and dark skin after Anderson & Parrish 1981, J. Invest.
// Dermatol. 77:13; a titanium-dioxide white paint, which absorbs below about
// 400 nm; a white that reflects UV, as unbleached paper).

import { parseArgs } from "node:util";
import { FLY_RGB } from "../src/vision.ts";
import { readXlsx } from "../../../scripts/xlsx.ts";

/** Wavelengths, nm, in 5 nm steps. */
const STEP = 5;
const WAVELENGTHS = Array.from({ length: (780 - 300) / STEP + 1 }, (_, i) => 300 + i * STEP);
const D65 = [0.03, 3.3, 20.2, 37.1, 39.9, 44.9, 46.6, 52.1, 50.0, 54.6, 82.8, 91.5, 93.4, 86.7, 104.9, 117.0, 117.8, 114.9, 115.9, 108.8, 109.4, 107.8, 104.8, 107.7, 104.4, 104.0, 100.0, 96.3, 95.8, 88.7, 90.0, 89.6, 87.7, 83.3, 83.7, 80.0, 80.2, 82.3, 78.3, 69.7, 71.6, 74.3, 61.6, 69.9, 75.1, 63.6, 46.4, 66.8, 63.4];
const d65 = (l: number) => {
  const i = Math.min(D65.length - 2, Math.floor((l - 300) / 10));
  const t = (l - 300 - i * 10) / 10;
  return D65[i] * (1 - t) + D65[i + 1] * t;
};
const lobe = (l: number, mu: number, below: number, above: number) => Math.exp(-0.5 * ((l - mu) / (l < mu ? below : above)) ** 2);
const CMF = [
  (l: number) => 1.056 * lobe(l, 599.8, 37.9, 31.0) + 0.362 * lobe(l, 442.0, 16.0, 26.7) - 0.065 * lobe(l, 501.1, 20.4, 26.2),
  (l: number) => 0.821 * lobe(l, 568.8, 46.9, 40.5) + 0.286 * lobe(l, 530.9, 16.3, 31.1),
  (l: number) => 1.217 * lobe(l, 437.0, 11.8, 36.0) + 0.681 * lobe(l, 459.0, 26.0, 13.8),
];
/** Linear sRGB to XYZ, white (1, 1, 1) at D65's white point. */
const SRGB_TO_XYZ = [[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]];

export const RH1 = { lambdaMax: 478, uvPeak: 350, uvWidth: 20, uvOverBlue: 1.37 };

/** The rhodopsin template's alpha and beta bands, 1 at λmax. */
function template(l: number, lambdaMax: number) {
  const x = lambdaMax / l;
  const a = 0.8795 + 0.0459 * Math.exp(-((lambdaMax - 300) ** 2) / 11940);
  const alpha = 1 / (Math.exp(69.7 * (a - x)) + Math.exp(28 * (0.922 - x)) + Math.exp(-14.9 * (1.104 - x)) + 0.674);
  const peak = 189 + 0.315 * lambdaMax;
  const width = -40.5 + 0.195 * lambdaMax;
  return alpha + 0.26 * Math.exp(-(((l - peak) / width) ** 2));
}

/** R1-R6's relative sensitivity per photon at wavelength l, nm. */
export function rh1(l: number, rh: typeof RH1 = RH1) {
  const blue = template(rh.lambdaMax, rh.lambdaMax);
  const band = rh.uvOverBlue * blue - template(rh.uvPeak, rh.lambdaMax);
  return template(l, rh.lambdaMax) + band * Math.exp(-0.5 * ((l - rh.uvPeak) / rh.uvWidth) ** 2);
}

type Spectrum = (l: number) => number;
const integrate = (f: Spectrum, from = 300, to = 780) => WAVELENGTHS.reduce((s, l) => (l >= from && l <= to ? s + f(l) * STEP : s), 0);

/** R1-R6's photon catch of a surface under daylight, from `from` nm up, as a fraction of a perfect white's catch over the same band. */
export function catchOf(reflectance: Spectrum, from = 300, sensitivity: Spectrum = rh1) {
  const per = (l: number) => sensitivity(l) * d65(l) * l;
  return integrate((l) => per(l) * reflectance(l), from) / integrate(per, from);
}

const xyzOf = (reflectance: Spectrum) => {
  const white = integrate((l) => d65(l) * CMF[1](l), 380);
  return CMF.map((c) => integrate((l) => d65(l) * c(l) * reflectance(l), 380) / white);
};

const sigmoid = (x: number) => 0.5 + x / (2 * Math.sqrt(1 + x * x));
const sigmoidSpectrum = (c: readonly number[]): Spectrum => (l) => {
  const t = (l - 550) / 100;
  return sigmoid(c[0] * t * t + c[1] * t + c[2]);
};
const det3 = (m: number[][]) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
/** Solves A x = b for 3 by 3 A by Cramer's rule. */
const solve3 = (A: number[][], b: number[]) => [0, 1, 2].map((col) => det3(A.map((row, i) => row.map((v, j) => (j === col ? b[i] : v)))) / det3(A));

/** A smooth reflectance spectrum with this linear sRGB colour under D65 (Gauss-Newton on the sigmoid's three coefficients). */
export function upsample(rgb: readonly number[]): Spectrum {
  const white = xyzOf(() => 1);
  const target = SRGB_TO_XYZ.map((row, i) => ((row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2]) / (row[0] + row[1] + row[2])) * white[i]);
  let c = [0, 0, 0];
  for (let it = 0; it < 50; it++) {
    const r = xyzOf(sigmoidSpectrum(c)).map((v, i) => v - target[i]);
    if (Math.hypot(...r) < 1e-7) break;
    const J = [0, 1, 2].map((i) => [0, 1, 2].map((j) => {
      const moved = c.slice();
      moved[j] += 1e-4;
      return (xyzOf(sigmoidSpectrum(moved))[i] - target[i] - r[i]) / 1e-4;
    }));
    const step = solve3(J, r.map((v) => -v));
    c = c.map((v, i) => v + Math.max(-5, Math.min(5, step[i])));
  }
  return sigmoidSpectrum(c);
}

/**
 * The weights on linear R, G and B that best give R1-R6's catch from 400 nm
 * up, over a grid of colours from 0.05 to 0.95 in each channel, none below 0
 * (light can't take catch away), scaled to sum to 1 so that a white is 1.
 */
export function fitFlyRgb(sensitivity: Spectrum = rh1) {
  const rows: number[][] = [];
  const catches: number[] = [];
  for (let r = 0.05; r < 1; r += 0.15) {
    for (let g = 0.05; g < 1; g += 0.15) {
      for (let b = 0.05; b < 1; b += 0.15) {
        rows.push([r, g, b]);
        catches.push(catchOf(upsample([r, g, b]), 400, sensitivity));
      }
    }
  }
  // Least squares over the channels in `use`; a channel whose weight comes out negative is dropped and the rest refitted.
  const fit = (use: number[]): number[] => {
    const A = use.map((i) => use.map((j) => rows.reduce((s, x) => s + x[i] * x[j], 0)));
    const y = use.map((i) => rows.reduce((s, x, n) => s + x[i] * catches[n], 0));
    const w = use.length === 3 ? solve3(A, y) : [(y[0] * A[1][1] - y[1] * A[0][1]) / (A[0][0] * A[1][1] - A[0][1] ** 2), (y[1] * A[0][0] - y[0] * A[1][0]) / (A[0][0] * A[1][1] - A[0][1] ** 2)];
    const negative = w.findIndex((v) => v < 0);
    if (negative >= 0) return fit(use.filter((_, k) => k !== negative));
    const out = [0, 0, 0];
    use.forEach((i, k) => (out[i] = w[k]));
    return out;
  };
  const w = fit([0, 1, 2]);
  const rms = Math.sqrt(rows.reduce((s, x, n) => s + (w[0] * x[0] + w[1] * x[1] + w[2] * x[2] - catches[n]) ** 2, 0) / rows.length);
  const sum = w[0] + w[1] + w[2];
  return { weights: w.map((v) => v / sum) as [number, number, number], rms };
}

/** A curve through (nm, reflectance) points, flat beyond its ends. */
const curve = (points: readonly (readonly [number, number])[]): Spectrum => (l) => {
  if (l <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [a, ya] = points[i - 1];
    const [b, yb] = points[i];
    if (l <= b) return ya + ((yb - ya) * (l - a)) / (b - a);
  }
  return points[points.length - 1][1];
};

/** Rough reflectance curves of surfaces whose UV is known (see the header). */
export const SURFACES: Readonly<Record<string, Spectrum>> = {
  "light skin": curve([[300, 0.06], [350, 0.12], [400, 0.2], [450, 0.3], [500, 0.36], [540, 0.34], [560, 0.38], [575, 0.36], [600, 0.55], [650, 0.62], [700, 0.66]]),
  "dark skin": curve([[300, 0.04], [350, 0.05], [400, 0.06], [450, 0.08], [500, 0.11], [550, 0.13], [600, 0.2], [650, 0.27], [700, 0.33]]),
  "white paint (titanium dioxide)": curve([[300, 0.05], [370, 0.07], [390, 0.25], [410, 0.75], [430, 0.88], [700, 0.9]]),
  "white that reflects UV": curve([[300, 0.7], [400, 0.85], [700, 0.9]]),
};

/** R1-R6's sensitivity per photon in the eye, 1 at its peak, from Sharkey et al.'s Rh1 responses; `half`: the peak response as a fraction of the cell's maximum (0: as measured). */
export function measuredRh1(path: string, half: number): Spectrum {
  const rows = [...readXlsx(path).values()][0].filter((row) => Number(row[3]) > 0 || Number(row[14]) > 0);
  const short = new Map(rows.filter((r) => r[3]).map((r) => [Number(r[3]), Number(r[4])]));
  const long = new Map(rows.filter((r) => r[14]).map((r) => [Number(r[14]), Number(r[15])]));
  let ratio = 0;
  for (let l = 450; l <= 500; l += 5) ratio += long.get(l)! / short.get(l)! / 11;
  const response = new Map<number, number>();
  for (let l = 315; l <= 700; l += 5) response.set(l, l < 450 ? short.get(l)! * ratio : l <= 550 ? (short.get(l)! * ratio + long.get(l)!) / 2 : long.get(l)!);
  const peak = Math.max(...response.values());
  const sensitivity = new Map([...response].map(([l, v]) => [l, half ? (v / peak) * half / (1 - (v / peak) * half) : v / peak]));
  const top = Math.max(...sensitivity.values());
  return (l) => {
    if (l < 315 || l > 700) return 0;
    const below = Math.min(695, Math.floor(l / 5) * 5);
    const t = (l - below) / 5;
    return (sensitivity.get(below)! * (1 - t) + sensitivity.get(below + 5)! * t) / top;
  };
}

function main() {
  const { values } = parseArgs({ options: { sharkey: { type: "string" } } });
  const show = (w: readonly number[]) => w.map((v) => v.toFixed(2)).join(", ");
  console.log(`FLY_RGB now: ${show(FLY_RGB)}`);
  let sensitivity: Spectrum = rh1;
  if (values.sharkey) {
    sensitivity = measuredRh1(values.sharkey, 0.5);
    for (const half of [0.5, 0]) {
      const eye = measuredRh1(values.sharkey, half);
      const { weights, rms } = fitFlyRgb(eye);
      console.log(`In the eye (Sharkey et al. 2020, ${half ? "peak at half the maximum response" : "responses as measured"}): ${show(weights)} (rms ${rms.toFixed(3)}); sensitivity at 550 nm ${eye(550).toFixed(2)}, 600 nm ${eye(600).toFixed(2)}, 350 nm ${eye(350).toFixed(2)}`);
    }
  }
  for (const lambdaMax of [478, 486]) {
    const pigment = (l: number) => rh1(l, { ...RH1, lambdaMax });
    const { weights, rms } = fitFlyRgb(pigment);
    console.log(`The pigment alone, λmax ${lambdaMax} nm: ${show(weights)} (rms ${rms.toFixed(3)}); sensitivity at 550 nm ${(pigment(550) / pigment(lambdaMax)).toFixed(2)}, 600 nm ${(pigment(600) / pigment(lambdaMax)).toFixed(3)}`);
  }
  const uv = 1 - integrate((l) => sensitivity(l) * d65(l) * l, 400) / integrate((l) => sensitivity(l) * d65(l) * l);
  console.log(`\nBelow 400 nm: ${(uv * 100).toFixed(0)}% of R1-R6's catch from a white that reflects UV, in daylight`);
  console.log(`Catch as a fraction of a perfect white's (${values.sharkey ? "in the eye" : "the pigment, λmax 478 nm"}): with UV; from 400 nm up; FLY_RGB on the surface's sRGB colour`);
  const inverse = [[3.2406, -1.5372, -0.4986], [-0.9689, 1.8758, 0.0415], [0.0557, -0.204, 1.057]];
  const white = xyzOf(() => 1);
  for (const [name, surface] of Object.entries(SURFACES)) {
    const xyz = xyzOf(surface).map((v, i) => (v / white[i]) * [0.9505, 1, 1.089][i]);
    const rgb = inverse.map((row) => row[0] * xyz[0] + row[1] * xyz[1] + row[2] * xyz[2]);
    const fly = rgb.reduce((s, v, i) => s + v * FLY_RGB[i], 0);
    console.log(`  ${name.padEnd(32)} ${catchOf(surface, 300, sensitivity).toFixed(2)}  ${catchOf(surface, 400, sensitivity).toFixed(2)}  ${fly.toFixed(2)}`);
  }
}

if (import.meta.main) main();
