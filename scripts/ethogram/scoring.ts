import { REFERENCES } from './references.ts';
import { distanceScore, mean } from './metrics.ts';
import { LV_MS, SCREEN, loomGeometry, summarizeEscape } from './escape.ts';
import type { EscapeTrial } from './escape.ts';

export type Measurements = Record<string, unknown>;
export type OpticalEvidence = { protocol: { hour: number; perRatio: number; firstSeed: number; lvMs: readonly number[]; screen: typeof SCREEN }; trials: readonly EscapeTrial[] };

/** Scalars alone cannot establish that the optical assay was actually run. */
export function validateOpticalEvidence(e: OpticalEvidence) {
  const p = e.protocol;
  if (!p || !Number.isFinite(p.hour) || p.hour < 0 || p.hour >= 24 || !Number.isInteger(p.perRatio) || p.perRatio < 1 || p.perRatio > 100) throw new Error('invalid optical protocol');
  if (JSON.stringify(p.lvMs) !== JSON.stringify(LV_MS) || Object.keys(SCREEN).some(k => p.screen?.[k as keyof typeof SCREEN] !== SCREEN[k as keyof typeof SCREEN])) throw new Error('optical geometry differs from registered protocol');
  if (!Number.isInteger(p.firstSeed) || p.firstSeed < 0 || p.firstSeed + 14 * p.perRatio > 0x100000000 || e.trials.length !== 14 * p.perRatio) throw new Error('incomplete optical trial battery');
  const seen = new Set<number>();
  for (const t of e.trials) {
    if (!Number.isInteger(t.seed) || seen.has(t.seed) || t.seed < p.firstSeed || t.seed >= p.firstSeed + e.trials.length) throw new Error('invalid or duplicate optical trial seed');
    seen.add(t.seed);
    if (typeof t.eligible !== 'boolean' || typeof t.flown !== 'boolean' || t.hour !== p.hour || !Number.isFinite(t.quietWaitSeconds) || t.quietWaitSeconds < 0 || !Number.isFinite(t.maxEscape) || t.maxLoomInput !== 0 || (t.eligible && t.quietWaitSeconds < 3)) throw new Error('invalid optical readiness, clock or sensory route');
    if (t.takeoffMs !== null && (!t.eligible || !Number.isFinite(t.takeoffMs) || t.takeoffMs < 0)) throw new Error('invalid takeoff observation');
    if (t.flown && t.takeoffMs === null) throw new Error('flight has no takeoff observation');
    if (t.kind === 'black' || t.kind === 'checkerboard') {
      if (!LV_MS.includes(t.lvMs as typeof LV_MS[number])) throw new Error('unregistered expansion rate');
      if (t.takeoffMs !== null && (t.ttcMs === null || !Number.isFinite(t.ttcMs) || Math.abs(t.ttcMs - (loomGeometry(t.lvMs).collisionSeconds * 1000 - t.takeoffMs)) > 1e-6)) throw new Error('TTC inconsistent with stimulus and takeoff');
      if (t.takeoffMs === null && t.ttcMs !== null) throw new Error('TTC supplied for a nonresponse');
    } else if (!['flash', 'blank'].includes(t.kind) || t.lvMs !== 40 || t.ttcMs !== null) throw new Error('invalid control trial');
  }
  for (const kind of ['black', 'checkerboard', 'flash', 'blank'] as const) for (const lv of kind === 'black' || kind === 'checkerboard' ? LV_MS : [40]) {
    if (e.trials.filter(t => t.kind === kind && t.lvMs === lv).length !== p.perRatio) throw new Error('incomplete optical condition grid');
  }
}

function rows(measured: Measurements, optical: boolean) {
  return REFERENCES.map(reference => {
    const raw = reference.observable ? measured[reference.observable] : null;
    const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
    let score: number | null = null;
    if (optical && reference.scoreRule && value !== null) {
      if (reference.scoreRule === 'probability-distance') {
        // Total variation between two Bernoulli distributions has physical range [0,1].
        score = 10 * (1 - Math.abs(value - reference.value));
      } else score = distanceScore(value, reference.value, reference.tolerance!);
    }
    return { ...reference, measured: value, score, status: !reference.observable ? 'unsupported-biology' : !reference.scoreRule ? 'context-only-assay-mismatch' : !optical ? 'no-trial-evidence' : value === null ? 'not-estimable' : 'optical-benchmark' };
  });
}

export function comparisons(measured: Measurements) { return rows(measured, false); }

/** Recompute optical estimates from complete raw trials; never trust supplied coefficients. */
export function scorecard(measured: Measurements, evidence?: OpticalEvidence | null) {
  if (evidence) validateOpticalEvidence(evidence);
  const optical = evidence ? summarizeEscape(evidence.trials) : null;
  // A caller cannot smuggle optical scalars into the free-behaviour measurement object.
  const free = Object.fromEntries(Object.entries(measured).filter(([k]) => !k.startsWith('escape')));
  const compared = rows({ ...free, ...optical?.values }, optical !== null);
  const scores = compared.flatMap(r => r.score === null ? [] : [r.score]);
  const sum = scores.reduce((a, b) => a + b, 0), missing = compared.length - scores.length;
  const probability = compared.filter(r => r.scoreRule === 'probability-distance').map(r => r.score);
  const timing = compared.filter(r => r.scoreRule === 'reported-fit-scale').map(r => r.score);
  const probabilityMean = probability.every(s => s !== null) ? mean(probability as number[]) : null;
  const timingMean = timing.every(s => s !== null) ? mean(timing as number[]) : null;
  return { rows: compared, opticalProbabilityMean: probabilityMean, opticalTimingMean: timingMean,
    opticalComposite: probabilityMean !== null && timingMean !== null ? (probabilityMean + timingMean) / 2 : null,
    scored: scores.length, registered: compared.length, overall: null,
    registeredComparisonBounds: [sum / compared.length, (sum + 10 * missing) / compared.length], missing,
    coverage: { walking: 'context only', turning: 'context only', exploration: 'diagnostics only', grooming: 'diagnostics only', feeding: 'unsupported sip biology', escape: optical ? 'optical engineering benchmark' : 'not run', flight: 'body-maintained, unmatched', airPuff: 'not run', optomotor: 'not run' },
    interpretation: 'No whole-animal point score or bounds are identified. Registry-average bounds allow unavailable rows [0,10] and are not biological fidelity bounds. Optical composite gives equal weight to probability and timing, requires both patterns and all fits, and remains a limited engineering comparison.' };
}
