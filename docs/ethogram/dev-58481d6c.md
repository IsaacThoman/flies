# Current dev 58481d6c — continuous first-flight assay

Clock held at 6 h; sunrise 06:00, sunset 18:00. No validated whole-animal point score is identified. Optical scores are limited engineering comparisons; unmatched and unsupported metrics remain N/A.

InternalState uses stochastic arousal and per-eye scene backgrounds, outside the connectome, to drive spontaneous activity.
The body supplies edge avoidance and wall escape, tarsal flight support, grooming-pose persistence, and alignment to food after a neural feeding command.
Airborne duration and grooming display occupancy include those body mechanisms; this audit does not attribute them to additional neural decisions.

| Metric | Literature value (reported spread) | Measured | Benchmark /10 | Source |
|---|---:|---|---|---|
| Walking speed median (mm/s) | 20 | 9.6500 | N/A | [Katsov et al. (2017)](https://doi.org/10.7554/eLife.26410), Table 4, Katsov row (2.0 cm/s) |
| Time walking (fraction) | 0.54 (±0.17) | 0.5454 | N/A | [Cruz et al. (2021)](https://pmc.ncbi.nlm.nih.gov/articles/PMC8556163/), STAR Methods, Unsupervised segmentation of movement dynamics, opening paragraph |
| Walk bout mean (s) | 22.6195 (±12.6052) | 1.8812 | N/A | [Paulk et al. (2013)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4868374/), Table 1, No Electrode |
| Walk bout frequency (1/s) | 0.0482 (±0.0039) | 0.2292 | N/A | [Paulk et al. (2013)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4868374/), Table 1, No Electrode |
| Saccade duration median (ms) | 90 | N/A | N/A | [Geurten et al. (2014)](https://doi.org/10.3389/fnbeh.2014.00365), Figure 1G and Results, Walking Drosophila perform saccades |
| Peak-centred saccade angle mean (deg) | 15 | N/A | N/A | [Geurten et al. (2014)](https://doi.org/10.3389/fnbeh.2014.00365), Figure 1F (100 ms window) |
| Yeast sip duration mode (s) | 0.13 | N/A | N/A | [Itskov et al. (2014)](https://doi.org/10.1038/ncomms5560), Figure 5a |
| Sucrose sip duration mode (s) | 0.16 | N/A | N/A | [Itskov et al. (2014)](https://doi.org/10.1038/ncomms5560), Figure 5c |
| Yeast inter-sip interval mode (s) | 0.08 | N/A | N/A | [Itskov et al. (2014)](https://doi.org/10.1038/ncomms5560), Figure 5b |
| Sucrose inter-sip interval mode (s) | 0.07 | N/A | N/A | [Itskov et al. (2014)](https://doi.org/10.1038/ncomms5560), Figure 5d |
| Sips per burst, fed (sips) | 5.8 | N/A | N/A | [Itskov et al. (2014)](https://doi.org/10.1038/ncomms5560), Figure 6b |
| Sips per burst, 8 h deprived (sips) | 8.3 | N/A | N/A | [Itskov et al. (2014)](https://doi.org/10.1038/ncomms5560), Figure 6b |
| Inter-burst interval, fed (s) | 78 | N/A | N/A | [Itskov et al. (2014)](https://doi.org/10.1038/ncomms5560), Figure 6c |
| Inter-burst interval, 4 h deprived (s) | 29 | N/A | N/A | [Itskov et al. (2014)](https://doi.org/10.1038/ncomms5560), Figure 6c |
| Black-square jump-and-flight probability (fraction) | 0.82 | 0.9167 | 9.03 | [Fotowat et al. (2009)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3817277/), Results, Looming stimuli evoke reliable jump and flight after reaching a fixed angular threshold size |
| Checkerboard jump-and-flight probability (fraction) | 0.87 | 0.5417 | 6.72 | [Fotowat et al. (2009)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3817277/), Results, Looming is sufficient to trigger escape; Figure 3 |
| Black-square TTC–l/v slope (ms/ms) | 2 (±0.2) | 1.5874 | 0.00 | [Fotowat et al. (2009)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3817277/), Figure 2 caption |
| Black-square TTC intercept (ms) | -6 (±11) | -30.8595 | 0.00 | [Fotowat et al. (2009)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3817277/), Figure 2 caption |
| Checkerboard TTC–l/v slope (ms/ms) | 2.1 (±0.1) | 1.4236 | 0.00 | [Fotowat et al. (2009)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3817277/), Results, Looming is sufficient to trigger escape; Figure 3 |
| Checkerboard TTC intercept (ms) | -22 (±5) | -60.2175 | 0.00 | [Fotowat et al. (2009)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3817277/), Results, Looming is sufficient to trigger escape; Figure 3 |
| WT light-off jump-and-flight probability (fraction) | 0 | 1.0000 | N/A | [Fotowat et al. (2009)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3817277/), Results, Light-off and looming stimuli evoke distinct behaviors in white-eyed flies, opening paragraph |

Black square: 44/48 eligible responses; 0/48 readiness failures; model Wilson 95% interval 0.804–0.967; timing fit 44 successes across 6 l/v values, slope SE 0.200, intercept SE 8.201 ms.

Checkerboard: 26/48 eligible responses; 0/48 readiness failures; model Wilson 95% interval 0.403–0.674; timing fit 26 successes across 6 l/v values, slope SE 0.186, intercept SE 8.472 ms.

Flash surrogate: 8/8 eligible responses; 0/8 readiness failures; model Wilson 95% interval 0.676–1.000; timing fit N/A.

Blank: 0/8 eligible responses; 0/8 readiness failures; model Wilson 95% interval 0.000–0.324; timing fit N/A.

Optical probability mean: **7.88/10**; timing mean **0.00/10**; equal probability/timing composite **3.94/10**. 6/21 registered comparisons estimable. Whole-animal score: **N/A**. Registry-average bounds **0.75–7.89/10** describe only these rows, not biological fidelity or confidence intervals.

Seed 1: 1.0000 recorded hours; 624.8 CPU seconds.

Full sample counts, trial denominators, readiness failures, censoring, assay blockers and uncertainty labels are in JSON.

FlyEM male CNS connectome, Janelia Research Campus (CC-BY 4.0).


## Independent seed cohort

The second fixed cohort uses seeds 30000–30111 under the same protocol and
production source. It is a stochastic replication of one connectome, not a
second anatomical population. All attempts met readiness; no direct loom input
was supplied.

| Measurement | Seeds 20000–20111 | Seeds 30000–30111 |
|---|---:|---:|
| Black-square jump-and-flight | 44/48 | 44/48 |
| Checkerboard jump-and-flight | 26/48 | 27/48 |
| Flash surrogate (unscored) | 8/8 | 8/8 |
| Blank | 0/8 | 0/8 |
| Optical probability score | 7.8750/10 | 7.9792/10 |
| Optical timing score | 0.0000/10 | 1.4930/10 |
| Supported optical composite | 3.9375/10 | 4.7361/10 |

The score difference is sampling variation, not a code improvement. Both
cohorts estimate all six optical reference comparisons. The remaining 15
registry conditions are unsupported or context only. A validated whole-fly
point score is still unidentified. The composite is an engineering utility,
not a biological normality test: timing uses explicitly labelled reported fit
spread, whose SD/SE interpretation conflicts within the source paper.

## Free behaviour and provenance

Runtime source `be6bc708`, clean tree, rebased on dev `58481d6c`; production
brain/body/world/Life source matches that dev byte-for-byte. Replication source
`747c909e` differs only in documentation. The packed connectome SHA-256 is
`51c97031b39f93c04a683f16683d88f15d291f1e1062694fc0a215e23c3b895c`.

The free observation is one seed, 60 s burn-in + 3600 s recorded, in a 43 mm
open disc with uniform luminance 0.5 and no food/dust. Clock held at 06:00,
sunrise 06:00, sunset 18:00; natural sleep pressure and the existing accelerated
metabolic clock. CPU 624.79 s; wall 935.68 s including lease scheduling.

| Diagnostic | Observation |
|---|---:|
| Translation occupancy | 43.111% |
| Translation or rotation occupancy | 54.541% |
| Moving speed p10 / median / p90 | 6.65 / 9.65 / 12.25 mm/s |
| Mean / median complete walk bout | 1.881 / 1.010 s |
| Complete walking bouts | 825 |
| Mean / median complete stop bout | 2.477 / 1.100 s |
| Complete stopping bouts | 824 |
| Head-grooming display occupancy | 0.000% |
| Antenna-bump time >0.05 | 0.00 s |
| Outer-half-area grounded occupancy | 69.164% |
| Body ground yaw differing from intent | 69.28 s |
| Sleep / feeding / airborne / takeoffs / saccades | 0 observed |

Grooming and phantom bump fell from the historical 84.87% / 91.02% to zero
after upstream work including [antenna contact #114](https://github.com/IsaacThoman/flies/pull/114).
Other upstream changes also landed; this is not an isolated causal comparison
and no gain is attributed to this branch. Zero spontaneous grooming in a clean
arena is not claimed as a validated biological target or hierarchy.

## Endpoint integrity

Schema 3 requires ten consecutive 5 ms powered airborne frames in the first
airborne episode. A landing ends that episode; later jumps cannot qualify the
first departure. Every observed jump in these cohorts met the condition: 78
and 79 jumps/flights including controls, with minimum qualifying runs 0.24
and 0.25 s. No observed outcome changes when replacing the weaker cumulative
criterion here; disconnected intervals are nevertheless rejected in tests.
Neither the body tarsal reflex nor the flash surrogate is concealed as neural
flight or a condition-matched LED assay. Replay also rejects takeoffs beyond
the recorded response window and continuous durations beyond the available
follow-up. Both cohorts pass that stricter gate unchanged. Frame-level power
traces are not retained; reviewers could check the recorded maximum and
tracker tests, but could not reconstruct continuity from raw frames. Raw
records remain outside git.

## Rejected mapping and checks

The literature-based launch-angle candidate did not change any of 112 paired
optical response/timing outcomes on the historical dev snapshot. All three
blind reviewers preferred the control (mean 6.625 versus 6.167). It is reverted;
there is no accepted production body/brain change. See [review log](review-log.md)
and [calibration limits](calibration.md).

Current full functional tests: 998 passed, zero failed, two optional-data/SDK
skips. Lint and typecheck passed. The full budget run passed two cases and
skipped two because the host was contended; skips are not passes. An unchanged
dev control failed the all-senses case at **0.585 versus 0.500 CPU s/s**. The
same production code also measured 0.273 and passed in another run. Historical
branch/control values (0.520/0.546 and 0.502/0.400) are retained in the review
record. A later dedicated budget run passed three cases and skipped brain
cost after the contention reference exceeded 4.8 ms on three attempts
(4.88/4.90/4.87 ms). No bound was relaxed and no idle-machine reproduction
is claimed. The farm run and final review results are recorded in `review-log.md`.


## Final rebase and review scope

The final branch is rebased onto dev `7b69740e`. Compared with the actual
measurement base `58481d6c`, no brain/body/world source changed. `Life` gained
companion support (a mutable driver, set-down helper, and pantry-update flag
that defaults true); the solo, no-food assay still follows the same path.
These observations retain their original runtime hashes and are not relabelled
as new runs on the later rebase.

Three final blind reviewers independently reproduced both scorecards and
confirmed the source values. Their mean four-criterion rubric score was
**5.7083/10**, versus **5.3333** for the cumulative estimator, and they preferred
the continuous estimator. The identical decoy received identical scores.
Broad behaviour stayed **2/10** for every version. A fresh regression-only
reviewer gave the continuous estimator **8/10**, found the capture-window
validation gap, and that small follow-up is now covered by tests (25 focused
passes). See `review-log.md` for all keys, per-reviewer scores and limitations.
