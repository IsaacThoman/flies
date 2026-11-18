// Where the body's walking turn gain comes from: the relation between the
// right-minus-left firing of DNa02 and how fast walking flies turn, fitted on
// the four paired recordings of Rayshubskiy et al. 2025 (eLife 13: RP102230;
// data doi:10.7910/DVN/0NCLP1). The protocol, what decides, and the results
// are in docs/ethogram/steering.md; this follows it step by step.
//
//   node packages/body/scripts/steering.ts [--data dir] [--out results.json]
//
// It downloads the recordings it lacks into --data (about 930 MB, not in git),
// checks each against its pinned digests, and prints the fit.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { readMat } from "./mat.ts";
import { agreement, boxcar, delayed, gapThreshold, highPass, line, linearFilter, lowPass, madScaled, median, peaks, readout, rises, spikesAbove } from "./steering-fit.ts";

/** The paired recordings, by the authors' names; MD5 as Dataverse publishes it, SHA-256 of the same bytes. */
const RECORDINGS = [
  { name: "a2_d_08", id: 11634638, md5: "f3d0d40d7435af8f3d4e73d004bd3f9d", sha256: "f02a345effb2fe722800dd1f43dce2c876878424307cb1fa486b5974f3d5922b" },
  { name: "a2_d_12", id: 11634639, md5: "71ed13ab29ecd3b3abcf7bf6b77940e4", sha256: "0f9a9251262f528f0b415d67cdb169bc1236a5157029ffeebace6d86136f60f7" },
  { name: "a2_d_13", id: 11634640, md5: "c3f95c76e9efc1a5b2277e7ee958143e", sha256: "a460eb313b503b039b3eeec554efd902b54119aadfd783c72210efaee2daee24" },
  { name: "a2_d_14", id: 11634641, md5: "eb0950ad281d61c4473404ea126b386a", sha256: "6e5aabc4bc45d76fd24baa81a9351cc6d29530c72e697038b78f07a0da36623f" },
] as const;
/** Decided before any fit (the last of the four in the authors' list). */
const HELD_OUT = "a2_d_14";

// The authors' final calibration against the files' older one (the secondary
// repository's import notebook; the primary's convert_yaw_to_degrees.m and
// convert_fwd_to_mms.m).
const YAW_SCALE = 0.000395 / 0.000436;
const FORWARD_SCALE = 0.0051 / 0.00636;

const STIM_ON_V = 4.5;
const STIM_AFTER_S = 0.25;
const DEPOLARIZED_MV = -33;
const MEDIAN_WINDOW_S = 0.04;
const HIGH_PASS_HZ = 100;
const MAD_WINDOW_S = 1;
const REFRACTORY_S = 0.002;
const RISE_WINDOW_S = 0.003;
const FORWARD_SMOOTHING_S = 0.25;
const WALKING_MM_S = 1;
const GRID_MS = Array.from({ length: 31 }, (_, i) => i * 10);
const MIN_BACKWARD_S = 30;
/** The body's present mapping, for comparison: rad/s at full `turn`, the share of it standing, smoothing (1/s), and Hz at full `turn`. */
const PRESENT = { rate: 3, standing: 0.35, smoothing: 12, full: 40 };

const { values } = parseArgs({
  options: {
    data: { type: "string", default: "packages/body/data/rayshubskiy-2025" },
    out: { type: "string" },
  },
});

const dataDir = resolve(values.data);
mkdirSync(dataDir, { recursive: true });

async function recording(r: (typeof RECORDINGS)[number]): Promise<Uint8Array> {
  const path = join(dataDir, `${r.name}.mat`);
  if (!existsSync(path)) {
    console.error(`downloading ${r.name} (Dataverse file ${r.id})`);
    const response = await fetch(`https://dataverse.harvard.edu/api/access/datafile/${r.id}`);
    if (!response.ok) throw new Error(`couldn't download ${r.name}: ${response.status} ${response.statusText}`);
    writeFileSync(`${path}.part`, new Uint8Array(await response.arrayBuffer()));
    renameSync(`${path}.part`, path);
  }
  const bytes = readFileSync(path);
  const md5 = createHash("md5").update(bytes).digest("hex");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (md5 !== r.md5 || sha256 !== r.sha256) throw new Error(`${path} isn't the published file (md5 ${md5}, sha256 ${sha256}); delete it to fetch it again`);
  return bytes;
}

