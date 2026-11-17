import { REFERENCES } from './references.ts';
import { distanceScore, mean } from './metrics.ts';

export type Measurements = Record<string, number | null | undefined>;

/** This is a preregistered engineering distance, not a statistical test of normality. */
export function comparisons(measured: Measurements) {
  return REFERENCES.map(reference => {
    const raw = reference.observable ? measured[reference.observable] : null;
    const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
    let score: number | null = null;
    if (reference.scoreRule && value !== null) {
      if (reference.scoreRule === 'probability-distance') {
        if (value < 0 || value > 1) throw new Error('probability outside [0,1]');
        // Total variation between two Bernoulli distributions has physical range [0,1].
        score = 10 * (1 - Math.abs(value - reference.value));
      } else score = distanceScore(value, reference.value, reference.tolerance!);
    }
    return { ...reference, measured: value, score, status: !reference.observable ? 'unsupported-biology' : !reference.scoreRule ? 'context-only-assay-mismatch' : value === null ? 'not-estimable' : 'optical-benchmark' };
  });
}

/** Missing domains leave bounds, rather than a deceptively precise whole-animal score. */
export function scorecard(measured: Measurements) {
  const rows = comparisons(measured);
  const scores = rows.flatMap(r => r.score === null ? [] : [r.score]);
  const sum = scores.reduce((a, b) => a + b, 0), missing = rows.length - scores.length;
  return { rows, opticalBenchmarkMean: mean(scores), scored: scores.length, registered: rows.length, overall: missing ? null : mean(scores), overallBounds: [sum / rows.length, (sum + 10 * missing) / rows.length], missing,
    interpretation: 'Bounds allow every unavailable comparison any score in [0,10]. No point estimate of whole-animal fidelity is identified. The optical subset uses idealized geometry and body reflexes; its score is an engineering benchmark, not biological validation.' };
}