type Cell = { threshold: number; spikes: Int32Array; counts: { low: number; at: number; high: number }; rate: number; walking: number; still: number; pass: boolean };

/**
 * The spikes above the threshold at the gap in `candidates`' heights, and the
 * protocol's three checks: the count holds within 10% when the threshold
 * moves 20% either way, the mean rate is 1 to 100 Hz, and the cell fires
 * faster walking forward than not. With `includedOnly`, everything is counted
 * over included time; without, over the whole recording, as the registered
 * detector was first run.
 */
function checked(candidates: { at: Int32Array; height: Float64Array }, low: number, high: number, bin: number, fs: number, per: number, use: Uint8Array, walking: Uint8Array, includedOnly: boolean): Cell {
  const { threshold } = gapThreshold(candidates.height, low, high, bin);
  const gap = Math.round(REFRACTORY_S * fs);
  const counted = (spikes: Int32Array) => (includedOnly ? spikes.filter((s) => use[Math.floor(s / per)] === 1) : spikes);
  const spikes = spikesAbove(candidates, threshold, gap);
  const at = counted(spikes).length;
  const below = counted(spikesAbove(candidates, threshold * 0.8, gap)).length;
  const above = counted(spikesAbove(candidates, threshold * 1.2, gap)).length;
  let walkSpikes = 0;
  let stillSpikes = 0;
  let walkSamples = 0;
  let stillSamples = 0;
  let included = 0;
  for (let i = 0; i < use.length; i++) {
    if (!use[i]) continue;
    included++;
    if (walking[i]) walkSamples++;
    else stillSamples++;
  }
  for (const s of spikes) {
    const i = Math.floor(s / per);
    if (i >= use.length || !use[i]) continue;
    if (walking[i]) walkSpikes++;
    else stillSpikes++;
  }
  const ballDt = per / fs;
  const rate = at / ((includedOnly ? included : use.length) * ballDt);
  const walkingRate = walkSpikes / (walkSamples * ballDt);
  const stillRate = stillSpikes / (stillSamples * ballDt);
  const pass = Math.abs(below - at) / at < 0.1 && Math.abs(above - at) / at < 0.1 && rate >= 1 && rate <= 100 && walkingRate > stillRate;
  return { threshold, spikes, counts: { low: below, at, high: above }, rate, walking: walkingRate, still: stillRate, pass };
}

/** The protocol's detector as registered: heights in running-MAD units of the 100 Hz high-passed voltage. */
function registered(voltage: Float64Array, fs: number, per: number, use: Uint8Array, walking: Uint8Array): Cell {
  const z = madScaled(highPass(voltage, HIGH_PASS_HZ, fs), Math.round(MAD_WINDOW_S * fs));
  return checked(peaks(z, 2.5), 4, 20, 0.25, fs, per, use, walking, false);
}

/** The amended detector: heights in millivolts of the raw voltage, over included time. */
function amended(voltage: Float64Array, fs: number, per: number, use: Uint8Array, walking: Uint8Array): Cell {
  const candidates = rises(voltage, Math.round(RISE_WINDOW_S * fs), (i) => use[Math.floor(i / per)] === 1);
  return checked(candidates, 1, 15, 0.25, fs, per, use, walking, true);
}

type Fly = {
  name: string;
  seconds: number;
  excluded: number;
  left: Cell;
  right: Cell;
  registered: { left: Cell; right: Cell };
  delta: Float64Array;
  mean: Float64Array;
  deltaCounts: Float64Array;
  yaw: Float64Array;
  forward: Float64Array;
  use: { walking: Uint8Array; still: Uint8Array; backward: Uint8Array };
};

async function load(r: (typeof RECORDINGS)[number]): Promise<Fly> {
  const mat = readMat(await recording(r), (name) => ["ephys_A", "ephys_B", "stim", "fwd", "yaw", "t_ball", "ball_SR", "ephys_SR"].includes(name));
  const get = (name: string) => {
    const v = mat.get(name);
    if (!v) throw new Error(`${r.name} has no ${name}`);
    return v.data;
  };
  const fs = get("ephys_SR")[0];
  const ballFs = get("ball_SR")[0];
  const left = get("ephys_A");
  const right = get("ephys_B");
  const stim = get("stim");
  const times = get("t_ball");
  const n = times.length;
  const per = fs / ballFs;
  if (left.length !== n * per || right.length !== n * per || stim.length !== n * per) throw new Error(`${r.name}: channel lengths disagree`);

  const include = new Uint8Array(n).fill(1);
  // The stimulus channel at 5 V, and 0.25 s after it (the authors' get_non_stim_inds).
  const after = Math.round(STIM_AFTER_S * ballFs);
  let lastOn = -Infinity;
  for (let i = 0; i < n; i++) {
    let on = false;
    for (let k = i * per; k < (i + 1) * per && !on; k++) on = stim[k] >= STIM_ON_V;
    if (on) lastOn = i;
    if (i - lastOn <= after) include[i] = 0;
  }
  // Any second in which either cell sits above −33 mV, read as 40 ms medians (spikes are briefer).
  const window = Math.round(MEDIAN_WINDOW_S * fs);
  const second = Math.round(fs);
  for (let from = 0; from + window <= left.length; from += window) {
    if (median(left, from, from + window) <= DEPOLARIZED_MV && median(right, from, from + window) <= DEPOLARIZED_MV) continue;
    const s = Math.floor(from / second);
    for (let i = s * ballFs; i < Math.min(n, (s + 1) * ballFs); i++) include[i] = 0;
  }

  const forward = boxcar(Float64Array.from(get("fwd"), (v) => v * FORWARD_SCALE), Math.round(FORWARD_SMOOTHING_S * ballFs) | 1);
  const yaw = Float64Array.from(get("yaw"), (v) => v * YAW_SCALE);
  const walking = new Uint8Array(n);
  const still = new Uint8Array(n);
  const backward = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!include[i]) continue;
    if (forward[i] > WALKING_MM_S) walking[i] = 1;
    else if (forward[i] < -WALKING_MM_S) backward[i] = 1;
    else still[i] = 1;
  }
  const l = amended(left, fs, per, include, walking);
  const rr = amended(right, fs, per, include, walking);
  const asRegistered = { left: registered(left, fs, per, include, walking), right: registered(right, fs, per, include, walking) };
  const rateL = readout(l.spikes, fs, times);
  const rateR = readout(rr.spikes, fs, times);
  const delta = Float64Array.from(rateR, (v, i) => v - rateL[i]);
  const mean = Float64Array.from(rateR, (v, i) => (v + rateL[i]) / 2);
  const deltaCounts = new Float64Array(n);
  for (const s of rr.spikes) if (Math.floor(s / per) < n) deltaCounts[Math.floor(s / per)] += ballFs;
  for (const s of l.spikes) if (Math.floor(s / per) < n) deltaCounts[Math.floor(s / per)] -= ballFs;
  let excluded = 0;
  for (const v of include) if (!v) excluded++;
  return { name: r.name, seconds: n / ballFs, excluded: excluded / ballFs, left: l, right: rr, registered: asRegistered, delta, mean, deltaCounts, yaw, forward, use: { walking, still, backward } };
}

const flies: Fly[] = [];
for (const r of RECORDINGS) {
  const fly = await load(r);
  flies.push(fly);
  const c = (x: Cell) => `θ ${x.threshold.toFixed(2)}, ${x.counts.at} spikes (${x.counts.low} at 0.8θ, ${x.counts.high} at 1.2θ), ${x.rate.toFixed(1)} Hz, walking ${x.walking.toFixed(1)} / not ${x.still.toFixed(1)} Hz, ${x.pass ? "pass" : "FAIL"}`;
  console.log(`${fly.name}: ${(fly.seconds / 60).toFixed(1)} min, ${fly.excluded.toFixed(0)} s excluded`);
  console.log(`  registered detector: left  ${c(fly.registered.left)}`);
  console.log(`                       right ${c(fly.registered.right)}`);
  console.log(`  amended detector:    left  ${c(fly.left)}`);
  console.log(`                       right ${c(fly.right)}`);
}
const passing = flies.filter((f) => f.left.pass && f.right.pass);
const passingAsRegistered = flies.filter((f) => f.registered.left.pass && f.registered.right.pass).map((f) => f.name);
const BALL_FS = 100;

// Which way is right: the sign that makes Δ and yaw agree overall, as the
// paper's ipsilateral steering says they do; the files don't state it.
let n = 0;
let sx = 0;
let sy = 0;
let sxy = 0;
for (const f of passing) {
  for (let i = 0; i < f.yaw.length; i++) {
    if (!(f.use.walking[i] || f.use.still[i] || f.use.backward[i])) continue;
    n++;
    sx += f.delta[i];
    sy += f.yaw[i];
    sxy += f.delta[i] * f.yaw[i];
  }
}
const covariance = sxy / n - (sx / n) * (sy / n);
const sign = covariance >= 0 ? 1 : -1;
for (const f of flies) for (let i = 0; i < f.yaw.length; i++) f.yaw[i] *= sign;

type Grid = { slope: Float64Array; intercept: Float64Array; r2: Float64Array };
const grid = (f: Fly, use: Uint8Array): Grid => {
  const size = GRID_MS.length;
  const g = { slope: new Float64Array(size * size), intercept: new Float64Array(size * size), r2: new Float64Array(size * size) };
  for (let a = 0; a < size; a++) {
    const filtered = lowPass(f.delta, GRID_MS[a], BALL_FS);
    for (let b = 0; b < size; b++) {
      const fit = line(filtered, f.yaw, use, Math.round((GRID_MS[b] * BALL_FS) / 1000));
      g.slope[a * size + b] = fit.slope;
      g.intercept[a * size + b] = fit.intercept;
      g.r2[a * size + b] = fit.r2;
    }
  }
  return g;
};
const walkingGrids = new Map(passing.map((f) => [f.name, grid(f, f.use.walking)]));
const stillGrids = new Map(passing.map((f) => [f.name, grid(f, f.use.still)]));

const meanOf = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const sdOf = (xs: number[]) => Math.sqrt(xs.reduce((s, x) => s + (x - meanOf(xs)) ** 2, 0) / (xs.length - 1));

function train(names: string[]) {
  const size = GRID_MS.length;
  let best = 0;
  let bestR2 = -Infinity;
  for (let k = 0; k < size * size; k++) {
    const r2 = meanOf(names.map((n) => walkingGrids.get(n)!.r2[k]));
    if (r2 > bestR2) {
      bestR2 = r2;
      best = k;
    }
  }
  return {
    tau: GRID_MS[Math.floor(best / size)],
    delay: GRID_MS[best % size],
    trainingR2: bestR2,
    walking: meanOf(names.map((n) => walkingGrids.get(n)!.slope[best])),
    still: meanOf(names.map((n) => stillGrids.get(n)!.slope[best])),
    index: best,
  };
}

function predict(f: Fly, gain: number, tau: number, delay: number) {
  const out = delayed(lowPass(f.delta, tau, BALL_FS), Math.round((delay * BALL_FS) / 1000));
  return Float64Array.from(out, (v) => v * gain);
}

function present(f: Fly, standing: boolean) {
  const command = Float64Array.from(f.delta, (v) => Math.max(-1, Math.min(1, v / PRESENT.full)));
  const smoothed = lowPass(command, 1000 / PRESENT.smoothing, BALL_FS);
  const degrees = (PRESENT.rate * 180) / Math.PI * (standing ? PRESENT.standing : 1);
  return Float64Array.from(smoothed, (v) => v * degrees);
}

const folds = passing.map((held) => {
  const fit = train(passing.filter((f) => f !== held).map((f) => f.name));
  return {
    heldOut: held.name,
    ...fit,
    walking: { gain: fit.walking, ...agreement(predict(held, fit.walking, fit.tau, fit.delay), held.yaw, held.use.walking) },
    still: { gain: fit.still, ...agreement(predict(held, fit.still, fit.tau, fit.delay), held.yaw, held.use.still) },
    presentWalking: agreement(present(held, false), held.yaw, held.use.walking),
    presentStill: agreement(present(held, true), held.yaw, held.use.still),
  };
});

const all = train(passing.map((f) => f.name));
const summary = (c: Cell) => ({ threshold: c.threshold, spikes: c.counts, rate: c.rate, walking: c.walking, still: c.still, pass: c.pass });
const perFly = passing.map((f) => {
  const w = walkingGrids.get(f.name)!;
  const s = stillGrids.get(f.name)!;
  const backSeconds = f.use.backward.reduce((n, v) => n + v, 0) / BALL_FS;
  const back = backSeconds >= MIN_BACKWARD_S ? line(lowPass(f.delta, all.tau, BALL_FS), f.yaw, f.use.backward, Math.round((all.delay * BALL_FS) / 1000)) : null;
  // Cross-correlation of Δ and yaw (yaw `lag` samples later) while walking.
  let peakLag = 0;
  let peakR = -Infinity;
  for (let lag = -50; lag <= 100; lag++) {
    const fit = lag >= 0 ? line(f.delta, f.yaw, f.use.walking, lag) : line(f.yaw, f.delta, f.use.walking, -lag);
    const r = Math.sign(fit.slope) * Math.sqrt(fit.r2);
    if (r > peakR) {
      peakR = r;
      peakLag = lag;
    }
  }
  const h = linearFilter(f.deltaCounts, f.yaw, f.use.walking, -50, 100);
  let peak = 0;
  for (let k = 0; k < h.length; k++) if (Math.abs(h[k]) > Math.abs(h[peak])) peak = k;
  let opposite = 0;
  for (let k = peak + 1; k < h.length; k++) if (Math.sign(h[k]) !== Math.sign(h[peak])) opposite = Math.max(opposite, Math.abs(h[k]));
  const speed = line(f.mean, f.forward, f.use.walking);
  return {
    name: f.name,
    minutes: f.seconds / 60,
    excludedSeconds: f.excluded,
    walkingSeconds: f.use.walking.reduce((n, v) => n + v, 0) / BALL_FS,
    stillSeconds: f.use.still.reduce((n, v) => n + v, 0) / BALL_FS,
    backwardSeconds: backSeconds,
    cells: Object.fromEntries((["left", "right"] as const).map((side) => [side, summary(f[side])])),
    registeredCells: Object.fromEntries((["left", "right"] as const).map((side) => [side, summary(f.registered[side])])),
    unfiltered: { slope: w.slope[0], intercept: w.intercept[0], r2: w.r2[0] },
    atChosen: { walking: { slope: w.slope[all.index], intercept: w.intercept[all.index], r2: w.r2[all.index] }, still: { slope: s.slope[all.index], r2: s.r2[all.index] }, backward: back },
    crossCorrelation: { lagMs: peakLag * 10, r: peakR },
    filter: { peakLagMs: (peak - 50) * 10, peak: h[peak], biphasic: opposite >= 0.2 * Math.abs(h[peak]), oppositeLobe: opposite, sustainedGain: h.reduce((s, v) => s + v, 0) },
    forwardOnMeanRate: { slope: speed.slope, r: Math.sign(speed.slope) * Math.sqrt(speed.r2) },
  };
});

const walkingSlopes = perFly.map((f) => f.atChosen.walking.slope);
const stillSlopes = perFly.map((f) => f.atChosen.still.slope);
const cv = (xs: number[]) => sdOf(xs) / Math.abs(meanOf(xs));
const sameSign = (xs: number[]) => xs.every((x) => Math.sign(x) === Math.sign(xs[0]));
const primary = folds.find((f) => f.heldOut === HELD_OUT);
const d3 = (a: { r2: number; calibration: number } | undefined) => !!a && a.r2 >= 0.2 && a.calibration >= 0.67 && a.calibration <= 1.5;
const decision = {
  D1AsRegistered: passingAsRegistered.length >= 3,
  passingAsRegistered,
  D1: passing.length >= 3,
  D2: passing.length >= 2 && sameSign(walkingSlopes) && cv(walkingSlopes) <= 0.5,
  D3: d3(primary?.walking),
  still: { D2: passing.length >= 2 && sameSign(stillSlopes) && cv(stillSlopes) <= 0.5, D3: d3(primary?.still) },
};

const report = {
  source: "Rayshubskiy et al. 2025, eLife 13: RP102230; data doi:10.7910/DVN/0NCLP1",
  yawSign: sign,
  scales: { yaw: YAW_SCALE, forward: FORWARD_SCALE },
  perFly,
  betweenFlies: { walking: { mean: meanOf(walkingSlopes), sd: sdOf(walkingSlopes), cv: cv(walkingSlopes) }, still: { mean: meanOf(stillSlopes), sd: sdOf(stillSlopes), cv: cv(stillSlopes) } },
  allPassing: { recordings: passing.map((f) => f.name), tau: all.tau, delay: all.delay, trainingR2: all.trainingR2, walking: all.walking, still: all.still, walkingOnFileUnits: all.walking / YAW_SCALE },
  folds,
  decision,
};

const f = (x: number, d = 2) => x.toFixed(d);
console.log(`\nyaw sign ${sign > 0 ? "as in the files" : "flipped"}; rightward positive from here`);
for (const p of perFly) {
  console.log(`${p.name}: walking ${f(p.walkingSeconds, 0)} s, not ${f(p.stillSeconds, 0)} s, backward ${f(p.backwardSeconds, 0)} s`);
  console.log(`  unfiltered slope ${f(p.unfiltered.slope)} °/s per Hz (R² ${f(p.unfiltered.r2)}); at τ ${all.tau} ms, d ${all.delay} ms: walking ${f(p.atChosen.walking.slope)} (R² ${f(p.atChosen.walking.r2)}, bias ${f(p.atChosen.walking.intercept, 1)} °/s), not walking ${f(p.atChosen.still.slope)} (R² ${f(p.atChosen.still.r2)})${p.atChosen.backward ? `, backward ${f(p.atChosen.backward.slope)} (R² ${f(p.atChosen.backward.r2)})` : ""}`);
  console.log(`  cross-correlation peak ${p.crossCorrelation.lagMs} ms (r ${f(p.crossCorrelation.r)}); filter peak ${p.filter.peakLagMs} ms, ${p.filter.biphasic ? "biphasic" : "monophasic"}, sustained gain ${f(p.filter.sustainedGain)} °/s per Hz`);
  console.log(`  forward speed on mean DNa02 rate while walking: ${f(p.forwardOnMeanRate.slope, 3)} mm/s per Hz, r ${f(p.forwardOnMeanRate.r)}`);
}
console.log(`\nbetween flies, walking slope ${f(report.betweenFlies.walking.mean)} ± ${f(report.betweenFlies.walking.sd)} (CV ${f(report.betweenFlies.walking.cv)}); not walking ${f(report.betweenFlies.still.mean)} ± ${f(report.betweenFlies.still.sd)} (CV ${f(report.betweenFlies.still.cv)})`);
for (const fold of folds) {
  console.log(`held out ${fold.heldOut}: τ ${fold.tau} ms, d ${fold.delay} ms, gain ${f(fold.walking.gain)} → R² ${f(fold.walking.r2)}, b ${f(fold.walking.calibration)}; not walking gain ${f(fold.still.gain)} → R² ${f(fold.still.r2)}, b ${f(fold.still.calibration)}; present mapping R² ${f(fold.presentWalking.r2)}, b ${f(fold.presentWalking.calibration)} (not walking R² ${f(fold.presentStill.r2)}, b ${f(fold.presentStill.calibration)})`);
}
console.log(`\nall passing (${passing.length}): τ ${all.tau} ms, d ${all.delay} ms, walking ${f(all.walking, 3)} °/s per Hz (${f((all.walking * Math.PI) / 180, 5)} rad/s per Hz; files' units ${f(all.walking / YAW_SCALE, 3)}), not walking ${f(all.still, 3)}`);
console.log(`decision: D1 as registered ${decision.D1AsRegistered} (${passingAsRegistered.join(", ") || "none"} pass); amended D1 ${decision.D1}, D2 ${decision.D2}, D3 ${decision.D3}; not walking: D2 ${decision.still.D2}, D3 ${decision.still.D3}`);
if (values.out) writeFileSync(values.out, JSON.stringify(report, null, 2));
